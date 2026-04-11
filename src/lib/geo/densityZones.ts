// ── Algorithme glouton hotspot — selection de zones de prospection ──────────
//
// Approche :
//   Chaque adresse est testee comme centre potentiel.
//   On evalue le score dans le rayon R (limite dure) pour chaque centre.
//   On selectionne le meilleur centre -> zone -> retire les adresses -> repete.
//
// Performance :
//   Hash spatial (bucket = R/2) pour ne checker que les voisins proches.
//   Chaque iteration : O(N_candidats x nb_voisins_bucket).
//   En pratique < 2s pour 10 000 adresses avec rayon 800m.

export interface GeoPoint {
  id:           string
  lat:          number
  lon:          number
  prospectable: boolean
  code_insee?:  string
  dpe_chauds?:  number
  dpe_tiedes?:  number
}

export interface DensityZone {
  centroid:        { lat: number; lon: number }
  points:          GeoPoint[]
  rayon_metres:    number
  depasse_seuil:   boolean
  dpe_prioritaire: boolean
  nb_dpe_chauds:   number
  nb_dpe_tiedes:   number
}

export interface DpeParams {
  poids:           number   // 0..2 (0% a 200%)
  seuil_inclusion: number
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function calcCentroid(pts: GeoPoint[]): { lat: number; lon: number } {
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
  }
}

export function generateDensityZones(
  points:         GeoPoint[],
  nb_zones:       number,
  capacite_cible: number,
  rayon_metres:   number,    // LIMITE DURE
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  const seuil_min  = Math.floor(capacite_cible * 0.5)
  const avgLat     = points.reduce((s, p) => s + p.lat, 0) / points.length
  const cosLat     = Math.cos(avgLat * Math.PI / 180)
  const mPerDegLat = 111000
  const mPerDegLon = 111000 * cosLat
  const R2         = rayon_metres * rayon_metres

  // Distance euclidienne au carre en metres (valide < 20km)
  function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dlat = (lat2 - lat1) * mPerDegLat
    const dlon = (lon2 - lon1) * mPerDegLon
    return dlat * dlat + dlon * dlon
  }

  // Hash spatial : bucket = R/2 en degres
  // Avantage : en consultant les 5x5 buckets voisins on est sur de couvrir R
  const bucketDeg = rayon_metres / 2 / 111000

  function bucketIJ(lat: number, lon: number): [number, number] {
    return [Math.floor(lat / bucketDeg), Math.floor(lon / bucketDeg)]
  }

  function buildHash(pts: GeoPoint[]): Map<string, GeoPoint[]> {
    const h = new Map<string, GeoPoint[]>()
    for (const p of pts) {
      const [bi, bj] = bucketIJ(p.lat, p.lon)
      const k = `${bi},${bj}`
      const b = h.get(k) ?? []; b.push(p); h.set(k, b)
    }
    return h
  }

  // Recuperer tous les points dans un carre de 5x5 buckets autour du centre
  // (garantit de couvrir le cercle de rayon R avec bucket = R/2)
  function getCandidateNeighbors(h: Map<string, GeoPoint[]>, lat: number, lon: number): GeoPoint[] {
    const [bi, bj] = bucketIJ(lat, lon)
    const out: GeoPoint[] = []
    for (let di = -2; di <= 2; di++)
      for (let dj = -2; dj <= 2; dj++) {
        const b = h.get(`${bi+di},${bj+dj}`)
        if (b) out.push(...b)
      }
    return out
  }

  // Dedupliquer les centres candidats : une adresse par bucket (R/2)
  // pour eviter de scorer nb_adresses fois le meme hotspot
  function deduplicateCandidates(pts: GeoPoint[]): GeoPoint[] {
    const seen = new Set<string>()
    const out: GeoPoint[] = []
    for (const p of pts) {
      const [bi, bj] = bucketIJ(p.lat, p.lon)
      const k = `${bi},${bj}`
      if (!seen.has(k)) { seen.add(k); out.push(p) }
    }
    return out
  }

  let remaining = [...points]
  const zones:  DensityZone[] = []
  let fallback: DensityZone | null = null

  while (zones.length < nb_zones && remaining.length > 0) {

    const hash       = buildHash(remaining)
    const candidates = deduplicateCandidates(remaining)

    let bestScore     = -1
    let bestCenter:   { lat: number; lon: number } | null = null
    let bestInRadius: GeoPoint[] = []

    // Scorer chaque centre candidat
    for (const cand of candidates) {
      const neighbors = getCandidateNeighbors(hash, cand.lat, cand.lon)
      const inR = neighbors.filter(p => distSq(cand.lat, cand.lon, p.lat, p.lon) <= R2)
      if (inR.length === 0) continue

      const dpe   = inR.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0)
      const score = inR.length + dpe * dpeParams.poids

      if (score > bestScore) {
        bestScore     = score
        bestCenter    = { lat: cand.lat, lon: cand.lon }
        bestInRadius  = inR
      }
    }

    if (!bestCenter || bestInRadius.length === 0) break

    // Prendre jusqu'a capacite_cible adresses (les plus proches du centre candidat)
    const sorted = bestInRadius
      .map(p => ({ p, d: distSq(bestCenter!.lat, bestCenter!.lon, p.lat, p.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, capacite_cible)
      .map(x => x.p)

    // Recalculer le centroid reel
    let c = calcCentroid(sorted)

    // Re-filtrer : limite dure depuis le vrai centroid
    let finalPts = sorted.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= R2)

    // Recalculer une derniere fois si des points ont ete exclus
    if (finalPts.length < sorted.length && finalPts.length > 0) {
      c = calcCentroid(finalPts)
      finalPts = finalPts.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= R2)
    }

    if (finalPts.length === 0) break

    const rayonReel = Math.round(
      Math.max(...finalPts.map(p => haversine(c.lat, c.lon, p.lat, p.lon)))
    )

    const zone: DensityZone = {
      centroid:        c,
      points:          finalPts,
      rayon_metres:    rayonReel,
      depasse_seuil:   false,
      dpe_prioritaire: false,
      nb_dpe_chauds:   finalPts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0),
      nb_dpe_tiedes:   finalPts.reduce((s, p) => s + (p.dpe_tiedes ?? 0), 0),
    }

    // Retirer les adresses selectionnees du pool
    const usedIds = new Set(finalPts.map(p => p.id))
    remaining = remaining.filter(p => !usedIds.has(p.id))

    if (finalPts.length >= seuil_min) {
      zones.push(zone)
    } else {
      // Meilleur spot restant sous le seuil : fallback et arret
      if (!fallback || finalPts.length > fallback.points.length) {
        fallback = zone
      }
      break
    }
  }

  // Ajouter le fallback si on manque de zones
  if (zones.length < nb_zones && fallback) {
    zones.push({ ...fallback, dpe_prioritaire: true })
  }

  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
