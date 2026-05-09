import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    statut, zone_id, notes,
    nb_adresses_visitees, nb_contacts,
    nb_maisons_qualifiees, nb_immeubles_qualifies,
    nb_syndics_qualifies, nb_adresses_supprimees,
    date_session,
  } = body

  const updates: any = {}
  if (statut                !== undefined) updates.statut                = statut
  if (zone_id               !== undefined) updates.zone_id               = zone_id
  if (notes                 !== undefined) updates.notes                 = notes
  if (nb_adresses_visitees  !== undefined) updates.nb_adresses_visitees  = nb_adresses_visitees
  if (nb_contacts           !== undefined) updates.nb_contacts           = nb_contacts
  if (nb_maisons_qualifiees !== undefined) updates.nb_maisons_qualifiees = nb_maisons_qualifiees
  if (nb_immeubles_qualifies!== undefined) updates.nb_immeubles_qualifies= nb_immeubles_qualifies
  if (nb_syndics_qualifies  !== undefined) updates.nb_syndics_qualifies  = nb_syndics_qualifies
  if (nb_adresses_supprimees!== undefined) updates.nb_adresses_supprimees= nb_adresses_supprimees
  if (date_session          !== undefined) updates.date_prevue           = date_session

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: 'Aucun champ a mettre a jour' }, { status: 400 })

  const { data, error } = await supabase
    .from('planning_sessions')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, notes, nb_adresses_total, nb_adresses_visitees, nb_contacts, nb_maisons_qualifiees, nb_immeubles_qualifies, nb_syndics_qualifies, nb_adresses_supprimees, zones_prospection (id, nom, couleur, numero)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
