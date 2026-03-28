import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/zones/reset
// Supprime toutes les zones du commercial sans toucher aux sessions ni interactions
// Sauvegarde un snapshot avant suppression
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sauvegarder = body.sauvegarder !== false // true par défaut

  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()
  if (!commercial) return NextResponse.json({ error: 'Commercial non trouve' }, { status: 404 })

  // Récupérer les zones actuelles
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, capacite_theorique, polygone_geojson')
    .eq('commercial_id', commercial.id)

  if (!zones || zones.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aucune zone a supprimer', nb_supprimees: 0 })
  }

  // Sauvegarder le snapshot si demandé
  if (sauvegarder) {
    await supabase.from('zones_snapshots').insert({
      commercial_id: commercial.id,
      nom:           `Sauvegarde manuelle ${new Date().toLocaleDateString('fr-FR')} — ${zones.length} zones`,
      nb_zones:      zones.length,
      zones_data:    JSON.stringify(zones),
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
  }

  const zoneIds = zones.map((z: any) => z.id)

  // Détacher les sessions du planning (ne pas supprimer les sessions elles-mêmes)
  await supabase
    .from('planning_sessions')
    .update({ zone_id: null })
    .in('zone_id', zoneIds)

  // Supprimer les itinéraires
  for (let i = 0; i < zoneIds.length; i += 50) {
    await supabase.from('itineraires_zone').delete().in('zone_id', zoneIds.slice(i, i + 50))
  }

  // Libérer les adresses (zone_id = null)
  for (let i = 0; i < zoneIds.length; i += 50) {
    await supabase.from('adresses').update({ zone_id: null }).in('zone_id', zoneIds.slice(i, i + 50))
  }

  // Supprimer les zones
  const { error } = await supabase
    .from('zones_prospection')
    .delete()
    .eq('commercial_id', commercial.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok:            true,
    nb_supprimees: zones.length,
    snapshot_sauvegarde: sauvegarder,
  })
}
