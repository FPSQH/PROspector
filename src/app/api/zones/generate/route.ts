import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateDensityZones } from '@/lib/geo/densityZones'
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

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nb_zones:          number  = body.nb_zones          ?? 12
  const capacite_cible:    number  = body.capacite_cible    ?? 100
  const rayon_alerte_metres: number  = body.rayon_alerte_metres ?? 500
  const exclure_commerces:    boolean = body.exclure_commerces ?? false

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

  if (adresses.length === 0)
    return NextResponse.json({ error: 'Aucune adresse trouvée' }, { status: 400 })

  const prospectables = adresses.filter((a: any) => {
    if (a.type_bien === 'logement_social') return false
    if (exclure_commerces && a.type_bien === 'commerce') return false
    return true
  })

  const points = prospectables.map((a: any) => ({
    id: a.id, lat: a.lat, lon: a.lon, prospectable: true,
  }))

  // Nouvel algorithme density-based
  const { zones: densityZones, horsZone } = generateDensityZones(
    points, nb_zones, capacite_cible, rayon_alerte_metres
  )

  // Log de debug pour comprendre l'algorithme
  console.log(`[ZONES] ${prospectables.length} adresses prospectables`)
  console.log(`[ZONES] ${densityZones.length} zones générées, ${horsZone.length} adresses hors-zone`)
  densityZones.forEach((z, i) => console.log(`[ZONES] Zone ${i+1}: ${z.points.length} adresses, rayon ${z.rayon_metres}m`))

  if (densityZones.length === 0)
    return NextResponse.json({
      error: "Aucune zone dense trouvée. Essayez d'augmenter le rayon ou de réduire la capacité cible."
    }, { status: 400 })

  // Supprimer zones existantes
  const { data: existing } = await supabase
    .from('zones_prospection').select('id').eq('commercial_id', commercial.id)
  if (existing && existing.length > 0) {
    await supabase.from('itineraires_zone').delete().in('zone_id', existing.map((z: any) => z.id))
    await supabase.from('zones_prospection').delete().eq('commercial_id', commercial.id)
  }
  for (const b of batches) {
    await supabase.from('adresses').update({ zone_id: null }).in('code_insee', b)
  }

  const createdZones = []
  const warnings: string[] = []

  for (let i = 0; i < densityZones.length; i++) {
    const dz = densityZones[i]

    if (dz.depasse_seuil) {
      warnings.push(
        `Zone ${i+1} : ${dz.points.length} adresses seulement (seuil ${rayon_alerte_metres}m atteint avant ${capacite_cible})`
      )
    }

    // Calculer le polygone en TypeScript (pas de RPC, pas de timeout)
    // Buffer minimal 0.0001° ≈ 10m pour couvrir les façades
    const polygonWKT = dz.points.length >= 3
      ? pointsToPolygonWKT(dz.points.map((p) => ({ lon: p.lon, lat: p.lat })), 0.0001)
      : undefined

    const { data: zone, error: errZone } = await supabase
      .from('zones_prospection')
      .insert({
        commercial_id:        commercial.id,
        nom:                  `Zone ${i + 1}`,
        numero:               i + 1,
        couleur:              ZONE_COLORS[i % ZONE_COLORS.length],
        capacite_theorique:   capacite_cible,
        nb_adresses:          dz.points.length,
        nb_prospectables:     dz.points.length,
        nb_logements_sociaux: 0,
        statut:               'active',
        polygone:             polygonWKT ?? null,
      })
      .select().single()

    if (errZone || !zone) continue

    // Assigner les adresses à la zone
    for (const b of chunk(dz.points.map((p) => p.id), 100)) {
      await supabase.from('adresses').update({ zone_id: zone.id }).in('id', b)
    }

    const route = nearestNeighborTSP(dz.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon })))
    for (const b of chunk(route.map((p, idx) => ({ zone_id: zone.id, adresse_id: p.id, ordre: idx + 1 })), 100)) {
      await supabase.from('itineraires_zone').insert(b)
    }

    createdZones.push({ ...zone, rayon_metres: dz.rayon_metres, tronquee: dz.depasse_seuil })
  }

  return NextResponse.json({
    success: true,
    nb_zones: createdZones.length,
    zones: createdZones,
    nb_hors_zone: horsZone.length,
    nb_prospectables: prospectables.length,
    warnings,
    config: { nb_zones, capacite_cible, rayon_alerte_metres, exclure_commerces },
  })
}
