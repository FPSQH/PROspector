import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json()
  const { code_insee, nom, code_postal, departement } = body

  if (!code_insee || !nom) {
    return NextResponse.json({ error: 'code_insee et nom requis' }, { status: 400 })
  }

  // Insérer la commune (idempotent grâce à ON CONFLICT)
  const { data, error } = await supabase
    .from('communes')
    .upsert({
      commercial_id: user.id,
      code_insee,
      nom,
      code_postal,
      departement,
      chargee_at: null,  // sera mis à jour après ingestion BAN
    }, { onConflict: 'commercial_id,code_insee' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Lancer l'ingestion BAN en arrière-plan (fire & forget)
  // Ne pas attendre la réponse pour ne pas bloquer l'UI
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ingestion/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY! },
    body: JSON.stringify({ code_insee, nom, departement, commune_id: data.id }),
  }).catch(console.error)

  return NextResponse.json({ commune: data, ingestion: 'started' })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const code_insee = searchParams.get('code_insee')
  if (!code_insee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  const { error } = await supabase
    .from('communes')
    .delete()
    .eq('commercial_id', user.id)
    .eq('code_insee', code_insee)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
