// ─── Algorithme density-based pour zones de prospection ──────────────────
// Logique :
//  1. Grille de densité → trouver les N pics (zones les plus denses)
//  2. Expansion depuis chaque pic → prendre les K adresses les plus proches
//     dans le rayon max
//  3. Les adresses non couvertes restent hors-zone (c'est voulu)

export interface GeoPoint {
  id:           string
  lat:          number
  lon:          number
  prospectable: boolean
}

export interface DensityZone {
  centroid: { lat: number; lon: number }
  points:   GeoPoint[]
  rayon_metres: number   // rayon réel de la zone
  tronquee: boolean      // true si on a atteint le rayon avant la capacité
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

// ── Étape 1 : Grille de densité ───────────────────────────────────────────
interface GridCell {
  lat:   number // centre de la cellule
  lon:   number
  count: number
  points: GeoPoint[]
}

function buildDensityGrid(points: GeoPoint[], cellSizeMetres = 150): GridCell[] {
  if (points.length === 0) return []

  // Convertir la taille de cellule en degrés (approx)
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

// ── Étape 2 : Sélectionner N pics bien espacés ────────────────────────────
// Évite que deux zones soient centrées au même endroit
function selectDensityPeaks(
  grid: GridCell[],
  nb_zones: number,
  minDistanceMetres: number
): GridCell[] {
  const selected: GridCell[] = []

  for (const cell of grid) {
    if (selected.length >= nb_zones) break

    // Vérifier que ce pic est assez loin des pics déjà sélectionnés
    const tooClose = selected.some(
      (s) => haversine(s.lat, s.lon, cell.lat, cell.lon) < minDistanceMetres
    )
    if (!tooClose) selected.push(cell)
  }

  return selected
}

// ── Étape 3 : Expansion depuis chaque pic ────────────────────────────────
// Pour chaque pic :
//  - Trier toutes les adresses non assignées par distance au pic
//  - Prendre les K premières dans le rayon max
function expandZone(
  center:          { lat: number; lon: number },
  availablePoints: GeoPoint[],
  capacite_cible:  number,
  rayon_max_metres: number
): { points: GeoPoint[]; rayon: number; tronquee: boolean } {

  // Trier par distance au centre
  const withDist = availablePoints
    .map((p) => ({
      point: p,
      dist:  haversine(center.lat, center.lon, p.lat, p.lon),
    }))
    .filter((x) => x.dist <= rayon_max_metres)
    .sort((a, b) => a.dist - b.dist)

  const taken      = withDist.slice(0, capacite_cible)
  const tronquee   = withDist.length < capacite_cible && availablePoints.length > taken.length
  const rayon      = taken.length > 0 ? taken[taken.length - 1].dist : 0

  return {
    points:   taken.map((x) => x.point),
    rayon:    Math.round(rayon),
    tronquee,
  }
}

// ── Pipeline principal ────────────────────────────────────────────────────
export function generateDensityZones(
  points:           GeoPoint[],
  nb_zones:         number,
  capacite_cible:   number,
  rayon_max_metres: number
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  // 1. Construire la grille
  const grid = buildDensityGrid(points, 150)

  // Distance minimale entre deux centres de zones
  // = rayon_max * 1.5 pour éviter les chevauchements excessifs
  const minDistCentres = rayon_max_metres * 1.5

  // 2. Sélectionner N pics
  const peaks = selectDensityPeaks(grid, nb_zones, minDistCentres)

  // Si on trouve moins de pics que demandé, c'est ok
  const actualNbZones = peaks.length

  // 3. Expansion : assigner les adresses zone par zone (priorité au pic le + dense)
  const assigned  = new Set<string>() // ids des adresses déjà assignées
  const zones: DensityZone[] = []

  for (const peak of peaks) {
    const available = points.filter((p) => !assigned.has(p.id))
    if (available.length === 0) break

    const { points: zonePoints, rayon, tronquee } = expandZone(
      { lat: peak.lat, lon: peak.lon },
      available,
      capacite_cible,
      rayon_max_metres
    )

    if (zonePoints.length === 0) continue

    // Marquer comme assignées
    for (const p of zonePoints) assigned.add(p.id)

    // Recalculer le centroïde réel de la zone (barycentre des adresses assignées)
    const centroid = {
      lat: zonePoints.reduce((s, p) => s + p.lat, 0) / zonePoints.length,
      lon: zonePoints.reduce((s, p) => s + p.lon, 0) / zonePoints.length,
    }

    zones.push({ centroid, points: zonePoints, rayon_metres: rayon, tronquee })
  }

  // 4. Adresses hors-zone
  const horsZone = points.filter((p) => !assigned.has(p.id))

  return { zones, horsZone }
}
