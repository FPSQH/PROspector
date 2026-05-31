// Styles GL Draw adaptés aux couleurs PROspector / Square Habitat
const PRIMARY = '#1D9E75'

export const GL_DRAW_STYLES: object[] = [
  // Fond du polygone en cours de dessin
  {
    id: 'gl-draw-polygon-fill-active',
    type: 'fill',
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    paint: { 'fill-color': PRIMARY, 'fill-opacity': 0.15 },
  },
  // Bordure du polygone en cours de dessin (tirets)
  {
    id: 'gl-draw-polygon-stroke-active',
    type: 'line',
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': PRIMARY, 'line-dasharray': [2, 2], 'line-width': 2 },
  },
  // Ligne reliant les points pendant le dessin
  {
    id: 'gl-draw-line-active',
    type: 'line',
    filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': PRIMARY, 'line-dasharray': [0.5, 2], 'line-width': 2 },
  },
  // Vertices (sommets)
  {
    id: 'gl-draw-polygon-and-line-vertex-active',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    paint: {
      'circle-radius': 6,
      'circle-color': '#fff',
      'circle-stroke-width': 2,
      'circle-stroke-color': PRIMARY,
    },
  },
  // Midpoints (points médians pour ajouter des sommets en mode direct_select)
  {
    id: 'gl-draw-polygon-midpoint',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: {
      'circle-radius': 4,
      'circle-color': PRIMARY,
      'circle-opacity': 0.7,
    },
  },
  // Point de cursor pendant le dessin
  {
    id: 'gl-draw-point-point-stroke-inactive',
    type: 'circle',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': PRIMARY },
  },
  // Polygone statique (après création, en simple_select)
  {
    id: 'gl-draw-polygon-fill-static',
    type: 'fill',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
    paint: { 'fill-color': PRIMARY, 'fill-opacity': 0.1 },
  },
  {
    id: 'gl-draw-polygon-stroke-static',
    type: 'line',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
    paint: { 'line-color': PRIMARY, 'line-width': 2 },
  },
]

// Calcule la distance approximative en mètres entre deux points (flat-earth)
function distMeters(lat: number, aLng: number, aLat: number, bLng: number, bLat: number): number {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dx = (bLng - aLng) * cosLat * 111320
  const dy = (bLat - aLat) * 111320
  return Math.sqrt(dx * dx + dy * dy)
}

// Snap un point vers l'adresse la plus proche si elle est dans le rayon
export function snapPoint(
  lngLat: { lng: number; lat: number },
  points: [number, number][],
  radiusMeters = 10
): { lng: number; lat: number } {
  if (points.length === 0) return lngLat
  let nearest: [number, number] | null = null
  let minDist = radiusMeters

  for (const [lng, lat] of points) {
    const d = distMeters(lngLat.lat, lngLat.lng, lngLat.lat, lng, lat)
    if (d < minDist) {
      minDist = d
      nearest = [lng, lat]
    }
  }

  return nearest ? { lng: nearest[0], lat: nearest[1] } : lngLat
}

// Crée un mode draw_polygon custom avec snap aux adresses + callback par vertex ajouté
export function createSnapPolygonMode(
  getSnapPoints: () => [number, number][],
  onVertexAdded: (pt: [number, number]) => void,
  radiusMeters = 10
): object | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MapboxDraw = require('@mapbox/mapbox-gl-draw').default
  const base = MapboxDraw.modes.draw_polygon

  return {
    ...base,
    onClick(state: any, e: any) {
      const snapped = snapPoint(e.lngLat, getSnapPoints(), radiusMeters)
      // Modifier lngLat in-place (GL Draw lit la propriété directement)
      e.lngLat = Object.assign(Object.create(Object.getPrototypeOf(e.lngLat)), e.lngLat, snapped)
      onVertexAdded([snapped.lng, snapped.lat])
      return base.onClick.call(this, state, e)
    },
    onTap(state: any, e: any) {
      const snapped = snapPoint(e.lngLat, getSnapPoints(), radiusMeters)
      e.lngLat = Object.assign(Object.create(Object.getPrototypeOf(e.lngLat)), e.lngLat, snapped)
      onVertexAdded([snapped.lng, snapped.lat])
      return base.onTap
        ? base.onTap.call(this, state, e)
        : base.onClick.call(this, state, e)
    },
  }
}
