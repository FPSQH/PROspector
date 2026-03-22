import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { bestKMeans } from '@/lib/geo/clustering'
import { pointsToPolygonWKT } from '@/lib/geo/convexHull'
import { nearestNeighborTSP } from '@/lib/geo/tsp'

const ZONE_COLORS = [
  '#E63946','#2196F3','#FF9800','#4CAF50','#9C27B0',
  '#00BCD4','#FF5722','#607D8B','#795548','#E91E63',
  '#00897B','#F57F17',
]

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

/** Distance en mètres entre deux points lat/lon (haversine approx) */
function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

/** Rayon max d'un cluster = distance max entre le centroïde et un point */
function rayonCluster(points: { lat: number; lon: number }[], centroid: { lat: number; lon: number }): number {
  return Math.max(...points.map((p) => distanceMetres(centroid.lat, centroid.lon, p.lat, p.lon)))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // ── Paramètres de configuration ──
  const body = await req.json().catch(() => ({}))
  const nb_zones:          number  = body.nb_zones          ?? 12
  const capacite_cible:    number  = body.capacite_cible    ?? 100
  const rayon_max_metres:  number  = body.rayon_max_metres  ?? 700
  const exclure_commerces: boolean = body.exclure_commerces ?? false

  // commerciaux.id = auth.uid()
  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()

  if (!commercial)
    return NextResponse.json({ error: 'Profil commercial non trouvé' }, { status: 404 })

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', commercial.id)

  if (!communes || communes.length === 0)
    return NextResponse.json({ error: 'Aucune commune configurée' }, { status: 400 })

  const codesInsee = communes.map((c: any) => c.code_insee)
  const batches    = chunk(codesInsee, 5)

  // ── Récupérer les adresses en batches ──
  const adresses: any[] = []
  for (const batchInsee of batches) {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, lat, lon, type_bien')
        .in('code_insee', batchInsee)
        .not('lat', 'is', null)
        .not('lon', 'is', null)
        .range(from, from + 999)

      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  if (adresses.length < nb_zones)
    return NextResponse.json(
      { error: `Seulement ${adresses.length} adresses — pas assez pour ${nb_zones} zones` },
      { status: 400 }
    )

  // ── Filtrer selon la configuration ──
  const prospectables = adresses.filter((a: any) => {
    if (a.type_bien === 'logement_social') return false
    if (exclure_commerces && a.type_bien === 'commerce') return false
    return true
  })

  if (prospectables.length < nb_zones)
    return NextResponse.json(
      { error: `Seulement ${prospectables.length} adresses prospectables pour ${nb_zones} zones` },
      { status: 400 }
    )

  // ── Clustering K-means++ ──
  const points = prospectables.map((a: any) => ({
    id: a.id, lat: a.lat, lon: a.lon, prospectable: true,
  }))

  const clusters = bestKMeans(points, nb_zones, 8) // 8 runs pour plus de stabilité

  // ── Supprimer zones + itinéraires existants ──
  const { data: existingZones } = await supabase
    .from('zones_prospection').select('id').eq('commercial_id', commercial.id)

  if (existingZones && existingZones.length > 0) {
    const ids = existingZones.map((z: any) => z.id)
    await supabase.from('itineraires_zone').delete().in('zone_id', ids)
    await supabase.from('zones_prospection').delete().eq('commercial_id', commercial.id)
  }

  for (const batchInsee of batches) {
    await supabase.from('adresses').update({ zone_id: null }).in('code_insee', batchInsee)
  }

  // ── Créer les nouvelles zones ──
  const createdZones = []
  const warnings: string[] = []

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    const nbAddr  = cluster.points.length

    // Vérification du rayon
    const rayon = rayonCluster(
      cluster.points.map((p) => ({ lat: p.lat, lon: p.lon })),
      cluster.centroid
    )
    const tropGrande = rayon > rayon_max_metres
    const surcharge  = nbAddr > capacite_cible * 1.5

    if (tropGrande) warnings.push(`Zone ${i+1} : rayon ${Math.round(rayon)}m > ${rayon_max_metres}m`)
    if (surcharge)  warnings.push(`Zone ${i+1} : ${nbAddr} adresses > cible ${capacite_cible}`)

    const polygonWKT = pointsToPolygonWKT(
      cluster.points.map((p) => ({ lon: p.lon, lat: p.lat })),
      0.001 // buffer réduit (~100m) pour des zones plus précises
    )

    const { data: zone, error: errZone } = await supabase
      .from('zones_prospection')
      .insert({
        commercial_id:        commercial.id,
        nom:                  `Zone ${i + 1}`,
        numero:               i + 1,
        couleur:              ZONE_COLORS[i % ZONE_COLORS.length],
        capacite_theorique:   nbAddr,
        nb_adresses:          nbAddr,
        nb_prospectables:     nbAddr,
        nb_logements_sociaux: 0,
        statut:               tropGrande || surcharge ? 'attention' : 'active',
        polygone:             polygonWKT || undefined,
      })
      .select().single()

    if (errZone || !zone) { console.error('Erreur zone:', errZone); continue }

    // Rattacher adresses
    const adresseIds = cluster.points.map((p) => p.id)
    for (const batchIds of chunk(adresseIds, 100)) {
      await supabase.from('adresses').update({ zone_id: zone.id }).in('id', batchIds)
    }

    // Itinéraire TSP
    const orderedRoute = nearestNeighborTSP(
      cluster.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))
    )
    const itineraireRows = orderedRoute.map((p, idx) => ({
      zone_id: zone.id, adresse_id: p.id, ordre: idx + 1,
    }))
    for (const batchRows of chunk(itineraireRows, 100)) {
      await supabase.from('itineraires_zone').insert(batchRows)
    }

    createdZones.push({
      ...zone,
      rayon_metres: Math.round(rayon),
      trop_grande:  tropGrande,
      surcharge,
    })
  }

  return NextResponse.json({
    success:   true,
    nb_zones:  createdZones.length,
    zones:     createdZones,
    warnings,
    config: { nb_zones, capacite_cible, rayon_max_metres, exclure_commerces },
    nb_adresses_total:   adresses.length,
    nb_prospectables:    prospectables.length,
  })
}
