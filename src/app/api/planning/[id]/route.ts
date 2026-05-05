import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['statut', 'zone_id', 'notes', 'nb_adresses_visitees', 'nb_contacts']
  const update: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (!Object.keys(update).length)
    return NextResponse.json({ error: 'Aucun champ a mettre a jour' }, { status: 400 })

  const { data, error } = await supabase
    .from('planning_sessions')
    .update(update)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, notes, nb_adresses_total, nb_adresses_visitees, nb_contacts, zones_prospection (id, nom, couleur, numero)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
