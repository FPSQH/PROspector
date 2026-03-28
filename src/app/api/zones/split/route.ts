import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/zones/split
// Body : { zone_id, axis, position, nom_a?, nom_b? }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { zone_id, axis, position, nom_a, nom_b } = body

  if (!zone_id || !axis || position === undefined) {
    return NextResponse.json({ error: 'zone_id, axis et position requis' }, { status: 400 })
  }
  if (!['horizontal', 'vertical'].includes(axis)) {
    return NextResponse.json({ error: 'axis doit être "horizontal" ou "vertical"' }, { status: 400 })
  }

  // Vérifier que la zone appartient au commercial
  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, nom, nb_adresses')
    .eq('id', zone_id)
    .eq('commercial_id', user.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvée' }, { status: 404 })

  const nomBase = zone.nom ?? 'Zone'
  const nomA = nom_a ?? `${nomBase}a`
  const nomB = nom_b ?? `${nomBase}b`

  // Sauvegarder l'historique avant division
  await supabase.rpc('save_zone_version', {
    p_zone_id: zone_id, p_type_modif: 'division', p_modifie_par: user.id,
  })

  // Diviser via PostGIS
  const { data: result, error } = await supabase.rpc('split_zone', {
    p_zone_id:       zone_id,
    p_axis:          axis,
    p_position:      position,
    p_nom_a:         nomA,
    p_nom_b:         nomB,
    p_commercial_id: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!result || result.length === 0) {
    return NextResponse.json({ error: 'Division impossible — polygone trop petit ou position hors zone' }, { status: 400 })
  }

  const { zone_a_id, zone_b_id } = result[0]

  // Recalculer les deux itinéraires
  await Promise.all([
    supabase.rpc('recalc_itineraire_zone', { p_zone_id: zone_a_id }),
    supabase.rpc('recalc_itineraire_zone', { p_zone_id: zone_b_id }),
  ])

  // Récupérer les infos des deux nouvelles zones
  const { data: zonesResultat } = await supabase
    .from('zones_prospection')
    .select('id, nom, nb_adresses')
    .in('id', [zone_a_id, zone_b_id])

  const zA = zonesResultat?.find((z: any) => z.id === zone_a_id)
  const zB = zonesResultat?.find((z: any) => z.id === zone_b_id)

  return NextResponse.json({
    ok: true,
    zone_a: { id: zone_a_id, nom: zA?.nom, nb_adresses: zA?.nb_adresses },
    zone_b: { id: zone_b_id, nom: zB?.nom, nb_adresses: zB?.nb_adresses },
    alerte_petite_zone: (zA?.nb_adresses ?? 0) < 50 || (zB?.nb_adresses ?? 0) < 50,
  })
}
