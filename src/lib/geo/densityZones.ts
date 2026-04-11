// ── Algorithme de selection gloutonne de hotspots de prospection ────────────
//
// Principe :
//   On parcourt une grille reguliere de centres candidats sur le secteur.
//   Pour chaque candidat on calcule un score dans le rayon R (limite dure) :
//     score = nb_adresses + nb_DPE x poids_DPE
//   On selectionne le meilleur spot, on cree la zone, on retire les adresses,
//   et on recommence jusqu'a avoir N zones.
//
// Garanties :
//   - Rayon = limite dure : aucune adresse au-dela de R depuis le centroid
//   - Pas de chevauchement : chaque adresse appartient a une seule zone
//   - Zones invalides (<50% capacite) ignorees sauf si besoin de completer N zones

export interface GeoPoint {
  id:           string
  lat:          number
  lon:          number
  prospectable: boolean
  code_insee?:  string
  dpe_chauds?:  number
  dpe_tiedes?:  number
}

export interface DensityZone {
  centroid:      { lat: number; lon: number }
  points:        GeoPoint[]
  rayon_metres:  number
  depasse_seuil: boolean
  dpe_prioritaire: boolean
  nb_dpe_chauds:   number
  nb_dpe_tiedes:   number
}

export interface DpeParams {
  poids:           number   // 0..2 (0% a 200%)
  seuil_inclusion: number   // conserve pour compatibilite API
}

// Haversine (metres) — utilise uniquement pour le rayon final affiche
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calcCentroid(pts: GeoPoint[]): { lat: number; lon: number } {
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
  }
}

// ── Fonction principale ──────────────────────────────────────────────────────
export function generateDensityZones(
  points:         GeoPoint[],
  nb_zones:       number,
  capacite_cible: number,
  rayon_metres:   number,    // LIMITE DURE — aucune adresse au-dela
  dpeParams:      DpeParams = { poids: 0, seuil_inclusion: 10 }
): { zones: DensityZone[]; horsZone: GeoPoint[] } {

  if (points.length === 0) return { zones: [], horsZone: [] }

  const seuil_min = Math.floor(capacite_cible * 0.5)  // 50% = seuil minimum

  // Constantes geographiques pour distance rapide (Euclide approx, valide < 10km)
  const avgLat  = points.reduce((s, p) => s + p.lat, 0) / points.length
  const cosLat  = Math.cos(avgLat * Math.PI / 180)
  const mPerDegLat = 111000
  const mPerDegLon = 111000 * cosLat
  const R2      = rayon_metres * rayon_metres  // comparaison sur carres (sans sqrt)
  const rayonDeg = rayon_metres / 111000

  function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dlat = (lat2 - lat1) * mPerDegLat
    const dlon = (lon2 - lon1) * mPerDegLon
    return dlat * dlat + dlon * dlon
  }

  // Hash spatial pour requetes de voisinage rapides
  // Taille de bucket = rayon (chaque centre consulte les 9 buckets adjacents)
  function bucketKey(lat: number, lon: number): string {
    return `${Math.floor(lat / rayonDeg)},${Math.floor(lon / rayonDeg)}`
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
    const bi = Math.floor(lat / rayonDeg)
    const bj = Math.floor(lon / rayonDeg)
    const out: GeoPoint[] = []
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const b = h.get(`${bi+di},${bj+dj}`)
        if (b) out.push(...b)
      }
    return out
  }

  // Bounding box du secteur
  const lats = points.map(p => p.lat)
  const lons = points.map(p => p.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)

  // Pas de la grille = rayon / 2 (bon compromis precision / perf)
  const stepDeg = rayonDeg / 2

  // Boucle gloutonne
  let remaining = [...points]
  const zones:   DensityZone[] = []
  let fallback:  DensityZone | null = null  // meilleure zone sous le seuil

  while (zones.length < nb_zones && remaining.length > 0) {

    const hash = buildHash(remaining)
    let bestScore    = -1
    let bestCenter:  { lat: number; lon: number } | null = null
    let bestInRadius: GeoPoint[] = []

    // Parcourir tous les centres candidats de la grille
    for (let lat = latMin - stepDeg; lat <= latMax + stepDeg; lat += stepDeg) {
      for (let lon = lonMin - stepDeg; lon <= lonMax + stepDeg; lon += stepDeg) {
        const neighbors = getNeighbors(hash, lat, lon)
        const inR = neighbors.filter(p => distSq(lat, lon, p.lat, p.lon) <= R2)
        if (inR.length === 0) continue

        const dpe   = inR.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0)
        const score = inR.length + dpe * dpeParams.poids

        if (score > bestScore) {
          bestScore    = score
          bestCenter   = { lat, lon }
          bestInRadius = inR
        }
      }
    }

    // Aucun spot restant
    if (!bestCenter || bestInRadius.length === 0) break

    // Prendre jusqu'a capacite_cible adresses (les plus proches du centre candidat)
    const candidatePts = bestInRadius
      .map(p => ({ p, d: distSq(bestCenter!.lat, bestCenter!.lon, p.lat, p.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, capacite_cible)
      .map(x => x.p)

    // Recalculer le centroid reel
    let c = calcCentroid(candidatePts)

    // Re-filtrer : conserver seulement les adresses dans R depuis le vrai centroid
    let finalPts = candidatePts.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= R2)

    // Si des points ont ete retires, recalculer une derniere fois le centroid
    if (finalPts.length < candidatePts.length && finalPts.length > 0) {
      c = calcCentroid(finalPts)
      finalPts = finalPts.filter(p => distSq(c.lat, c.lon, p.lat, p.lon) <= R2)
    }

    if (finalPts.length === 0) break

    // Rayon reel (haversine sur le point le plus eloigne)
    const rayonReel = Math.round(
      Math.max(...finalPts.map(p => haversine(c.lat, c.lon, p.lat, p.lon)))
    )

    const zone: DensityZone = {
      centroid:        c,
      points:          finalPts,
      rayon_metres:    rayonReel,
      depasse_seuil:   false,  // rayon est une limite dure, ne peut pas depasser
      dpe_prioritaire: false,
      nb_dpe_chauds:   finalPts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0),
      nb_dpe_tiedes:   finalPts.reduce((s, p) => s + (p.dpe_tiedes ?? 0), 0),
    }

    // Retirer ces adresses du pool dans tous les cas (zone valide ou non)
    const usedIds = new Set(finalPts.map(p => p.id))
    remaining = remaining.filter(p => !usedIds.has(p.id))

    if (finalPts.length >= seuil_min) {
      // Zone valide : l'ajouter
      zones.push(zone)
    } else {
      // Zone sous le seuil : sauvegarder comme fallback et arreter
      // (si le meilleur spot restant est sous le seuil, tous le sont)
      if (!fallback || finalPts.length > fallback.points.length) {
        fallback = zone
      }
      break
    }
  }

  // Si on n'a pas atteint nb_zones, ajouter le fallback (1 seul)
  if (zones.length < nb_zones && fallback) {
    zones.push({ ...fallback, dpe_prioritaire: true })
  }

  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
