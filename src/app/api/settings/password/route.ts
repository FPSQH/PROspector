import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.current || !body?.new_password) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  if (body.new_password.length < 8) {
    return NextResponse.json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' }, { status: 400 })
  }

  // Vérifier le mot de passe actuel via une tentative de connexion
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email:    user.email!,
    password: body.current,
  })

  if (signInError) {
    return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 400 })
  }

  // Mettre à jour le mot de passe
  const { error: updateError } = await supabase.auth.updateUser({
    password: body.new_password,
  })

  if (updateError) {
    console.error('[SETTINGS PASSWORD]', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
