import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const adminDb = createAdminClient()
  const { data } = await adminDb.from('commerciaux')
    .select('nom, prenom, telephone, email, agence_nom, agence_adresse, agence_telephone, agence_email')
    .eq('user_id', user.id).single()
  return NextResponse.json({ profil: data ?? {} })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const body = await request.json()
  const allowed = ['nom','prenom','telephone','email','agence_nom','agence_adresse','agence_telephone','agence_email']
  const update: any = {}
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]
  const adminDb = createAdminClient()
  const { error } = await adminDb.from('commerciaux').update(update).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
