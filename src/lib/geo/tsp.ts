// ─── TSP Nearest Neighbor ─────────────────────────────────────────────────
// Calcule l'itinéraire de prospection optimal dans une zone.
// Heuristique simple O(n²) — parfaite pour 20-200 adresses.

export interface TspPoint {
  id: string          // TEXT — identifiant BAN (ex: "22168_0440_00003")
  lat: number
  lon: number
}

/** Distance approx en degrés (pas besoin d'haversine pour du local) */
function dist(a: TspPoint, b: TspPoint): number {
  const cosLat = Math.cos((a.lat * Math.PI) / 180)
  const dLat = a.lat - b.lat
  const dLon = (a.lon - b.lon) * cosLat
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

/**
 * Itinéraire "nearest neighbor" :
 * - Départ depuis le point le plus au nord (haut de la zone)
 * - À chaque étape, on va au voisin non encore visité le plus proche
 *
 * Retourne les points dans l'ordre de visite recommandé.
 */
export function nearestNeighborTSP(points: TspPoint[]): TspPoint[] {
  if (points.length <= 1) return [...points]

  const remaining = [...points]
  const route: TspPoint[] = []

  // Départ : point le plus au nord
  let startIdx = 0
  for (let i = 1; i < remaining.length; i++) {
    if (remaining[i].lat > remaining[startIdx].lat) startIdx = i
  }

  route.push(remaining[startIdx])
  remaining.splice(startIdx, 1)

  while (remaining.length > 0) {
    const last = route[route.length - 1]
    let minDist = Infinity
    let nearest = 0

    for (let i = 0; i < remaining.length; i++) {
      const d = dist(last, remaining[i])
      if (d < minDist) {
        minDist = d
        nearest = i
      }
    }

    route.push(remaining[nearest])
    remaining.splice(nearest, 1)
  }

  return route
}

/**
 * Longueur totale d'un itinéraire (en degrés approximatifs).
 * Utile pour comparer deux routes.
 */
export function routeLength(route: TspPoint[]): number {
  let total = 0
  for (let i = 1; i < route.length; i++) {
    total += dist(route[i - 1], route[i])
  }
  return total
}

/**
 * 2-opt local improvement.
 * Améliore un itinéraire existant en inversant des segments.
 * Optionnel — activer si le TSP de base n'est pas assez bon.
 */
export function twoOpt(route: TspPoint[], maxPasses = 3): TspPoint[] {
  let best = [...route]
  let improved = true
  let pass = 0

  while (improved && pass < maxPasses) {
    improved = false
    pass++

    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        // Inverser le segment [i..j]
        const newRoute = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        if (routeLength(newRoute) < routeLength(best)) {
          best = newRoute
          improved = true
        }
      }
    }
  }

  return best
}
