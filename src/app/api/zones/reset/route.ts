import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sauvegarder = body.sauvegarder !== false

  // Utiliser user.id directement — pas de jointure sur commerciaux
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, capacite_theorique')
    .eq('commercial_id', user.id)

  if (!zones || zones.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aucune zone a supprimer', nb_supprimees: 0 })
  }

  // Sauvegarder le snapshot
  if (sauvegarder) {
    await supabase.from('zones_snapshots').insert({
      commercial_id: user.id,
      nom:           `Sauvegarde manuelle ${new Date().toLocaleDateString('fr-FR')} — ${zones.length} zones`,
      nb_zones:      zones.length,
      zones_data:    JSON.stringify(zones),
    })

    // Garder seulement les 5 derniers
    const { data: all } = await supabase
      .from('zones_snapshots')
      .select('id, created_at')
      .eq('commercial_id', user.id)
      .order('created_at', { ascending: false })

    if (all && all.length > 5) {
      await supabase.from('zones_snapshots')
        .delete().in('id', all.slice(5).map((s: any) => s.id))
    }
  }

  const ids = zones.map((z: any) => z.id)

  // Détacher planning (sans supprimer les sessions)
  await supabase.from('planning_sessions')
    .update({ zone_id: null }).in('zone_id', ids)

  // Supprimer itinéraires
  for (let i = 0; i < ids.length; i += 50) {
    await supabase.from('itineraires_zone').delete().in('zone_id', ids.slice(i, i + 50))
  }

  // Libérer les adresses
  for (let i = 0; i < ids.length; i += 50) {
    await supabase.from('adresses').update({ zone_id: null }).in('zone_id', ids.slice(i, i + 50))
  }

  // Supprimer les zones
  const { error } = await supabase
    .from('zones_prospection')
    .delete()
    .eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, nb_supprimees: zones.length, snapshot_sauvegarde: sauvegarder })
}
