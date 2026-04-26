import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const FIELDS = 'id, nom, prenom, telephone, email, agence_nom, agence_adresse, agence_telephone, agence_email'
const ALLOWED = ['nom','prenom','telephone','email','agence_nom','agence_adresse','agence_telephone','agence_email']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data } = await adminDb
    .from('commerciaux')
    .select(FIELDS)
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({ profil: data ?? {}, is_commercial: !!data })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await request.json()
  const update: any = {}
  for (const k of ALLOWED) if (body[k] !== undefined) update[k] = body[k]

  const adminDb = createAdminClient()

  // Vérifier que l'utilisateur est bien un commercial
  const { data: commercial } = await adminDb
    .from('commerciaux')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!commercial) {
    // Manager ou utilisateur sans profil commercial : retourner ok sans modifier
    // (les managers n'ont pas encore de table dédiée dans ce projet)
    return NextResponse.json({ ok: true, warning: 'Profil manager non modifiable pour l instant' })
  }

  const { error } = await adminDb
    .from('commerciaux')
    .update(update)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
