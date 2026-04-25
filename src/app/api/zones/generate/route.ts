import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateDensityZones } from '@/lib/geo/densityZones'
import { nearestNeighborTSP } from '@/lib/geo/tsp'
import { pointsToPolygonWKT , hullToGeoJSON } from '@/lib/geo/convexHull'

const ZONE_COLORS = [
  '#E63946','#2196F3','#FF9800','#4CAF50','#9C27B0',
  '#00BCD4','#795548','#607D8B','#F06292','#AED581',
  '#FFD54F','#4DB6AC',
]

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

// Generer le WKT d'un convex hull depuis un tableau de points
function pointsToConvexHullWKT(pts: Array<{ lat: number; lon: number }>): string | null {
  if (pts.length < 3) return null
  return pointsToPolygonWKT(pts.map(p => [p.lon, p.lat] as [number, number]))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nb_zones:            number  = body.nb_zones            ?? 12
  const capacite_cible:      number  = body.capacite_cible      ?? 100
  const rayon_metres:        number  = body.rayon_metres        ?? body.rayon_alerte_metres ?? 800
  const exclure_commerces:   boolean = body.exclure_commerces   ?? false
  const dpe_fenetre_mois:    number  = body.dpe_fenetre_mois    ?? 6
  const dpe_poids:           number  = body.dpe_poids           ?? 0
  const dpe_seuil_inclusion: number  = body.dpe_seuil_inclusion ?? 10
  const poids_collectif:     number  = body.poids_collectif      ?? 0.5

  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()
  if (!commercial) return NextResponse.json({ error: 'Profil commercial non trouve' }, { status: 404 })

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', commercial.id)
  if (!communes?.length) return NextResponse.json({ error: 'Aucune commune configuree' }, { status: 400 })

  const codesInsee = communes.map((c: any) => c.code_insee)
  const batches    = chunk(codesInsee, 5)

  // Charger toutes les adresses (range large pour depasser la limite 1000 Supabase)
  const adresses: any[] = []
  for (const batchInsee of batches) {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, lat, lon, type_bien, prospectable, code_insee')
        .in('code_insee', batchInsee)
        .eq('prospectable', true)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  const prospectables = adresses.filter((a: any) => {
    if (a.type_bien === 'logement_social') return false
    if (exclure_commerces && a.type_bien === 'commerce') return false
    return true
  })

  if (prospectables.length === 0)
    return NextResponse.json({ error: 'Aucune adresse trouvee' }, { status: 400 })

  // Charger les DPE si signal actif
  const dpeMap = new Map<string, { chauds: number; tiedes: number }>()
  if (dpe_poids > 0) {
    const now         = Date.now()
    const dpeWindowMs = dpe_fenetre_mois * 30 * 24 * 60 * 60 * 1000
    const extWindowMs = dpe_fenetre_mois * 2 * 30 * 24 * 60 * 60 * 1000
    const sinceDate   = new Date(now - extWindowMs).toISOString().slice(0, 10)

    const { data: dpeRows } = await supabase
      .from('dpe_logement')
      .select('adresse_id, date_etablissement')
      .in('code_insee', codesInsee)
      .not('adresse_id', 'is', null)
      .gte('date_etablissement', sinceDate)

    for (const dpe of dpeRows ?? []) {
      const ageMs = now - new Date(dpe.date_etablissement).getTime()
      const entry = dpeMap.get(dpe.adresse_id) ?? { chauds: 0, tiedes: 0 }
      if (ageMs <= dpeWindowMs)      entry.chauds++
      else if (ageMs <= extWindowMs) entry.tiedes++
      dpeMap.set(dpe.adresse_id, entry)
    }
  }

  const points = prospectables.map((a: any) => ({
    id:           a.id,
    lat:          a.lat,
    lon:          a.lon,
    prospectable: true,
    code_insee:   a.code_insee,
    dpe_chauds:   dpeMap.get(a.id)?.chauds ?? 0,
    dpe_tiedes:   dpeMap.get(a.id)?.tiedes ?? 0,
  }))

  console.log('[ZONES]', prospectables.length, 'adresses prospectables,',
    points.filter(p => p.dpe_chauds > 0).length, 'avec DPE chauds')

  const { zones: densityZones, horsZone } = generateDensityZones(
    points, nb_zones, capacite_cible, rayon_metres,
    { poids: dpe_poids, seuil_inclusion: dpe_seuil_inclusion, poids_collectif }
  )

  console.log('[ZONES]', densityZones.length, 'zones generees,', horsZone.length, 'hors-zone')

  if (densityZones.length === 0)
    return NextResponse.json({
      success: true, nb_zones: 0, zones: [], nb_hors_zone: horsZone.length,
      nb_prospectables: prospectables.length, warnings: [],
      config: { nb_zones, capacite_cible, rayon_metres, exclure_commerces }
    })

  // Sauvegarder snapshot avant suppression
  const { data: existingFull } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, capacite_theorique, polygone_geojson')
    .eq('commercial_id', user.id)

  if (existingFull && existingFull.length > 0) {
    await supabase.from('zones_snapshots').insert({
      commercial_id: user.id,
      nom:           'Sauvegarde manuelle ' + new Date().toLocaleDateString('fr-FR') + ' — ' + existingFull.length + ' zones',
      nb_zones:      existingFull.length,
      zones_data:    JSON.stringify(existingFull),
    })
    const { data: snapshots } = await supabase
      .from('zones_snapshots').select('id').eq('commercial_id', user.id)
      .order('created_at', { ascending: false })
    if (snapshots && snapshots.length > 5) {
      await supabase.from('zones_snapshots').delete().in('id', snapshots.slice(5).map((s: any) => s.id))
    }
    const existingIds = existingFull.map((z: any) => z.id)
    await supabase.from('planning_sessions').update({ zone_id: null }).in('zone_id', existingIds)
    await supabase.from('zones_prospection').delete().in('id', existingIds)
  }

  // Liberer les adresses
  for (const batchInsee of batches) {
    await supabase.from('adresses').update({ zone_id: null }).in('code_insee', batchInsee)
  }

  const warnings: string[] = []

  // Inserer les zones avec clip PostGIS pour eviter les overlaps
  // On garde la liste des WKT deja inseres pour clipper les suivants
  const insertedZoneIds: string[] = []

  for (let i = 0; i < densityZones.length; i++) {
    const dz      = densityZones[i]
    const couleur = ZONE_COLORS[i % ZONE_COLORS.length]

    // Convex hull des adresses de la zone (ordonnees par TSP pour le trace)
    const orderedPts = nearestNeighborTSP(dz.points)
    const rawWKT     = pointsToConvexHullWKT(orderedPts)
    const rawHull    = orderedPts.map(p => [p.lon, p.lat] as [number, number])
    const polygonGeoJSON = rawHull.length >= 3 ? JSON.stringify({ type: 'Polygon', coordinates: [hullToGeoJSON(rawHull)[0]] }) : null

    // FIX 3 : Clipper le polygone contre les zones deja inserees (ST_Difference)
    // On calcule le polygone final via une requete SQL PostGIS
    let polygonWKT: string | null = rawWKT

    if (rawWKT && insertedZoneIds.length > 0) {
      try {
        const { data: clipResult } = await supabase.rpc('clip_polygon_against_zones', {
          raw_wkt:  rawWKT,
          zone_ids: insertedZoneIds,
        })
        if (clipResult) polygonWKT = clipResult
      } catch (e) {
        // Si la fonction RPC n'existe pas encore, on garde le hull brut
        console.log('[ZONES] clip RPC non disponible, hull brut utilise')
      }
    }

    const { data: zone, error: zError } = await supabase
      .from('zones_prospection')
      .insert({
        commercial_id:        user.id,
        numero:               i + 1,
        nom:                  'Zone ' + (i + 1),
        couleur,
        capacite_theorique:   capacite_cible,
        nb_adresses:          dz.points.length,
        nb_prospectables:     dz.points.length,
        nb_dpe_chauds:        dz.nb_dpe_chauds ?? 0,
        nb_dpe_tiedes:        dz.nb_dpe_tiedes ?? 0,
        dpe_prioritaire:      dz.dpe_prioritaire ?? false,
        nb_logements_sociaux: 0,
        statut:               'active',
        polygone:             polygonWKT ?? null,
        polygone_geojson:     polygonGeoJSON ?? null,
      })
      .select('id')
      .single()

    if (zError || !zone) {
      console.error('[ZONES] erreur insertion zone', i+1, zError?.message)
      warnings.push('Zone ' + (i+1) + ' : erreur insertion - ' + (zError?.message ?? 'inconnu'))
      continue
    }

    if (dz.rayon_metres > rayon_metres) {
      warnings.push('Zone ' + (i+1) + ' : rayon etendu a ' + dz.rayon_metres + 'm (' + dz.points.length + ' adresses)')
    }

    insertedZoneIds.push(zone.id)

    // Assigner les adresses
    const adresseBatches = chunk(dz.points.map(p => p.id), 100)
    for (const batch of adresseBatches) {
      await supabase.from('adresses').update({ zone_id: zone.id }).in('id', batch)
    }
  }

  return NextResponse.json({
    success:          true,
    nb_zones:         densityZones.length,
    nb_hors_zone:     horsZone.length,
    nb_prospectables: prospectables.length,
    warnings,
    config: { nb_zones, capacite_cible, rayon_metres, exclure_commerces },
  })
}
