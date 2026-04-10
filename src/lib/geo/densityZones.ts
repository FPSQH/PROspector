// ─── Algorithme density-based pour zones de prospection ──────────────────
// Logique :
//  1. Grille de densite -> trouver les N pics (zones les plus denses)
//     Le score de chaque cellule integre la densite d'adresses + bonus DPE
//  2. Expansion depuis chaque pic -> prendre les K adresses les plus proches
//     SANS limite de distance (le rayon s'adapte a la densite locale)
//  3. rayon_alerte = seuil d'information uniquement (zone marquee si depasse)
//  4. Les adresses non couvertes restent hors-zone

export interface GeoPoint {
  id:           string
  lat:          number
  lon:          number
  prospectable: boolean
  code_insee?:  string
  // DPE enrichissement (optionnel)
  dpe_chauds?:  number   // nb DPE dans la fenetre courte (ex: < 6 mois)
  dpe_tièdes?:  number   // nb DPE dans la fenetre etendue (ex: 6-12 mois)
}

export interface DensityZone {
  centroid:        { lat: number; lon: number }
  points:          GeoPoint[]
  rayon_metres:    number
  depasse_seuil:   boolean
  dpe_prioritaire: boolean   // true si zone incluse grace au rattrapage DPE
  nb_dpe_chauds:   number
  nb_dpe_tièdes:   number
}

// Parametres DPE passes depuis le route handler
export interface DpeParams {
  poids:           number   // 0..1
  seuil_inclusion: number   // nb DPE chauds min pour forcer une commune
}

// Distance en metres (haversine)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Etape 1 : Grille de densite ──────────────────────────────────────────
function buildDensityGrid(
  points: GeoPoint[],
  cellSizeDeg: number,
  dpeParams: DpeParams
): Map<string, { lat: number; lon: number; score: number; dpeChauds: number; dpeTièdes: number }> {
  const grid = new Map<string, {
    lat: number; lon: number; count: number;
    dpeChauds: number; dpeTièdes: number
  }>()

  for (const p of points) {
    const gLat = Math.round(p.lat / cellSizeDeg) * cellSizeDeg
    const gLon = Math.round(p.lon / cellSizeDeg) * cellSizeDeg
    const key  = `${gLat.toFixed(4)},${gLon.toFixed(4)}`
    const cell = grid.get(key) ?? { lat: gLat, lon: gLon, count: 0, dpeChauds: 0, dpeTièdes: 0 }
    cell.count++
    cell.dpeChauds  += p.dpe_chauds  ?? 0
    cell.dpeTièdes  += p.dpe_tièdes  ?? 0
    grid.set(key, cell)
  }

  // Convertir en score composite : nb_adresses + bonus DPE
  // bonus = dpe_poids * (chauds * 2 + tièdes * 1)
  const result = new Map<string, { lat: number; lon: number; score: number; dpeChauds: number; dpeTièdes: number }>()
  for (const [key, cell] of grid) {
    const bonusDpe = dpeParams.poids * (cell.dpeChauds * 2 + cell.dpeTièdes * 1)
    result.set(key, {
      lat:       cell.lat,
      lon:       cell.lon,
      score:     cell.count + bonusDpe,
      dpeChauds: cell.dpeChauds,
      dpeTièdes: cell.dpeTièdes,
    })
  }
  return result
}

// ── Etape 2 : Selectionner les N meilleurs pics (non-contigus) ───────────
function selectPeaks(
  grid: Map<string, { lat: number; lon: number; score: number; dpeChauds: number; dpeTièdes: number }>,
  nb_zones: number,
  minDistanceDeg: number
): Array<{ lat: number; lon: number; score: number }> {
  const sorted = [...grid.values()].sort((a, b) => b.score - a.score)
  const peaks: Array<{ lat: number; lon: number; score: number }> = []

  for (const cell of sorted) {
    if (peaks.length >= nb_zones) break
    const tooClose = peaks.some(p =>
      Math.abs(p.lat - cell.lat) < minDistanceDeg &&
      Math.abs(p.lon - cell.lon) < minDistanceDeg
    )
    if (!tooClose) peaks.push(cell)
  }
  return peaks
}

// ── Etape 3 : Expansion depuis chaque pic ───────────────────────────────
function expandZones(
  peaks: Array<{ lat: number; lon: number; score: number }>,
  points:        GeoPoint[],
  capacite:      number
): GeoPoint[][] {
  // Pour chaque point, trouver le pic le plus proche
  const assigned: GeoPoint[][] = peaks.map(() => [])
  const unassigned = [...points]

  // Tri par distance au pic le plus proche, assignation greedy
  for (const p of unassigned) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < peaks.length; i++) {
      const d = haversine(p.lat, p.lon, peaks[i].lat, peaks[i].lon)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    assigned[bestIdx].push(p)
  }

  // Limiter chaque zone a la capacite cible (garder les plus proches du centroid)
  return assigned.map((zone, i) => {
    if (zone.length <= capacite) return zone
    return zone
      .map(p => ({ p, d: haversine(p.lat, p.lon, peaks[i].lat, peaks[i].lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, capacite)
      .map(x => x.p)
  })
}

// ── Etape 4 : Calculer le centroid et le rayon reel ──────────────────────
function buildZone(pts: GeoPoint[], rayon_alerte: number, dpeParams: DpeParams, prioritaire = false): DensityZone {
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length
  const rayon = Math.max(...pts.map(p => haversine(lat, lon, p.lat, p.lon)))
  const nbChauds = pts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0)
  const nbTièdes = pts.reduce((s, p) => s + (p.dpe_tièdes ?? 0), 0)
  return {
    centroid:        { lat, lon },
    points:          pts,
    rayon_metres:    Math.round(rayon),
    depasse_seuil:   rayon > rayon_alerte,
    dpe_prioritaire: prioritaire,
    nb_dpe_chauds:   nbChauds,
    nb_dpe_tièdes:   nbTièdes,
  }
}

// ── Fonction principale ──────────────────────────────────────────────────
export function generateDensityZones(
  points:          GeoPoint[],
  nb_zones:        number,
  capacite_cible:  number,
  rayon_alerte:    number,
  dpeParams:       DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  // Taille de cellule adaptative (vise ~15 pts/cellule)
  const cellSizeDeg  = Math.sqrt(points.length / (nb_zones * 15)) * 0.02
  const minDistPeaks = cellSizeDeg * 3

  const grid  = buildDensityGrid(points, cellSizeDeg, dpeParams)
  const peaks = selectPeaks(grid, nb_zones, minDistPeaks)

  if (peaks.length === 0) return { zones: [], horsZone: points }

  const expandedZones = expandZones(peaks, points, capacite_cible)

  // Construire les zones initiales
  let zones: DensityZone[] = expandedZones
    .filter(z => z.length > 0)
    .map(z => buildZone(z, rayon_alerte, dpeParams))

  // ── Passe de rattrapage DPE ──────────────────────────────────────────
  // Si dpe_poids > 0, verifier que les communes avec fort signal DPE sont couvertes
  if (dpeParams.poids > 0 && dpeParams.seuil_inclusion > 0) {
    // Calculer les DPE chauds par commune
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

    // Communes deja representees dans les zones
    const communesCouvertes = new Set<string>()
    for (const z of zones) {
      for (const p of z.points) {
        if (p.code_insee) communesCouvertes.add(p.code_insee)
      }
    }

    // Pour chaque commune non couverte avec signal DPE fort : forcer l'inclusion
    for (const [insee, data] of dpeParCommune) {
      if (communesCouvertes.has(insee)) continue
      if (data.count < dpeParams.seuil_inclusion) continue

      // Prendre les adresses de cette commune (dans la limite de la capacite)
      const adressesDpe = data.points
        .sort((a, b) => (b.dpe_chauds ?? 0) - (a.dpe_chauds ?? 0))
        .slice(0, capacite_cible)

      if (adressesDpe.length === 0) continue

      // Si on a deja nb_zones zones : remplacer la zone la moins peuplee
      if (zones.length >= nb_zones) {
        const minIdx = zones.reduce((minI, z, i, arr) => z.points.length < arr[minI].points.length ? i : minI, 0)
        zones[minIdx] = buildZone(adressesDpe, rayon_alerte, dpeParams, true)
      } else {
        zones.push(buildZone(adressesDpe, rayon_alerte, dpeParams, true))
      }

      communesCouvertes.add(insee)
    }
  }

  // Adresses hors-zone
  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
