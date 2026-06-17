import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Colonnes existantes dans commerciaux (telephone ajoutée via migration SQL)
const FIELDS = 'id, nom, prenom, email, telephone, agent_titre, agence_nom, agence_adresse, agence_telephone, agence_email'
const ALLOWED = ['nom', 'prenom', 'email', 'telephone', 'agent_titre', 'agence_nom', 'agence_adresse', 'agence_telephone', 'agence_email']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data, error } = await adminDb
    .from('commerciaux')
    .select(FIELDS)
    .eq('id', user.id)
    .maybeSingle()

  if (error) console.error('[SETTINGS GET]', error.message)
  return NextResponse.json({ profil: data ?? {}, is_commercial: !!data })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await request.json()
  const update: any = {}
  for (const k of ALLOWED) {
    if (body[k] !== undefined) update[k] = body[k]
  }

  const adminDb = createAdminClient()
  const { error } = await adminDb
    .from('commerciaux')
    .update(update)
    .eq('id', user.id)

  if (error) {
    console.error('[SETTINGS PUT]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
