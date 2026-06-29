// ── Algorithme glouton hotspot — tous candidats + centroid convergent ────────
//
// Fix 1 : chaque adresse est testee comme centre candidat
// Fix 2 : centroid convergent (max 5 iterations) -> zones plus denses
// Fix 3 : rayon adaptatif (jusqu'à 3x R) pour zones rurales peu denses
//
// Scoring (v2) :
//   - type_batiment_bdnb (BDNB) prioritaire sur type_bien (BAN)
//   - maison = 1.0 | appartement = poids_collectif (0 par défaut) | tertiaire = 0
//   - has_dpe = présence d'un DPE quelque soit la note (signal de transaction)

export interface GeoPoint {
  id:                  string
  lat:                 number
  lon:                 number
  prospectable:        boolean
  code_insee?:         string
  type_bien?:          string          // BAN (fallback)
  type_batiment_bdnb?: string          // BDNB: 'maison' | 'appartement' | 'tertiaire' | null
  has_dpe?:            boolean         // Présence d'un DPE (signal de transaction, toute note)
  dvf_score?:          number          // Nb transactions DVF à proximité (pré-calculé)
  // Champs legacy conservés pour compatibilité
  dpe_chauds?:         number
  dpe_tiedes?:         number
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
  poids:           number   // 0..2 (0% a 200%) — poids du signal DPE dans le score
  seuil_inclusion: number
  poids_collectif: number   // 0..1 — ponderation habitat collectif (0 = exclu)
}

// Retourne le poids de prospection d'une adresse selon son type de bâtiment.
// Priorité : type BDNB > type BAN > inconnu (traité comme maison)
function getPoidsHabitat(p: GeoPoint, poidsCollectif: number): number {
  const type = (p.type_batiment_bdnb ?? p.type_bien ?? 'inconnu').toLowerCase()
  if (type === 'maison' || type === 'inconnu') return 1.0
  if (type === 'appartement')                  return poidsCollectif
  // tertiaire, commerce, logement_social, industriel → exclu de la prospection
  return 0
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
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10, poids_collectif: 0 },
  dvfPoids:       number    = 0
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  const poidsCollectif = dpeParams.poids_collectif ?? 0
  const rayonMax       = rayon_metres * 3
  const seuilExt       = Math.max(Math.floor(capacite_cible * 0.3), 5)
  const avgLat         = points.reduce((s, p) => s + p.lat, 0) / points.length
  const cosLat         = Math.cos(avgLat * Math.PI / 180)
  const mPerDegLat     = 111000
  const mPerDegLon     = 111000 * cosLat

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

  function convergeZone(
    initCenter: { lat: number; lon: number },
    pool: GeoPoint[],
    r2: number,
  ): { pts: GeoPoint[]; centroid: { lat: number; lon: number } } {
    let c = initCenter
    let pts: GeoPoint[] = []

    for (let iter = 0; iter < 5; iter++) {
      const sorted = pool
        .filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= r2)
        .map(p => ({ p, d: distSq(c.lat, c.lon, p.lat, p.lon) }))
        .sort((a, b) => a.d - b.d)

      const inR: GeoPoint[] = []
      let capaciteConsommee = 0
      for (const { p } of sorted) {
        const w = getPoidsHabitat(p, poidsCollectif)
        if (w === 0) continue  // type exclu — ne consomme pas de capacité, ignoré
        if (capaciteConsommee + w > capacite_cible + 0.5) break
        inR.push(p)
        capaciteConsommee += w
      }

      if (inR.length === 0) break

      const newC = calcCentroid(inR)
      const moved = Math.sqrt(distSq(c.lat, c.lon, newC.lat, newC.lon))
      pts = inR
      c   = newC
      if (moved < 5) break
    }

    const finalPts = pts.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= r2)
    return { pts: finalPts, centroid: c }
  }

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

    for (const cand of remaining) {
      const neighbors = getNeighbors(hash, cand.lat, cand.lon)
      const inR = neighbors.filter(p => distSq(cand.lat, cand.lon, p.lat, p.lon) <= R2init)

      // Densité pondérée : maison=1.0, appartement=poids_collectif, tertiaire=0
      const densite = inR.reduce((s, p) => s + getPoidsHabitat(p, poidsCollectif), 0)

      // Signal DPE : présence d'un DPE, toute note confondue (indicateur de transaction)
      const nbDpe = inR.filter(p => p.has_dpe || (p.dpe_chauds ?? 0) > 0 || (p.dpe_tiedes ?? 0) > 0).length

      // Signal DVF : adresses avec au moins 1 transaction DVF à proximité
      const nbDvf = dvfPoids > 0 ? inR.filter(p => (p.dvf_score ?? 0) > 0).length : 0

      const score = (inR.length > 0 ? densite : 0.5) + nbDpe * dpeParams.poids + nbDvf * dvfPoids

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
