// ── Algorithme glouton hotspot avec rayon adaptatif ──────────────────────────
//
// Principe :
//   1. Scorer chaque centre candidat avec le rayon configure (R initial)
//   2. Prendre le meilleur centre
//   3. Creer la zone avec rayon adaptatif :
//      - Partir de R initial
//      - Si trop peu d'adresses → etendre jusqu'a rayon_max (3x R)
//      - Creer la zone avec le rayon effectivement utilise
//   4. Toujours creer une zone meme en zone rurale peu dense
//
// Performance : hash spatial O(N), < 2s pour 10 000 adresses

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
  rayon_metres:   number,    // rayon cible (peut etre etendu automatiquement)
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  // Rayon max = 3x le rayon configure (limite absolue d'extension)
  const rayonMax = rayon_metres * 3

  // Seuil min d'adresses avant d'etendre le rayon
  const seuilExtension = Math.max(Math.floor(capacite_cible * 0.3), 5)

  const avgLat     = points.reduce((s, p) => s + p.lat, 0) / points.length
  const cosLat     = Math.cos(avgLat * Math.PI / 180)
  const mPerDegLat = 111000
  const mPerDegLon = 111000 * cosLat

  // Distance euclidienne au carre en metres
  function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dlat = (lat2 - lat1) * mPerDegLat
    const dlon = (lon2 - lon1) * mPerDegLon
    return dlat * dlat + dlon * dlon
  }

  // Hash spatial : bucket = R/2 pour le scoring initial
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

  // Recuperer les voisins dans un rayon donne (5x5 buckets = couvre R avec bucket R/2)
  function getNeighbors(h: Map<string, GeoPoint[]>, lat: number, lon: number): GeoPoint[] {
    const [bi, bj] = bucketIJ(lat, lon)
    const out: GeoPoint[] = []
    for (let di = -2; di <= 2; di++)
      for (let dj = -2; dj <= 2; dj++) {
        const b = h.get(`${bi+di},${bj+dj}`)
        if (b) out.push(...b)
      }
    return out
  }

  // Un candidat representant par cellule (evite de scorer le meme hotspot N fois)
  function getCandidates(pts: GeoPoint[]): GeoPoint[] {
    const seen = new Set<string>()
    const out:  GeoPoint[] = []
    for (const p of pts) {
      const [bi, bj] = bucketIJ(p.lat, p.lon)
      const k = `${bi},${bj}`
      if (!seen.has(k)) { seen.add(k); out.push(p) }
    }
    return out
  }

  // Creer une zone avec rayon adaptatif depuis un centre donne
  // Etend progressivement jusqu'a avoir assez d'adresses ou atteindre rayonMax
  function createZoneAdaptive(
    center: { lat: number; lon: number },
    pool:   GeoPoint[],
    rayonInitial: number,
    rayonInitialConfigured: number
  ): DensityZone | null {

    // Paliers d'extension : R → 1.5R → 2R → 3R
    const paliers = [1.0, 1.5, 2.0, 3.0].map(f => Math.min(f * rayonInitial, rayonMax))

    let bestPts:     GeoPoint[] = []
    let bestRayon:   number     = rayonInitial
    let bestCentroid             = center

    for (const r of paliers) {
      const r2 = r * r

      // Scanner toutes les adresses restantes pour ce rayon
      const inR = pool.filter(p => distSq(center.lat, center.lon, p.lat, p.lon) <= r2)
      if (inR.length === 0) continue

      // Prendre jusqu'a capacite_cible (les plus proches du centre candidat)
      const sorted = inR
        .map(p => ({ p, d: distSq(center.lat, center.lon, p.lat, p.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, capacite_cible)
        .map(x => x.p)

      // Recalculer le vrai centroid
      const c = calcCentroid(sorted)

      // Appliquer la limite dure depuis le vrai centroid
      const finalPts = sorted.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= r2)
      if (finalPts.length === 0) continue

      bestPts      = finalPts
      bestRayon    = r
      bestCentroid = c

      // Si on a atteint le seuil ou le dernier palier : on s'arrete
      if (finalPts.length >= seuilExtension || r >= rayonMax) break
    }

    if (bestPts.length === 0) return null

    const rayonReel = Math.round(
      Math.max(...bestPts.map(p => haversine(bestCentroid.lat, bestCentroid.lon, p.lat, p.lon)))
    )

    return {
      centroid:        bestCentroid,
      points:          bestPts,
      rayon_metres:    rayonReel,
      depasse_seuil:   bestRayon > rayonInitialConfigured,  // true si on a du etendre
      dpe_prioritaire: false,
      nb_dpe_chauds:   bestPts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0),
      nb_dpe_tiedes:   bestPts.reduce((s, p) => s + (p.dpe_tiedes ?? 0), 0),
    }
  }

  // ── Boucle gloutonne principale ─────────────────────────────────────────────
  let remaining = [...points]
  const zones:  DensityZone[] = []

  while (zones.length < nb_zones && remaining.length > 0) {

    // ── Phase 1 : Scoring avec le rayon initial ────────────────────────────
    const hash       = buildHash(remaining)
    const candidates = getCandidates(remaining)
    const R2initial  = rayon_metres * rayon_metres

    let bestScore    = -1
    let bestCenter:  { lat: number; lon: number } | null = null

    for (const cand of candidates) {
      const neighbors = getNeighbors(hash, cand.lat, cand.lon)
      const inR = neighbors.filter(p => distSq(cand.lat, cand.lon, p.lat, p.lon) <= R2initial)

      // Si le rayon initial est vide, inclure quand meme ce candidat avec score minimal
      // pour qu'il soit considere lors de l'extension adaptative
      const effLength = inR.length > 0 ? inR.length : 1
      const dpe = inR.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0)
      const score = (inR.length > 0 ? inR.length : 0.1) + dpe * dpeParams.poids

      if (score > bestScore) {
        bestScore  = score
        bestCenter = { lat: cand.lat, lon: cand.lon }
      }
    }

    if (!bestCenter) break

    // ── Phase 2 : Creer la zone avec rayon adaptatif ───────────────────────
    const zone = createZoneAdaptive(bestCenter, remaining, rayon_metres, rayon_metres)

    if (!zone || zone.points.length === 0) break

    // Retirer les adresses selectionnees
    const usedIds = new Set(zone.points.map(p => p.id))
    remaining = remaining.filter(p => !usedIds.has(p.id))

    zones.push(zone)
  }

  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
