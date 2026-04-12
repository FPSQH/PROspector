import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_TYPE_CONTACT = ['interet_vente','projet_moyen','projet_long','voisin_relais','recommandation','commercant','autre']
const VALID_STATUT = ['prospect','qualification','estimation','mandat','perdu']
const VALID_HORIZON = ['moins_6_mois','6_12_mois','1_2_ans','plus_2_ans']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filtre       = searchParams.get('filtre')       ?? 'tous'
  const recherche    = searchParams.get('recherche')    ?? ''
  const type_contact = searchParams.get('type_contact') ?? ''

  let query = supabase
    .from('contacts')
    .select(`id, adresse_id, interaction_id, nom, prenom, tel1, tel2, email1,
      type_contact, notes, date_relance, statut_pipeline, created_at, updated_at,
      adresses ( id, numero, nom_voie, code_postal, commune )`)
    .eq('commercial_id', user.id)
    .order('updated_at', { ascending: false })

  if (filtre === 'relance') {
    query = query.not('date_relance', 'is', null).lte('date_relance', new Date().toISOString().split('T')[0])
  }
  if (type_contact) query = query.eq('type_contact', type_contact)
  if (recherche)    query = query.or('nom.ilike.%' + recherche + '%,prenom.ilike.%' + recherche + '%,notes.ilike.%' + recherche + '%')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Sanitiser les champs pour eviter les violations de contraintes CHECK
  const insert: Record<string, any> = {
    commercial_id:   user.id,
    adresse_id:      body.adresse_id      || null,
    interaction_id:  body.interaction_id  || null,
    nom:             body.nom             || null,
    prenom:          body.prenom          || null,
    tel1:            body.tel1            || null,
    tel2:            body.tel2            || null,
    email1:          body.email1          || null,
    email2:          body.email2          || null,
    notes:           body.notes           || null,
    date_relance:    body.date_relance    || null,
    type_contact:    VALID_TYPE_CONTACT.includes(body.type_contact) ? body.type_contact : null,
    statut_pipeline: VALID_STATUT.includes(body.statut_pipeline) ? body.statut_pipeline : 'prospect',
    horizon_vente:   VALID_HORIZON.includes(body.horizon_vente)  ? body.horizon_vente  : null,
    hors_secteur:    body.hors_secteur === true,
  }

  const { data, error } = await supabase.from('contacts').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}
