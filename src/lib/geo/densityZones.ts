// ── Algorithme glouton hotspot — optimise pour Vercel 10s ───────────────────
//
// Optimisation cle : on ne parcourt PAS une grille de candidats vide.
// On utilise directement les adresses comme centres candidats potentiels
// (echantillonnees via un hash spatial pour reduire les doublons).
// Pour chaque centre candidat on evalue le score dans le rayon R.
// Complexite : O(N x voisins) par iteration au lieu de O(grille x N).

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

// Haversine pour le rayon final affiche
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
  rayon_metres:   number,
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  const seuil_min = Math.floor(capacite_cible * 0.5)

  // Constantes geographiques
  const avgLat     = points.reduce((s, p) => s + p.lat, 0) / points.length
  const cosLat     = Math.cos(avgLat * Math.PI / 180)
  const mPerDegLat = 111000
  const mPerDegLon = 111000 * cosLat
  const R2         = rayon_metres * rayon_metres
  const rayonDeg   = rayon_metres / 111000

  // Distance euclidienne au carre (metres) — rapide, valide < 10km
  function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dlat = (lat2 - lat1) * mPerDegLat
    const dlon = (lon2 - lon1) * mPerDegLon
    return dlat * dlat + dlon * dlon
  }

  // ── Hash spatial : taille de bucket = rayon ────────────────────────────────
  // Chaque centre candidat consulte les 9 buckets adjacents.
  // On reconstruit le hash a chaque iteration (O(N), rapide).
  function buildHash(pts: GeoPoint[]): Map<string, GeoPoint[]> {
    const h = new Map<string, GeoPoint[]>()
    for (const p of pts) {
      const bi = Math.floor(p.lat / rayonDeg)
      const bj = Math.floor(p.lon / rayonDeg)
      const k  = `${bi},${bj}`
      const b  = h.get(k) ?? []; b.push(p); h.set(k, b)
    }
    return h
  }

  function getNeighbors(h: Map<string, GeoPoint[]>, lat: number, lon: number): GeoPoint[] {
    const bi = Math.floor(lat / rayonDeg)
    const bj = Math.floor(lon / rayonDeg)
    const out: GeoPoint[] = []
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const b = h.get(`${bi+di},${bj+dj}`)
        if (b) out.push(...b)
      }
    return out
  }

  // ── Echantillonnage des centres candidats ──────────────────────────────────
  // Plutot que parcourir une grille vide, on prend une adresse representante
  // par cellule du hash (le "chef de file" de chaque bucket).
  // Cela reduit N candidats a ~N/densite_bucket candidats uniques.
  function getCandidateCenters(pts: GeoPoint[]): GeoPoint[] {
    const seen = new Set<string>()
    const centers: GeoPoint[] = []
    for (const p of pts) {
      const bi = Math.floor(p.lat / rayonDeg)
      const bj = Math.floor(p.lon / rayonDeg)
      const k  = `${bi},${bj}`
      if (!seen.has(k)) { seen.add(k); centers.push(p) }
    }
    return centers
  }

  // ── Boucle gloutonne ───────────────────────────────────────────────────────
  let remaining = [...points]
  const zones:  DensityZone[] = []
  let fallback: DensityZone | null = null

  while (zones.length < nb_zones && remaining.length > 0) {

    const hash      = buildHash(remaining)
    const candidates = getCandidateCenters(remaining)

    let bestScore    = -1
    let bestCenter:  { lat: number; lon: number } | null = null
    let bestInRadius: GeoPoint[] = []

    // Scorer chaque centre candidat
    for (const cand of candidates) {
      const neighbors = getNeighbors(hash, cand.lat, cand.lon)
      const inR = neighbors.filter(p => distSq(cand.lat, cand.lon, p.lat, p.lon) <= R2)
      if (inR.length === 0) continue

      const dpe   = inR.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0)
      const score = inR.length + dpe * dpeParams.poids

      if (score > bestScore) {
        bestScore    = score
        bestCenter   = { lat: cand.lat, lon: cand.lon }
        bestInRadius = inR
      }
    }

    if (!bestCenter || bestInRadius.length === 0) break

    // Prendre jusqu'a capacite_cible adresses — les plus proches du meilleur centre
    const sorted = bestInRadius
      .map(p => ({ p, d: distSq(bestCenter!.lat, bestCenter!.lon, p.lat, p.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, capacite_cible)
      .map(x => x.p)

    // Recalculer le centroid reel
    let c = calcCentroid(sorted)

    // Re-filtrer : conserver uniquement les adresses dans R depuis le vrai centroid
    let finalPts = sorted.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= R2)

    // Recalculer une derniere fois si des points ont ete exclus
    if (finalPts.length < sorted.length && finalPts.length > 0) {
      c = calcCentroid(finalPts)
      finalPts = finalPts.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= R2)
    }

    if (finalPts.length === 0) break

    // Rayon reel affiche (haversine sur le point le plus eloigne)
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

    // Retirer les adresses du pool dans tous les cas
    const usedIds = new Set(finalPts.map(p => p.id))
    remaining = remaining.filter(p => !usedIds.has(p.id))

    if (finalPts.length >= seuil_min) {
      zones.push(zone)
    } else {
      // Meilleur spot restant sous le seuil -> fallback et arret
      if (!fallback || finalPts.length > fallback.points.length) {
        fallback = zone
      }
      break
    }
  }

  // Ajouter le fallback si on n'a pas atteint nb_zones
  if (zones.length < nb_zones && fallback) {
    zones.push({ ...fallback, dpe_prioritaire: true })
  }

  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
