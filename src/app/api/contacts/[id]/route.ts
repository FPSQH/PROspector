import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// GET /api/contacts/[id]
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: contact } = await supabase
    .from('contacts')
    .select(`
      *, adresses (numero, nom_voie, commune, code_postal)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!contact) return NextResponse.json({ error: 'Contact non trouve' }, { status: 404 })
  return NextResponse.json({ contact })
}

// PATCH /api/contacts/[id]
export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['nom','prenom','tel1','tel2','email1','email2',
    'type_contact','notes','date_relance','statut_pipeline']

  const updates: any = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}

// DELETE /api/contacts/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
