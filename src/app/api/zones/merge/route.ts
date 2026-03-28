import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/zones/merge
// Body : { zone_a_id, zone_b_id }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { zone_a_id, zone_b_id } = body

  if (!zone_a_id || !zone_b_id) {
    return NextResponse.json({ error: 'zone_a_id et zone_b_id requis' }, { status: 400 })
  }

  if (zone_a_id === zone_b_id) {
    return NextResponse.json({ error: 'Impossible de fusionner une zone avec elle-même' }, { status: 400 })
  }

  // Vérifier que les deux zones appartiennent au commercial
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, nb_adresses, capacite_theorique')
    .in('id', [zone_a_id, zone_b_id])
    .eq('commercial_id', user.id)

  if (!zones || zones.length !== 2) {
    return NextResponse.json({ error: 'Zones non trouvées ou non autorisées' }, { status: 404 })
  }

  const zoneA = zones.find((z: any) => z.id === zone_a_id)!
  const zoneB = zones.find((z: any) => z.id === zone_b_id)!
  const totalAdresses = (zoneA.nb_adresses ?? 0) + (zoneB.nb_adresses ?? 0)
  const capacite = zoneA.capacite_theorique ?? 150

  // Sauvegarder l'historique des deux zones avant fusion
  await supabase.rpc('save_zone_version', {
    p_zone_id: zone_a_id, p_type_modif: 'fusion', p_modifie_par: user.id,
  })
  await supabase.rpc('save_zone_version', {
    p_zone_id: zone_b_id, p_type_modif: 'fusion', p_modifie_par: user.id,
  })

  // Fusionner via PostGIS
  const { error } = await supabase.rpc('merge_zones', {
    p_zone_a_id: zone_a_id,
    p_zone_b_id: zone_b_id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculer l'itinéraire de la zone fusionnée
  await supabase.rpc('recalc_itineraire_zone', { p_zone_id: zone_a_id })

  return NextResponse.json({
    ok: true,
    zone_id: zone_a_id,
    nom: zoneA.nom,
    nb_adresses: totalAdresses,
    alerte_surcharge: totalAdresses > capacite * 2,
  })
}
