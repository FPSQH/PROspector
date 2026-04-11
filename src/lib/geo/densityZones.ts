// ── Algorithme glouton hotspot — tous candidats + centroid convergent ────────
//
// Fix 1 : chaque adresse est testee comme centre candidat (pas de déduplication)
//         -> meilleure detection des pics de densité réels
// Fix 2 : centroid convergent (max 5 iterations) -> zones plus denses
// Fix 3 : rayon adaptatif (jusqu'à 3x R) pour zones rurales peu denses

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
  rayon_metres:   number,
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  const rayonMax   = rayon_metres * 3
  const seuilExt   = Math.max(Math.floor(capacite_cible * 0.3), 5)
  const avgLat     = points.reduce((s, p) => s + p.lat, 0) / points.length
  const cosLat     = Math.cos(avgLat * Math.PI / 180)
  const mPerDegLat = 111000
  const mPerDegLon = 111000 * cosLat

  function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dlat = (lat2 - lat1) * mPerDegLat
    const dlon = (lon2 - lon1) * mPerDegLon
    return dlat * dlat + dlon * dlon
  }

  // Hash spatial : bucket = R/2
  const bucketDeg = rayon_metres / 2 / 111000

  function bucketKey(lat: number, lon: number): string {
    return Math.floor(lat / bucketDeg) + ',' + Math.floor(lon / bucketDeg)
  }

  function buildHash(pts: GeoPoint[]): Map<string, GeoPoint[]> {
    const h = new Map<string, GeoPoint[]>()
    for (const p of pts) {
      const k = bucketKey(p.lat, p.lon)
      const b = h.get(k) ?? []; b.push(p); h.set(k, b)
    }
    return h
  }

  // Voisins dans 5x5 buckets (garantit de couvrir le cercle de rayon R avec bucket R/2)
  function getNeighbors(h: Map<string, GeoPoint[]>, lat: number, lon: number): GeoPoint[] {
    const bi = Math.floor(lat / bucketDeg)
    const bj = Math.floor(lon / bucketDeg)
    const out: GeoPoint[] = []
    for (let di = -2; di <= 2; di++)
      for (let dj = -2; dj <= 2; dj++) {
        const b = h.get((bi+di) + ',' + (bj+dj))
        if (b) out.push(...b)
      }
    return out
  }

  // FIX 2 : Convergence du centroid (max 5 passes)
  function convergeZone(
    initCenter: { lat: number; lon: number },
    pool: GeoPoint[],
    r2: number
  ): { pts: GeoPoint[]; centroid: { lat: number; lon: number } } {
    let c = initCenter
    let pts: GeoPoint[] = []

    for (let iter = 0; iter < 5; iter++) {
      // Filtrer les adresses dans le rayon depuis c
      const inR = pool
        .filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= r2)
        .map(p => ({ p, d: distSq(c.lat, c.lon, p.lat, p.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, capacite_cible)
        .map(x => x.p)

      if (inR.length === 0) break

      const newC = calcCentroid(inR)
      // Verifier si le centroid a bouge significativement (< 5m = stable)
      const moved = Math.sqrt(distSq(c.lat, c.lon, newC.lat, newC.lon))
      pts = inR
      c   = newC
      if (moved < 5) break
    }

    // Appliquer la limite dure depuis le centroid final
    const finalPts = pts.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= r2)
    return { pts: finalPts, centroid: c }
  }

  // Creer une zone avec rayon adaptatif depuis un centre initial
  function createZoneAdaptive(
    initCenter: { lat: number; lon: number },
    pool: GeoPoint[],
  ): DensityZone | null {
    const paliers = [1.0, 1.5, 2.0, 3.0].map(f => Math.min(f * rayon_metres, rayonMax))

    for (const r of paliers) {
      const { pts, centroid: c } = convergeZone(initCenter, pool, r * r)
      if (pts.length === 0) continue
      if (pts.length >= seuilExt || r >= rayonMax) {
        const rayonReel = Math.round(Math.max(...pts.map(p => haversine(c.lat, c.lon, p.lat, p.lon))))
        return {
          centroid:        c,
          points:          pts,
          rayon_metres:    rayonReel,
          depasse_seuil:   r > rayon_metres,
          dpe_prioritaire: false,
          nb_dpe_chauds:   pts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0),
          nb_dpe_tiedes:   pts.reduce((s, p) => s + (p.dpe_tiedes ?? 0), 0),
        }
      }
    }
    return null
  }

  // ── Boucle gloutonne ─────────────────────────────────────────────────────
  let remaining = [...points]
  const zones:  DensityZone[] = []

  while (zones.length < nb_zones && remaining.length > 0) {

    const hash   = buildHash(remaining)
    const R2init = rayon_metres * rayon_metres

    let bestScore  = -1
    let bestCenter: { lat: number; lon: number } | null = null

    // FIX 1 : tester TOUTES les adresses comme centre candidat
    for (const cand of remaining) {
      const neighbors = getNeighbors(hash, cand.lat, cand.lon)
      const inR = neighbors.filter(p => distSq(cand.lat, cand.lon, p.lat, p.lon) <= R2init)

      const dpe   = inR.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0)
      // Si aucune adresse dans le rayon initial, compter quand meme le candidat lui-meme
      const score = (inR.length > 0 ? inR.length : 0.5) + dpe * dpeParams.poids

      if (score > bestScore) {
        bestScore  = score
        bestCenter = { lat: cand.lat, lon: cand.lon }
      }
    }

    if (!bestCenter) break

    const zone = createZoneAdaptive(bestCenter, remaining)
    if (!zone || zone.points.length === 0) break

    const usedIds = new Set(zone.points.map(p => p.id))
    remaining = remaining.filter(p => !usedIds.has(p.id))

    zones.push(zone)
  }

  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
