import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filtre       = searchParams.get('filtre')      ?? 'tous'
  const recherche    = searchParams.get('recherche')   ?? ''
  const type_contact = searchParams.get('type_contact') ?? ''

  let query = supabase
    .from('contacts')
    .select(`
      id, adresse_id, interaction_id,
      nom, prenom, tel1, tel2, email1,
      type_contact, notes, date_relance,
      statut_pipeline, created_at, updated_at,
      adresses ( numero, nom_voie, code_postal, nom_commune )
    `)
    .eq('commercial_id', user.id)
    .order('updated_at', { ascending: false })

  if (filtre === 'relance') {
    query = query
      .not('date_relance', 'is', null)
      .lte('date_relance', new Date().toISOString().split('T')[0])
  }
  if (type_contact) query = query.eq('type_contact', type_contact)
  if (recherche) query = query.or(
    'nom.ilike.%' + recherche + '%,prenom.ilike.%' + recherche + '%,notes.ilike.%' + recherche + '%'
  )

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...body, commercial_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}
