// src/app/api/admin/users/route.ts

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ── POST : créer un utilisateur ──────────────────────────────────────────────
export async function POST(request: Request) {
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

  const admin = createAdminClient()

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { prenom, nom },
  })

  if (createErr || !newUser.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Erreur création' }, { status: 500 })
  }

  // Créer le profil commerciaux
  await supabase.from('commerciaux').insert({
    id:     newUser.user.id,
    email,
    prenom,
    nom,
    role:   role ?? 'commercial',
  })

  // Envoyer un magic link d'invitation
  await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: 'https://prospector-sooty-seven.vercel.app/onboarding',
})

  return NextResponse.json({ success: true, user_id: newUser.user.id })
}

// ── DELETE : supprimer un utilisateur ────────────────────────────────────────
export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: caller } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (caller?.role !== 'manager') {
    return NextResponse.json({ error: 'Réservé aux managers' }, { status: 403 })
  }

  const { user_id } = await request.json()
  if (!user_id) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  // Empêcher l'auto-suppression
  if (user_id === user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Supprimer de auth.users (cascade sur commerciaux si FK configurée)
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id)
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  // Supprimer le profil commerciaux par sécurité
  await supabase.from('commerciaux').delete().eq('id', user_id)

  return NextResponse.json({ success: true })
}
