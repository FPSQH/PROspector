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

  // inviteUserByEmail crée l'utilisateur ET envoie l'email d'invitation en une seule opération
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { prenom, nom },
    redirectTo: 'https://prospector-sooty-seven.vercel.app/auth/callback?next=/onboarding',
  })

  if (inviteErr || !invited.user) {
    return NextResponse.json({ error: inviteErr?.message ?? 'Erreur invitation' }, { status: 500 })
  }

  // Upsert du profil commerciaux — gère le cas où un trigger Supabase
  // a déjà créé l'enregistrement avec role='commercial' par défaut
  await supabase.from('commerciaux').upsert({
    id:     invited.user.id,
    email,
    prenom,
    nom,
    role:   role ?? 'commercial',
  }, { onConflict: 'id' })

  return NextResponse.json({ success: true, user_id: invited.user.id })
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
