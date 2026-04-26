import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const COMM_FIELDS = 'nom, prenom, telephone, email, agence_nom, agence_adresse, agence_telephone, agence_email'
const ALLOWED = ['nom','prenom','telephone','email','agence_nom','agence_adresse','agence_telephone','agence_email']

async function findProfil(adminDb: any, userId: string) {
  // Chercher d'abord dans commerciaux
  const { data: comm } = await adminDb
    .from('commerciaux').select(COMM_FIELDS).eq('user_id', userId).maybeSingle()
  if (comm) return { profil: comm, table: 'commerciaux' }

  // Sinon chercher dans managers
  const { data: mgr } = await adminDb
    .from('managers').select('nom, prenom, email').eq('user_id', userId).maybeSingle()
  if (mgr) return { profil: { ...mgr, telephone: '', agence_nom: '', agence_adresse: '', agence_telephone: '', agence_email: '' }, table: 'managers' }

  return { profil: null, table: null }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  const adminDb = createAdminClient()
  const { profil } = await findProfil(adminDb, user.id)
  return NextResponse.json({ profil: profil ?? {} })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await request.json()
  const update: any = {}
  for (const k of ALLOWED) if (body[k] !== undefined) update[k] = body[k]

  const adminDb = createAdminClient()
  const { table } = await findProfil(adminDb, user.id)

  if (!table) return NextResponse.json({ error: 'Profil non trouve' }, { status: 404 })

  if (table === 'commerciaux') {
    const { error } = await adminDb.from('commerciaux').update(update).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Managers : seulement nom, prenom, email
    const mgrUpdate: any = {}
    for (const k of ['nom','prenom','email']) if (update[k] !== undefined) mgrUpdate[k] = update[k]
    const { error } = await adminDb.from('managers').update(mgrUpdate).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
