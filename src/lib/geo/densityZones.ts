// ─── Algorithme density-based pour zones de prospection ──────────────────
// Logique :
//  1. Grille de densité → trouver les N pics (zones les plus denses)
//  2. Expansion depuis chaque pic → prendre les K adresses les plus proches
//     SANS limite de distance (le rayon s'adapte à la densité locale)
//  3. rayon_alerte = seuil d'information uniquement (zone marquée ⚠️ si dépassé)
//  4. Les adresses non couvertes restent hors-zone

export interface GeoPoint {
  id:           string
  lat:          number
  lon:          number
  prospectable: boolean
}

export interface DensityZone {
  centroid:     { lat: number; lon: number }
  points:       GeoPoint[]
  rayon_metres: number   // rayon réel calculé automatiquement
  depasse_seuil: boolean // true si rayon_metres > rayon_alerte
}

// Distance en mètres (haversine)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Étape 1 : Grille de densité ──────────────────────────────────────────
interface GridCell {
  lat:    number
  lon:    number
  count:  number
  points: GeoPoint[]
}

function buildDensityGrid(points: GeoPoint[], cellSizeMetres = 100): GridCell[] {
  if (points.length === 0) return []

  const latDeg = cellSizeMetres / 111320
  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lonDeg = cellSizeMetres / (111320 * Math.cos(avgLat * Math.PI / 180))

  const cells = new Map<string, GridCell>()

  for (const p of points) {
    const cellLat = Math.floor(p.lat / latDeg) * latDeg + latDeg / 2
    const cellLon = Math.floor(p.lon / lonDeg) * lonDeg + lonDeg / 2
    const key     = `${cellLat.toFixed(6)}_${cellLon.toFixed(6)}`

    if (!cells.has(key)) {
      cells.set(key, { lat: cellLat, lon: cellLon, count: 0, points: [] })
    }
    const cell = cells.get(key)!
    cell.count++
    cell.points.push(p)
  }

  return Array.from(cells.values()).sort((a, b) => b.count - a.count)
}

// ── Étape 2 : Sélectionner N pics bien espacés ───────────────────────────
// Distance minimale entre deux centres = petite valeur pour permettre
// plusieurs zones dans une même ville
function selectDensityPeaks(
  grid:                GridCell[],
  nb_zones:            number,
  minDistanceMetres:   number
): GridCell[] {
  const selected: GridCell[] = []

  for (const cell of grid) {
    if (selected.length >= nb_zones) break

    const tooClose = selected.some(
      (s) => haversine(s.lat, s.lon, cell.lat, cell.lon) < minDistanceMetres
    )
    if (!tooClose) selected.push(cell)
  }

  return selected
}

// ── Étape 3 : Expansion sans limite de rayon ────────────────────────────
// On prend les K adresses les plus proches du centre, peu importe la distance.
// Le rayon réel est calculé a posteriori et comparé au seuil d'alerte.
function expandZone(
  center:           { lat: number; lon: number },
  availablePoints:  GeoPoint[],
  capacite_cible:   number,
  rayon_alerte:     number   // seuil d'information uniquement
): { points: GeoPoint[]; rayon: number; depasse_seuil: boolean } {

  if (availablePoints.length === 0) {
    return { points: [], rayon: 0, depasse_seuil: false }
  }

  // Trier par distance — SANS filtrer par rayon
  const sorted = availablePoints
    .map((p) => ({
      point: p,
      dist:  haversine(center.lat, center.lon, p.lat, p.lon),
    }))
    .sort((a, b) => a.dist - b.dist)

  // Prendre les K plus proches (ou moins si pas assez d'adresses disponibles)
  const taken  = sorted.slice(0, capacite_cible)
  const rayon  = taken.length > 0 ? Math.round(taken[taken.length - 1].dist) : 0

  return {
    points:        taken.map((x) => x.point),
    rayon,
    depasse_seuil: rayon > rayon_alerte,
  }
}

// ── Pipeline principal ───────────────────────────────────────────────────
export function generateDensityZones(
  points:          GeoPoint[],
  nb_zones:        number,
  capacite_cible:  number,
  rayon_alerte:    number   // seuil d'alerte (pas une limite dure)
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  // 1. Grille de densité (cellules de 100m)
  const grid = buildDensityGrid(points, 100)

  // Distance minimale entre deux centres de zones :
  // assez petite pour permettre N zones dans une même ville
  // assez grande pour éviter deux centres au même endroit
  // Règle : ~capacite_cible adresses par zone → estimer le rayon naturel
  // On utilise une distance fixe de 150m (2 cellules) comme séparation minimale
  const minDistCentres = 150

  // 2. Sélectionner N pics
  const peaks = selectDensityPeaks(grid, nb_zones, minDistCentres)

  // 3. Expansion : assigner les adresses zone par zone
  const assigned = new Set<string>()
  const zones: DensityZone[] = []

  for (const peak of peaks) {
    const available = points.filter((p) => !assigned.has(p.id))
    if (available.length === 0) break

    const { points: zonePoints, rayon, depasse_seuil } = expandZone(
      { lat: peak.lat, lon: peak.lon },
      available,
      capacite_cible,
      rayon_alerte
    )

    if (zonePoints.length === 0) continue

    for (const p of zonePoints) assigned.add(p.id)

    // Centroïde réel (barycentre des adresses assignées)
    const centroid = {
      lat: zonePoints.reduce((s, p) => s + p.lat, 0) / zonePoints.length,
      lon: zonePoints.reduce((s, p) => s + p.lon, 0) / zonePoints.length,
    }

    zones.push({ centroid, points: zonePoints, rayon_metres: rayon, depasse_seuil })
  }

  // 4. Adresses hors-zone
  const horsZone = points.filter((p) => !assigned.has(p.id))

  return { zones, horsZone }
}
