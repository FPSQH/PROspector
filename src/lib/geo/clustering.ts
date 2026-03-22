// ─── Algorithme K-means géographique ──────────────────────────────────────
// Clustering d'adresses lat/lon en k groupes équilibrés

export interface GeoPoint {
  id: string          // TEXT — identifiant BAN ou interne
  lat: number
  lon: number
  prospectable: boolean
}

export interface Cluster {
  centroid: { lat: number; lon: number }
  points: GeoPoint[]
}

/** Distance approx en degrés² (suffisante pour clustering local) */
function sqDist(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const cosLat = Math.cos((a.lat * Math.PI) / 180)
  const dLat = a.lat - b.lat
  const dLon = (a.lon - b.lon) * cosLat
  return dLat * dLat + dLon * dLon
}

/** Initialisation K-means++ pour éviter les mauvais départs */
function initKMeansPP(
  points: GeoPoint[],
  k: number
): { lat: number; lon: number }[] {
  const n = points.length
  const centroids: { lat: number; lon: number }[] = []

  // 1er centroïde : aléatoire
  const first = points[Math.floor(Math.random() * n)]
  centroids.push({ lat: first.lat, lon: first.lon })

  for (let c = 1; c < k; c++) {
    // Distances² au centroïde le plus proche
    const D2 = points.map((p) => {
      const minD = Math.min(...centroids.map((ct) => sqDist(p, ct)))
      return minD
    })
    const total = D2.reduce((s, d) => s + d, 0)

    // Tirage proportionnel à D²
    let rand = Math.random() * total
    let chosen = n - 1
    for (let i = 0; i < n; i++) {
      rand -= D2[i]
      if (rand <= 0) {
        chosen = i
        break
      }
    }
    centroids.push({ lat: points[chosen].lat, lon: points[chosen].lon })
  }

  return centroids
}

/**
 * K-means sur coordonnées géographiques.
 * @param points  Liste des adresses à clusteriser
 * @param k       Nombre de zones cibles
 * @param maxIter Nombre max d'itérations (50 est suffisant)
 */
export function kmeans(
  points: GeoPoint[],
  k: number,
  maxIter = 60
): Cluster[] {
  if (points.length === 0) return []

  const actualK = Math.min(k, points.length)
  const centroids = initKMeansPP(points, actualK)
  let clusters: Cluster[] = []

  for (let iter = 0; iter < maxIter; iter++) {
    // Reset clusters
    clusters = centroids.map((c) => ({
      centroid: { lat: c.lat, lon: c.lon },
      points: [],
    }))

    // Affectation
    for (const p of points) {
      let minD = Infinity
      let best = 0
      for (let i = 0; i < centroids.length; i++) {
        const d = sqDist(p, centroids[i])
        if (d < minD) {
          minD = d
          best = i
        }
      }
      clusters[best].points.push(p)
    }

    // Recalcul centroïdes
    let changed = false
    for (let i = 0; i < actualK; i++) {
      if (clusters[i].points.length === 0) continue
      const newLat =
        clusters[i].points.reduce((s, p) => s + p.lat, 0) /
        clusters[i].points.length
      const newLon =
        clusters[i].points.reduce((s, p) => s + p.lon, 0) /
        clusters[i].points.length
      if (
        Math.abs(newLat - centroids[i].lat) > 1e-8 ||
        Math.abs(newLon - centroids[i].lon) > 1e-8
      ) {
        changed = true
      }
      centroids[i] = { lat: newLat, lon: newLon }
      clusters[i].centroid = { lat: newLat, lon: newLon }
    }

    if (!changed) break
  }

  return clusters.filter((c) => c.points.length > 0)
}

/**
 * Lance k-means N fois et retourne le meilleur résultat
 * (inertie minimale = clusters les plus compacts)
 */
export function bestKMeans(
  points: GeoPoint[],
  k: number,
  runs = 5
): Cluster[] {
  let best: Cluster[] = []
  let bestInertia = Infinity

  for (let r = 0; r < runs; r++) {
    const clusters = kmeans(points, k)
    const inertia = clusters.reduce((total, c) => {
      return (
        total +
        c.points.reduce((s, p) => s + sqDist(p, c.centroid), 0)
      )
    }, 0)
    if (inertia < bestInertia) {
      bestInertia = inertia
      best = clusters
    }
  }

  return best
}
