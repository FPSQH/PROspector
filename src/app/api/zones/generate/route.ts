import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { bestKMeans } from '@/lib/geo/clustering'
import { pointsToPolygonWKT } from '@/lib/geo/convexHull'
import { nearestNeighborTSP } from '@/lib/geo/tsp'

const ZONE_COLORS = [
  '#E63946', '#2196F3', '#FF9800', '#4CAF50', '#9C27B0',
  '#00BCD4', '#FF5722', '#607D8B', '#795548',
]

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nb_zones: number = body.nb_zones ?? 9

  // commerciaux.id = auth.uid() directement
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!commercial) {
    return NextResponse.json({ error: 'Profil commercial non trouvé' }, { status: 404 })
  }

  // Communes actives
  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', commercial.id)

  if (!communes || communes.length === 0) {
    return NextResponse.json({ error: 'Aucune commune configurée dans le secteur' }, { status: 400 })
  }

  const codesInsee = communes.map((c: any) => c.code_insee)

  // Adresses avec coordonnées
  const { data: adresses, error: errAddr } = await supabase
    .from('adresses')
    .select('id, latitude, longitude, type_bien')
    .in('code_insee', codesInsee)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (errAddr || !adresses) {
    return NextResponse.json({ error: 'Erreur récupération adresses' }, { status: 500 })
  }

  if (adresses.length < nb_zones) {
    return NextResponse.json(
      { error: `Seulement ${adresses.length} adresses — pas assez pour ${nb_zones} zones` },
      { status: 400 }
    )
  }

  const prospectables = adresses.filter(
    (a: any) => !a.type_bien || a.type_bien !== 'logement_social'
  )

  if (prospectables.length < nb_zones) {
    return NextResponse.json(
      { error: `Seulement ${prospectables.length} adresses prospectables pour ${nb_zones} zones` },
      { status: 400 }
    )
  }

  // ── Clustering K-means++ ──
  const points = prospectables.map((a: any) => ({
    id: a.id,
    lat: a.latitude,
    lon: a.longitude,
    prospectable: true,
  }))

  const clusters = bestKMeans(points, nb_zones, 5)

  // ── Supprimer zones + itinéraires existants ──
  const { data: existingZones } = await supabase
    .from('zones_prospection')
    .select('id')
    .eq('commercial_id', commercial.id)

  if (existingZones && existingZones.length > 0) {
    const ids = existingZones.map((z: any) => z.id)
    await supabase.from('itineraires_zone').delete().in('zone_id', ids)
    await supabase.from('zones_prospection').delete().eq('commercial_id', commercial.id)
  }

  // Reset zone_id sur les adresses
  await supabase.from('adresses').update({ zone_id: null }).in('code_insee', codesInsee)

  // ── Créer les nouvelles zones ──
  const createdZones = []

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    const nbTotal = cluster.points.length
    const nbLogSoc = adresses.filter((a: any) =>
      a.type_bien === 'logement_social' // les LS ne sont pas dans cluster mais on les rattache après
    ).length

    // Polygone convex hull + buffer
    const polygonWKT = pointsToPolygonWKT(
      cluster.points.map((p) => ({ lon: p.lon, lat: p.lat })),
      0.002
    )

    // Insertion zone — noms de colonnes réels
    const { data: zone, error: errZone } = await supabase
      .from('zones_prospection')
      .insert({
        commercial_id:      commercial.id,
        nom:                `Zone ${i + 1}`,
        numero:             i + 1,
        couleur:            ZONE_COLORS[i % ZONE_COLORS.length],
        capacite_theorique: nbTotal,
        nb_adresses:        nbTotal,
        nb_prospectables:   nbTotal,
        nb_logements_sociaux: 0,
        statut:             'active',
        polygone:           polygonWKT || undefined,
      })
      .select()
      .single()

    if (errZone || !zone) {
      console.error('Erreur création zone:', errZone)
      continue
    }

    // Rattacher les adresses à la zone
    const adresseIds = cluster.points.map((p) => p.id)
    await supabase.from('adresses').update({ zone_id: zone.id }).in('id', adresseIds)

    // ── Itinéraire TSP ──
    const orderedRoute = nearestNeighborTSP(
      cluster.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))
    )

    const itineraireRows = orderedRoute.map((p, idx) => ({
      zone_id:    zone.id,
      adresse_id: p.id,
      ordre:      idx + 1,
    }))

    if (itineraireRows.length > 0) {
      await supabase.from('itineraires_zone').insert(itineraireRows)
    }

    createdZones.push({ ...zone, nb_adresses: nbTotal })
  }

  return NextResponse.json({
    success: true,
    nb_zones: createdZones.length,
    zones:    createdZones,
    nb_adresses:        adresses.length,
    nb_prospectables: prospectables.length,
  })
}
