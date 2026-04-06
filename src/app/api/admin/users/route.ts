// src/app/api/admin/users/route.ts

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Genère un mot de passe temporaire lisible */
function genTempPassword(): string {
  const adj  = ['Bleu', 'Vert', 'Fort', 'Vif', 'Grand']
  const noun = ['Soleil', 'Ciel', 'Mer', 'Mont', 'Parc']
  const num  = Math.floor(10 + Math.random() * 90)
  return `${adj[Math.floor(Math.random()*adj.length)]}${noun[Math.floor(Math.random()*noun.length)]}${num}!`
}

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

  const admin       = createAdminClient()
  const tempPassword = genTempPassword()

  // Créer l'utilisateur avec mot de passe temporaire
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password:      tempPassword,
    email_confirm: true,  // pas besoin de confirmer l'email
    user_metadata: { prenom, nom },
  })

  if (createErr || !newUser.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Erreur création' }, { status: 500 })
  }

  // Upsert profil commerciaux (gère le trigger Supabase qui crée déjà la ligne)
  await supabase.from('commerciaux').upsert({
    id:     newUser.user.id,
    email,
    prenom,
    nom,
    role:   role ?? 'commercial',
  }, { onConflict: 'id' })

  // Retourner le mot de passe temporaire à afficher dans l'UI admin
  return NextResponse.json({
    success:       true,
    user_id:       newUser.user.id,
    temp_password: tempPassword,
  })
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
  if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

  if (user_id === user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  await supabase.from('commerciaux').delete().eq('id', user_id)
  return NextResponse.json({ success: true })
}
