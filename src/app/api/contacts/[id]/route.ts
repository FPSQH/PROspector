import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // ✅ Séparer update et select pour éviter PGRST116 avec RLS
  const { error } = await supabase
    .from('contacts')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: contact } = await supabase
    .from('contacts')
    .select('*, adresses(id, numero, nom_voie, code_postal, commune)')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ contact: contact ?? {} })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
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
