// ─── Conversion Lambert 93 (EPSG:2154) → WGS84 (EPSG:4326) ──────────────
// Formule analytique — précision ~1m, suffisante pour du matching adresse.
// Source : IGN — algorithmes de transformation de coordonnées

export interface WGS84Point {
  lat: number
  lon: number
}

/**
 * Convertit des coordonnées Lambert 93 (X, Y) en WGS84 (lat, lon).
 * Retourne null si le résultat est hors France métropolitaine.
 */
export function lambert93ToWgs84(x: number, y: number): WGS84Point | null {
  const n  = 0.7256077650
  const F  = 11754255.426
  const e  = 0.0818191910
  const lc = 0.04079234433
  const yS = 6467437.664

  const R = F * Math.exp(
    -n * Math.log(Math.sqrt(x * x + (y - yS) * (y - yS)))
  )
  const g = Math.atan(x / (yS - y))

  let lon = g / n + lc
  let lat = 2 * Math.atan(Math.exp(Math.log(R / F) / n)) - Math.PI / 2

  // 5 itérations convergent à < 0.001"
  for (let i = 0; i < 5; i++) {
    const s = e * Math.sin(lat)
    lat = 2 * Math.atan(
      Math.pow((1 + s) / (1 - s), e / 2) * Math.exp(Math.log(R / F) / n)
    ) - Math.PI / 2
  }

  lon = lon * 180 / Math.PI
  lat = lat * 180 / Math.PI

  // Validation bounding box France métropolitaine
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return null

  return { lat, lon }
}
