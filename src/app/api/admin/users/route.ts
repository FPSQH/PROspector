// src/app/api/admin/users/route.ts

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Génère un mot de passe temporaire lisible */
function genTempPassword(): string {
  const adj  = ['Bleu', 'Vert', 'Fort', 'Vif', 'Grand']
  const noun = ['Soleil', 'Ciel', 'Mer', 'Mont', 'Parc']
  const num  = Math.floor(10 + Math.random() * 90)
  return `${adj[Math.floor(Math.random()*adj.length)]}${noun[Math.floor(Math.random()*noun.length)]}${num}!`
}

// ── GET : liste des commerciaux de l'équipe du manager ───────────────────────
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: caller } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (caller?.role !== 'manager') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: team, error } = await admin
    .from('commerciaux')
    .select('id, nom, prenom, email, role, must_change_password')
    .eq('manager_id', user.id)
    .order('nom')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team: team ?? [] })
}

// ── POST : créer un utilisateur ──────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: caller } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (caller?.role !== 'manager') {
    return NextResponse.json({ error: 'Accès réservé au manager' }, { status: 403 })
  }

  const body = await request.json()
  const { email, prenom, nom, role } = body
  if (!email || !nom) {
    return NextResponse.json({ error: 'email et nom requis' }, { status: 400 })
  }

  const admin       = createAdminClient()
  const tempPassword = genTempPassword()

  // Créer l'utilisateur avec mot de passe temporaire
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: { prenom, nom },
  })

  if (createErr || !newUser.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Erreur création' }, { status: 500 })
  }

  // Upsert profil commerciaux avec manager_id et must_change_password
  await admin.from('commerciaux').upsert({
    id:                   newUser.user.id,
    email,
    prenom,
    nom,
    role:                 role ?? 'commercial',
    manager_id:           user.id,
    must_change_password: true,
  }, { onConflict: 'id' })

  return NextResponse.json({
    success:       true,
    user_id:       newUser.user.id,
    temp_password: tempPassword,
  })
}
