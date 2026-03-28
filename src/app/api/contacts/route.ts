import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const adresse_id = searchParams.get('adresse_id')
  const a_relancer = searchParams.get('a_relancer')

  let query = supabase
    .from('contacts')
    .select('id, adresse_id, interaction_id, nom, prenom, tel1, tel2, email1, email2, type_contact, notes, date_relance, statut_pipeline, created_at, updated_at')
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

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}

  const row: any = { commercial_id: user.id }

  if (body.adresse_id)     row.adresse_id     = body.adresse_id
  if (body.interaction_id) row.interaction_id = body.interaction_id
  if (body.nom)            row.nom            = body.nom
  if (body.prenom)         row.prenom         = body.prenom
  if (body.tel1)           row.tel1           = body.tel1
  if (body.tel2)           row.tel2           = body.tel2
  if (body.email1)         row.email1         = body.email1
  if (body.email2)         row.email2         = body.email2
  if (body.type_contact)   row.type_contact   = body.type_contact
  if (body.date_relance)   row.date_relance   = body.date_relance
  // Accepter 'note' ou 'notes' depuis le client
  const noteValue = body.notes ?? body.note
  if (noteValue)           row.notes          = noteValue

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[contacts POST]', error.message, error.details, error.hint, JSON.stringify(row))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contact })
}
