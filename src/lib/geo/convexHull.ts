// ─── Enveloppe convexe (Graham scan) ──────────────────────────────────────
// Génère le polygone délimitant chaque cluster d'adresses

type Pt = [number, number] // [lon, lat]

function cross(O: Pt, A: Pt, B: Pt): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
}

/**
 * Enveloppe convexe d'un ensemble de points.
 * Retourne les coins dans l'ordre anti-horaire.
 */
export function convexHull(points: Pt[]): Pt[] {
  const n = points.length
  if (n === 0) return []

  if (n < 3) {
    // Bounding box avec un léger buffer
    const lons = points.map((p) => p[0])
    const lats = points.map((p) => p[1])
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const pad = 0.002
    return [
      [minLon - pad, minLat - pad],
      [maxLon + pad, minLat - pad],
      [maxLon + pad, maxLat + pad],
      [minLon - pad, maxLat + pad],
    ]
  }

  const sorted = [...points].sort((a, b) =>
    a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]
  )

  const lower: Pt[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: Pt[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  upper.pop()
  lower.pop()
  return [...lower, ...upper]
}

/**
 * Agrandit le polygone d'un buffer (en degrés ~= 150m à nos latitudes).
 * Chaque point est éloigné du centroïde.
 */
export function bufferPolygon(hull: Pt[], bufferDeg = 0.0015): Pt[] {
  if (hull.length < 3) return hull

  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length

  return hull.map((p) => {
    const dx = p[0] - cx
    const dy = p[1] - cy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-10) return [p[0] + bufferDeg, p[1] + bufferDeg] as Pt
    const scale = (len + bufferDeg) / len
    return [cx + dx * scale, cy + dy * scale] as Pt
  })
}

/**
 * Convertit un hull en WKT Polygon (pour PostGIS).
 * Le polygone doit être fermé (1er = dernier point).
 */
export function hullToWKT(hull: Pt[]): string {
  if (hull.length < 3) return ''
  const closed = [...hull, hull[0]]
  const coords = closed.map((p) => `${p[0]} ${p[1]}`).join(', ')
  return `POLYGON((${coords}))`
}

/**
 * Convertit un hull en coordonnées GeoJSON Polygon.
 */
export function hullToGeoJSON(hull: Pt[]): number[][][] {
  const closed = [...hull, hull[0]]
  return [closed.map((p) => [p[0], p[1]])]
}

/**
 * Pipeline complet : points → WKT polygon avec buffer.
 */
export function pointsToPolygonWKT(
  points: Array<{ lon: number; lat: number }>,
  bufferDeg = 0.0015
): string {
  const pts: Pt[] = points.map((p) => [p.lon, p.lat])
  const hull = convexHull(pts)
  const buffered = bufferPolygon(hull, bufferDeg)
  return hullToWKT(buffered.length >= 3 ? buffered : hull)
}
