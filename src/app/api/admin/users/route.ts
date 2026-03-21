import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Vérifier que l'appelant est un manager connecté
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: caller } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (caller?.role !== 'manager') {
    return NextResponse.json({ error: 'Réservé aux managers' }, { status: 403 })
  }

  const { email, prenom, nom, role } = await request.json()
  if (!email || !prenom || !nom) {
    return NextResponse.json({ error: 'email, prenom et nom requis' }, { status: 400 })
  }

  // Créer l'utilisateur avec le service role (contourne la confirmation email)
  const admin = createAdminClient()

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: true,   // compte actif immédiatement
    user_metadata: { prenom, nom, role },
  })

  if (createErr) {
    // Email déjà utilisé → renvoyer un magic link
    if (createErr.message.includes('already been registered')) {
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: email.trim().toLowerCase(),
      })
      return NextResponse.json({ ok: true, existing: true })
    }
    return NextResponse.json({ error: createErr.message }, { status: 500 })
  }

  // Insérer dans la table commerciaux (le trigger handle_new_user peut le faire aussi,
  // mais on force ici pour avoir prenom/nom/role corrects)
  await admin.from('commerciaux').upsert({
    id: newUser.user!.id,
    email: email.trim().toLowerCase(),
    prenom,
    nom,
    role: role ?? 'commercial',
  }, { onConflict: 'id' })

  // Envoyer le magic link d'invitation
  await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.trim().toLowerCase(),
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  })

  return NextResponse.json({ ok: true })
}
