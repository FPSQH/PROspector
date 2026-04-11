// ─── Algorithme commune-centrique pour zones de prospection ────────────────
// Logique :
//  1. Grouper les adresses par commune (code_insee)
//  2. Scorer chaque commune : nb_prospectables + bonus DPE pondere
//  3. Selectionner les top N communes par score
//  4. Si une commune depasse 1.8x la capacite cible -> la diviser en 2 sous-zones
//  5. Passe de rattrapage : communes a fort signal DPE mais non selectionnees

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

// Centroid geographique d'un tableau de points
function centroid(pts: GeoPoint[]): { lat: number; lon: number } {
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
  }
}

// Rayon max depuis un centroid
function rayon(pts: GeoPoint[], c: { lat: number; lon: number }): number {
  return pts.length > 1
    ? Math.max(...pts.map(p => haversine(c.lat, c.lon, p.lat, p.lon)))
    : 0
}

// Construire une DensityZone depuis un tableau de points
function buildZone(pts: GeoPoint[], rayon_alerte: number, prioritaire = false): DensityZone {
  const c = centroid(pts)
  return {
    centroid:        c,
    points:          pts,
    rayon_metres:    Math.round(rayon(pts, c)),
    depasse_seuil:   rayon(pts, c) > rayon_alerte,
    dpe_prioritaire: prioritaire,
    nb_dpe_chauds:   pts.reduce((s, p) => s + (p.dpe_chauds ?? 0), 0),
    nb_dpe_tièdes:   pts.reduce((s, p) => s + (p.dpe_tièdes ?? 0), 0),
  }
}

// Diviser une commune trop grande en 2 clusters (nord/sud ou est/ouest)
function splitCommune(pts: GeoPoint[], capacite: number, rayon_alerte: number): DensityZone[] {
  if (pts.length <= capacite) return [buildZone(pts, rayon_alerte)]

  // Trier par latitude pour couper en 2 groupes geographiquement coherents
  const sorted = [...pts].sort((a, b) => a.lat - b.lat)
  const mid    = Math.floor(sorted.length / 2)
  const groupA = sorted.slice(0, mid).slice(0, capacite)
  const groupB = sorted.slice(mid).slice(0, capacite)

  return [
    buildZone(groupA, rayon_alerte),
    buildZone(groupB, rayon_alerte),
  ]
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

  // ── Etape 1 : Grouper par commune ──────────────────────────────────────────
  const communes = new Map<string, {
    points:    GeoPoint[]
    dpeChauds: number
    dpeTièdes: number
  }>()

  for (const p of points) {
    const key = p.code_insee ?? 'inconnu'
    const entry = communes.get(key) ?? { points: [], dpeChauds: 0, dpeTièdes: 0 }
    entry.points.push(p)
    entry.dpeChauds  += p.dpe_chauds ?? 0
    entry.dpeTièdes  += p.dpe_tièdes ?? 0
    communes.set(key, entry)
  }

  // ── Etape 2 : Scorer chaque commune ────────────────────────────────────────
  // Score = nb_prospectables + bonus DPE
  // bonus = dpe_poids * (dpe_chauds * 2 + dpe_tièdes * 1)
  const communesList = [...communes.entries()].map(([insee, data]) => ({
    insee,
    data,
    score: data.points.length + dpeParams.poids * (data.dpeChauds * 2 + data.dpeTièdes),
    dpeRatio: data.dpeChauds / Math.max(data.points.length, 1),
  }))

  // Trier par score decroissant
  communesList.sort((a, b) => b.score - a.score)

  // ── Etape 3 : Selectionner et construire les zones ─────────────────────────
  const zones: DensityZone[] = []
  const communesCouvertes = new Set<string>()

  for (const com of communesList) {
    if (zones.length >= nb_zones) break

    // Communes tres grandes -> diviser en 2 zones si on a de la place
    const nbZonesRestantes = nb_zones - zones.length
    if (com.data.points.length > capacite_cible * 1.8 && nbZonesRestantes >= 2) {
      const subzones = splitCommune(com.data.points, capacite_cible, rayon_alerte)
      for (const z of subzones) {
        if (zones.length < nb_zones) zones.push(z)
      }
    } else {
      // Prendre les `capacite_cible` adresses les plus proches du centroid de la commune
      const c = centroid(com.data.points)
      const sorted = [...com.data.points]
        .map(p => ({ p, d: haversine(p.lat, p.lon, c.lat, c.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, capacite_cible)
        .map(x => x.p)
      zones.push(buildZone(sorted, rayon_alerte))
    }

    communesCouvertes.add(com.insee)
  }

  // ── Etape 4 : Passe de rattrapage DPE ─────────────────────────────────────
  // Communes non couvertes avec fort signal DPE -> forcer l'inclusion
  if (dpeParams.poids > 0 && dpeParams.seuil_inclusion > 0) {
    for (const com of communesList) {
      if (communesCouvertes.has(com.insee)) continue
      if (com.data.dpeChauds < dpeParams.seuil_inclusion) continue

      const c = centroid(com.data.points)
      const sorted = [...com.data.points]
        .map(p => ({ p, d: haversine(p.lat, p.lon, c.lat, c.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, capacite_cible)
        .map(x => x.p)

      if (zones.length >= nb_zones) {
        // Remplacer la zone la moins bien scoree (moins d'adresses ET moins de DPE)
        const minIdx = zones.reduce((m, z, i, arr) => {
          const scoreZ = z.points.length + dpeParams.poids * z.nb_dpe_chauds * 2
          const scoreM = arr[m].points.length + dpeParams.poids * arr[m].nb_dpe_chauds * 2
          return scoreZ < scoreM ? i : m
        }, 0)
        zones[minIdx] = buildZone(sorted, rayon_alerte, true)
      } else {
        zones.push(buildZone(sorted, rayon_alerte, true))
      }

      communesCouvertes.add(com.insee)
    }
  }

  // ── Adresses hors-zone ─────────────────────────────────────────────────────
  const assignedIds = new Set(zones.flatMap(z => z.points.map(p => p.id)))
  const horsZone = points.filter(p => !assignedIds.has(p.id))

  return { zones, horsZone }
}
