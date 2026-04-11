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
  const rayon_metres: number = body.rayon_metres ?? body.rayon_metres ?? 800
  const exclure_commerces:    boolean = body.exclure_commerces ?? false
  // Parametres DPE
  const dpe_fenetre_mois:    number  = body.dpe_fenetre_mois    ?? 6
  const dpe_poids:           number  = body.dpe_poids           ?? 0
  const dpe_seuil_inclusion: number  = body.dpe_seuil_inclusion ?? 10

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
  // Une seule requete pour toutes les communes (plus rapide que les batches)
    const sinceDate = new Date(now - extWindowMs).toISOString().slice(0, 10)
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

  if (adresses.length === 0)
    return NextResponse.json({ error: 'Aucune adresse trouvée' }, { status: 400 })

  const prospectables = adresses.filter((a: any) => {
    if (a.type_bien === 'logement_social') return false
    if (exclure_commerces && a.type_bien === 'commerce') return false
    return true
  })

  // Charger les DPE de la fenetre temporelle choisie
  const dpeMap = new Map<string, { chauds: number; tiedes: number }>()
  if (dpe_poids > 0) {
    const dpeWindowMs = dpe_fenetre_mois * 30 * 24 * 60 * 60 * 1000
    const extWindowMs = dpe_fenetre_mois * 2 * 30 * 24 * 60 * 60 * 1000
    const now = Date.now()

    // Requete unique pour toutes les communes (perf)
    const sinceDate = new Date(now - extWindowMs).toISOString().slice(0, 10)
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
    id:          a.id,
    lat:         a.lat,
    lon:         a.lon,
    prospectable: true,
    code_insee:  a.code_insee,
    dpe_chauds:  dpeMap.get(a.id)?.chauds ?? 0,
    dpe_tiedes:  dpeMap.get(a.id)?.tiedes ?? 0,
  }))

  // Nouvel algorithme density-based
  const { zones: densityZones, horsZone } = generateDensityZones(
    points, nb_zones, capacite_cible, rayon_metres,
    { poids: dpe_poids, seuil_inclusion: dpe_seuil_inclusion }
  )

  // Log de debug pour comprendre l'algorithme
  console.log(`[ZONES] ${prospectables.length} adresses prospectables`)
  console.log(`[ZONES] ${densityZones.length} zones générées, ${horsZone.length} adresses hors-zone`)
  densityZones.forEach((z, i) => console.log(`[ZONES] Zone ${i+1}: ${z.points.length} adresses, rayon ${z.rayon_metres}m`))

  if (densityZones.length === 0)
    return NextResponse.json({
      error: "Aucune zone dense trouvée. Essayez d'augmenter le rayon ou de réduire la capacité cible."
    }, { status: 400 })

  // Sauvegarder le snapshot AVANT de supprimer (max 5 snapshots)
  const { data: existingFull } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, capacite_theorique, polygone_geojson')
    .eq('commercial_id', commercial.id)

  if (existingFull && existingFull.length > 0) {
    // Creer le snapshot
    await supabase.from('zones_snapshots').insert({
      commercial_id: user.id,
      nom:           `Découpage ${new Date().toLocaleDateString('fr-FR')} — ${existingFull.length} zones`,
      nb_zones:      existingFull.length,
      zones_data:    JSON.stringify(existingFull),
    })

    // Garder seulement les 5 derniers snapshots
    const { data: snapshots } = await supabase
      .from('zones_snapshots')
      .select('id, created_at')
      .eq('commercial_id', commercial.id)
      .order('created_at', { ascending: false })

    if (snapshots && snapshots.length > 5) {
      const toDelete = snapshots.slice(5).map((s: any) => s.id)
      await supabase.from('zones_snapshots').delete().in('id', toDelete)
    }

    // Supprimer proprement dans l'ordre (FK)
    const existingIds = existingFull.map((z: any) => z.id)
    await supabase.from('planning_sessions').update({ zone_id: null }).in('zone_id', existingIds)
    for (const b of chunk(existingIds, 50)) {
      await supabase.from('itineraires_zone').delete().in('zone_id', b)
    }
    await supabase.from('zones_prospection').delete().eq('commercial_id', commercial.id)
  }

  // Libérer les adresses
  for (const b of batches) {
    await supabase.from('adresses').update({ zone_id: null }).in('code_insee', b)
  }

  const createdZones = []
  const warnings: string[] = []

  for (let i = 0; i < densityZones.length; i++) {
    const dz = densityZones[i]

    if (dz.depasse_seuil) {
      warnings.push(
        `Zone ${i+1} : ${dz.points.length} adresses seulement (seuil ${rayon_metres}m atteint avant ${capacite_cible})`
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
        nb_dpe_chauds:        (dz as any).nb_dpe_chauds ?? 0,
        nb_dpe_tiedes:        (dz as any).nb_dpe_tiedes ?? 0,
        dpe_prioritaire:      (dz as any).dpe_prioritaire ?? false,
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
    config: { nb_zones, capacite_cible, rayon_metres, exclure_commerces },
  })
}
