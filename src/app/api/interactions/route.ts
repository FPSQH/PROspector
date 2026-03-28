import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/interactions — qualifier une adresse pendant une session
// Body : {
//   session_id, adresse_id,
//   resultat: 'pas_de_reponse' | 'contact_etabli'
//   action?: 'flyer' | 'courrier' | 'rien'
//   type_habitat?: 'individuel' | 'collectif' | 'commerce' | 'autre'
//   nb_etages?: number
//   nom_boite?: string
//   type_contact?: string
//   note?: string
//   date_relance?: string
// }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    session_id, adresse_id, resultat, action,
    type_habitat, nb_etages, nom_boite,
    type_contact, note, date_relance,
  } = body

  if (!session_id || !adresse_id || !resultat) {
    return NextResponse.json(
      { error: 'session_id, adresse_id et resultat sont requis' },
      { status: 400 }
    )
  }

  // Vérifier que la session appartient au commercial
  const { data: session } = await supabase
    .from('sessions_prospection')
    .select('id, statut')
    .eq('id', session_id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  // Upsert : si une interaction existe déjà pour cette adresse+session, la remplacer
  const { data: existing } = await supabase
    .from('interactions')
    .select('id')
    .eq('session_id', session_id)
    .eq('adresse_id', adresse_id)
    .single()

  let interaction: any
  if (existing) {
    const { data } = await supabase
      .from('interactions')
      .update({
        resultat, action: action ?? null,
        type_habitat: type_habitat ?? null,
        nb_etages: nb_etages ?? null,
        nom_boite: nom_boite ?? null,
        type_contact: type_contact ?? null,
        note: note ?? null,
        date_relance: date_relance ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    interaction = data
  } else {
    const { data } = await supabase
      .from('interactions')
      .insert({
        session_id, adresse_id,
        commercial_id: user.id,
        resultat,
        action:        action        ?? null,
        type_habitat:  type_habitat  ?? null,
        nb_etages:     nb_etages     ?? null,
        nom_boite:     nom_boite     ?? null,
        type_contact:  type_contact  ?? null,
        note:          note          ?? null,
        date_relance:  date_relance  ?? null,
      })
      .select()
      .single()
    interaction = data
  }

  // Mettre à jour le compteur nb_portes de la session
  await supabase.rpc('increment_session_portes', { p_session_id: session_id })

  return NextResponse.json({ interaction, nouveau: !existing })
}

// GET /api/interactions?session_id=&adresse_id=
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  const adresse_id = searchParams.get('adresse_id')

  let query = supabase
    .from('interactions')
    .select('*')
    .eq('commercial_id', user.id)
    .order('created_at', { ascending: false })

  if (session_id) query = query.eq('session_id', session_id)
  if (adresse_id) query = query.eq('adresse_id', adresse_id)

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ interactions: data ?? [] })
}
