// ─── Algorithme density-based pour zones de prospection ──────────────────
// Logique :
//  1. Grille de densite -> trouver les N pics (zones les plus denses)
//     Le score integre : nb adresses + bonus DPE pondere
//  2. Expansion depuis chaque pic -> K adresses les plus proches
//  3. Passe de rattrapage DPE -> communes a fort signal DPE garanties
//  4. rayon_alerte = seuil d'information uniquement

export interface GeoPoint {
  id:           string
  lat:          number
  lon:          number
  prospectable: boolean
  code_insee?:  string
  dpe_chauds?:  number
  dpe_tièdes?:  number
}

export interface DensityZone {
  centroid:        { lat: number; lon: number }
  points:          GeoPoint[]
  rayon_metres:    number
  depasse_seuil:   boolean
  dpe_prioritaire: boolean
  nb_dpe_chauds:   number
  nb_dpe_tièdes:   number
}

export interface DpeParams {
  poids:           number
  seuil_inclusion: number
}

// Distance haversine en metres
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Etape 1 : Grille de densite avec score composite (adresses + DPE)
function buildDensityGrid(
  points: GeoPoint[],
  cellSizeDeg: number,
  dpeParams: DpeParams
): Map<string, { lat: number; lon: number; score: number; dpeChauds: number; dpeTièdes: number; count: number }> {
  const grid = new Map<string, { lat: number; lon: number; count: number; dpeChauds: number; dpeTièdes: number }>()

  for (const p of points) {
    const gLat = Math.floor(p.lat / cellSizeDeg) * cellSizeDeg + cellSizeDeg / 2
    const gLon = Math.floor(p.lon / cellSizeDeg) * cellSizeDeg + cellSizeDeg / 2
    const key  = `${gLat.toFixed(5)},${gLon.toFixed(5)}`
    const cell = grid.get(key) ?? { lat: gLat, lon: gLon, count: 0, dpeChauds: 0, dpeTièdes: 0 }
    cell.count++
    cell.dpeChauds  += p.dpe_chauds  ?? 0
    cell.dpeTièdes  += p.dpe_tièdes  ?? 0
    grid.set(key, cell)
  }

  const result = new Map<string, { lat: number; lon: number; score: number; dpeChauds: number; dpeTièdes: number; count: number }>()
  for (const [key, cell] of grid) {
    const bonusDpe = dpeParams.poids * (cell.dpeChauds * 2 + cell.dpeTièdes * 1)
    result.set(key, {
      lat:       cell.lat,
      lon:       cell.lon,
      score:     cell.count + bonusDpe,
      count:     cell.count,
      dpeChauds: cell.dpeChauds,
      dpeTièdes: cell.dpeTièdes,
    })
  }
  return result
}

// Etape 2 : Selectionner les N meilleurs pics bien espaces
// minDistDeg calcule depuis l'etendue reelle des donnees, pas depuis cellSizeDeg
function selectPeaks(
  grid: Map<string, { lat: number; lon: number; score: number; dpeChauds: number; dpeTièdes: number; count: number }>,
  nb_zones: number,
  minDistDeg: number
): Array<{ lat: number; lon: number; score: number }> {
  const sorted = [...grid.values()].sort((a, b) => b.score - a.score)
  const peaks: Array<{ lat: number; lon: number; score: number }> = []

  for (const cell of sorted) {
    if (peaks.length >= nb_zones) break
    const tooClose = peaks.some(p =>
      Math.sqrt((p.lat - cell.lat)**2 + (p.lon - cell.lon)**2) < minDistDeg
    )
    if (!tooClose) peaks.push(cell)
  }

  // Si pas assez de pics -> relaxer la contrainte progressivement
  if (peaks.length < nb_zones) {
    let relaxed = minDistDeg * 0.6
    while (peaks.length < nb_zones && relaxed > 0.001) {
      for (const cell of sorted) {
        if (peaks.length >= nb_zones) break
        if (peaks.some(p => p.lat === cell.lat && p.lon === cell.lon)) continue
        const tooClose = peaks.some(p =>
          Math.sqrt((p.lat - cell.lat)**2 + (p.lon - cell.lon)**2) < relaxed
        )
        if (!tooClose) peaks.push(cell)
      }
      relaxed *= 0.6
    }
  }

  return peaks
}

// Etape 3 : Assigner chaque point au pic le plus proche et limiter a capacite
function expandZones(
  peaks: Array<{ lat: number; lon: number; score: number }>,
  points: GeoPoint[],
  capacite: number
): GeoPoint[][] {
  const assigned: GeoPoint[][] = peaks.map(() => [])

  for (const p of points) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < peaks.length; i++) {
      const d = haversine(p.lat, p.lon, peaks[i].lat, peaks[i].lon)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    assigned[bestIdx].push(p)
  }

  // Limiter a la capacite cible (garder les plus proches du centroid)
  return assigned.map((zone, i) => {
    if (zone.length <= capacite) return zone
    return zone
      .map(p => ({ p, d: haversine(p.lat, p.lon, peaks[i].lat, peaks[i].lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, capacite)
      .map(x => x.p)
  })
}

// Calculer le centroid et rayon d'une zone
function buildZone(pts: GeoPoint[], rayon_alerte: number, prioritaire = false): DensityZone {
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length
  const rayon = pts.length > 1
    ? Math.max(...pts.map(p => haversine(lat, lon, p.lat, p.lon)))
    : 0
  return {
    centroid:        { lat, lon },
    points:          pts,
    rayon_metres:    Math.round(rayon),
    depasse_seuil:   rayon > rayon_alerte,
    dpe_prioritaire: prioritaire,
    nb_dpe_chauds:   pts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0),
    nb_dpe_tièdes:   pts.reduce((s, p) => s + (p.dpe_tièdes ?? 0), 0),
  }
}

// ── Fonction principale ──────────────────────────────────────────────────────
export function generateDensityZones(
  points:         GeoPoint[],
  nb_zones:       number,
  capacite_cible: number,
  rayon_alerte:   number,
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  // Calculer l'etendue geographique reelle des points
  const lats = points.map(p => p.lat)
  const lons = points.map(p => p.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const latRange = latMax - latMin
  const lonRange = lonMax - lonMin

  // cellSizeDeg : divise la zone en ~(nb_zones * 8) cellules
  // Cible ~8 cellules par zone pour avoir assez de granularite
  const area = latRange * lonRange
  const nbCibles = nb_zones * 8
  const cellSizeDeg = Math.max(
    Math.sqrt(area / nbCibles),
    0.005  // minimum 500m environ
  )

  // minDistDeg entre pics : espacement naturel si les zones etaient disposees en grille
  // = cote de la grille / sqrt(nb_zones) avec facteur 0.6 pour autoriser du chevauchement
  const minDistDeg = Math.min(latRange, lonRange) / Math.sqrt(nb_zones) * 0.6

  const grid  = buildDensityGrid(points, cellSizeDeg, dpeParams)
  const peaks = selectPeaks(grid, nb_zones, minDistDeg)

  if (peaks.length === 0) return { zones: [], horsZone: points }

  const expanded = expandZones(peaks, points, capacite_cible)
  let zones: DensityZone[] = expanded
    .filter(z => z.length > 0)
    .map(z => buildZone(z, rayon_alerte))

  // ── Passe de rattrapage DPE ──────────────────────────────────────────────
  if (dpeParams.poids > 0 && dpeParams.seuil_inclusion > 0) {
    const dpeParCommune = new Map<string, { count: number; points: GeoPoint[] }>()
    for (const p of points) {
      if (!p.code_insee) continue
      const chauds = p.dpe_chauds ?? 0
      if (chauds === 0) continue
      const entry = dpeParCommune.get(p.code_insee) ?? { count: 0, points: [] }
      entry.count += chauds
      entry.points.push(p)
      dpeParCommune.set(p.code_insee, entry)
    }

    const communesCouvertes = new Set<string>()
    for (const z of zones) {
      for (const p of z.points) {
        if (p.code_insee) communesCouvertes.add(p.code_insee)
      }
    }

    for (const [insee, data] of dpeParCommune) {
      if (communesCouvertes.has(insee)) continue
      if (data.count < dpeParams.seuil_inclusion) continue

      const adressesDpe = data.points
        .sort((a, b) => (b.dpe_chauds ?? 0) - (a.dpe_chauds ?? 0))
        .slice(0, capacite_cible)

      if (adressesDpe.length === 0) continue

      if (zones.length >= nb_zones) {
        // Remplacer la zone la moins peuplee
        const minIdx = zones.reduce((m, z, i, arr) => z.points.length < arr[m].points.length ? i : m, 0)
        zones[minIdx] = buildZone(adressesDpe, rayon_alerte, true)
      } else {
        zones.push(buildZone(adressesDpe, rayon_alerte, true))
      }
      communesCouvertes.add(insee)
    }
  }

  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
