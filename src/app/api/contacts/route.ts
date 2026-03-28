import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/contacts?adresse_id=&a_relancer=true
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const adresse_id  = searchParams.get('adresse_id')
  const a_relancer  = searchParams.get('a_relancer')

  let query = supabase
    .from('contacts')
    .select(`
      id, adresse_id, interaction_id,
      nom, prenom, tel1, tel2, email1, email2,
      type_contact, note, date_relance, statut_pipeline,
      created_at, updated_at,
      adresses (numero, nom_voie, commune, code_postal)
    `)
    .eq('commercial_id', user.id)
    .order('created_at', { ascending: false })

  if (adresse_id) query = query.eq('adresse_id', adresse_id)
  if (a_relancer === 'true') {
    query = query
      .not('date_relance', 'is', null)
      .lte('date_relance', new Date().toISOString().split('T')[0])
  }

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

// POST /api/contacts — créer ou mettre à jour une fiche contact
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    adresse_id, interaction_id,
    nom, prenom, tel1, tel2, email1, email2,
    type_contact, note, date_relance, statut_pipeline,
  } = body

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      commercial_id:  user.id,
      adresse_id:     adresse_id     ?? null,
      interaction_id: interaction_id ?? null,
      nom:            nom            ?? null,
      prenom:         prenom         ?? null,
      tel1:           tel1           ?? null,
      tel2:           tel2           ?? null,
      email1:         email1         ?? null,
      email2:         email2         ?? null,
      type_contact:   type_contact   ?? null,
      note:           note           ?? null,
      date_relance:   date_relance   ?? null,
      statut_pipeline: statut_pipeline ?? 'prospect',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact })
}
