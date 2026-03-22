import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { bestKMeans } from '@/lib/geo/clustering'
import { pointsToPolygonWKT } from '@/lib/geo/convexHull'
import { nearestNeighborTSP } from '@/lib/geo/tsp'

const ZONE_COLORS = [
  '#E63946', '#2196F3', '#FF9800', '#4CAF50', '#9C27B0',
  '#00BCD4', '#FF5722', '#607D8B', '#795548',
]

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nb_zones: number = body.nb_zones ?? 9

  // commerciaux.id = auth.uid()
  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()

  if (!commercial) return NextResponse.json({ error: 'Profil commercial non trouvé' }, { status: 404 })

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', commercial.id)

  if (!communes || communes.length === 0)
    return NextResponse.json({ error: 'Aucune commune configurée' }, { status: 400 })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // ── Récupérer les adresses en batches de 5 codes INSEE ──
  const adresses: any[] = []
  const batches = chunk(codesInsee, 5)

  for (const batchInsee of batches) {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, latitude, longitude, type_bien')
        .in('code_insee', batchInsee)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
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

  const prospectables = adresses.filter(
    (a: any) => !a.type_bien || a.type_bien !== 'logement_social'
  )

  if (prospectables.length < nb_zones)
    return NextResponse.json(
      { error: `Seulement ${prospectables.length} adresses prospectables pour ${nb_zones} zones` },
      { status: 400 }
    )

  // ── Clustering K-means++ ──
  const points = prospectables.map((a: any) => ({
    id: a.id, lat: a.latitude, lon: a.longitude, prospectable: true,
  }))

  const clusters = bestKMeans(points, nb_zones, 5)

  // ── Supprimer zones existantes ──
  const { data: existingZones } = await supabase
    .from('zones_prospection').select('id').eq('commercial_id', commercial.id)

  if (existingZones && existingZones.length > 0) {
    const ids = existingZones.map((z: any) => z.id)
    await supabase.from('itineraires_zone').delete().in('zone_id', ids)
    await supabase.from('zones_prospection').delete().eq('commercial_id', commercial.id)
  }

  // Reset zone_id — en batches aussi
  for (const batchInsee of batches) {
    await supabase.from('adresses').update({ zone_id: null }).in('code_insee', batchInsee)
  }

  // ── Créer les nouvelles zones ──
  const createdZones = []

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]

    const polygonWKT = pointsToPolygonWKT(
      cluster.points.map((p) => ({ lon: p.lon, lat: p.lat })),
      0.002
    )

    const { data: zone, error: errZone } = await supabase
      .from('zones_prospection')
      .insert({
        commercial_id:        commercial.id,
        nom:                  `Zone ${i + 1}`,
        numero:               i + 1,
        couleur:              ZONE_COLORS[i % ZONE_COLORS.length],
        capacite_theorique:   cluster.points.length,
        nb_adresses:          cluster.points.length,
        nb_prospectables:     cluster.points.length,
        nb_logements_sociaux: 0,
        statut:               'active',
        polygone:             polygonWKT || undefined,
      })
      .select().single()

    if (errZone || !zone) {
      console.error('Erreur création zone:', errZone)
      continue
    }

    // Rattacher les adresses — en batches de 100 ids
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

    if (itineraireRows.length > 0) {
      // Insérer l'itinéraire en batches de 100
      for (const batchRows of chunk(itineraireRows, 100)) {
        await supabase.from('itineraires_zone').insert(batchRows)
      }
    }

    createdZones.push({ ...zone, nb_adresses: cluster.points.length })
  }

  return NextResponse.json({
    success: true,
    nb_zones: createdZones.length,
    zones: createdZones,
    nb_adresses_total: adresses.length,
    nb_prospectables: prospectables.length,
  })
}
