import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/planning?mois=&annee=
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const mois  = parseInt(searchParams.get('mois')  ?? String(now.getMonth() + 1))
  const annee = parseInt(searchParams.get('annee') ?? String(now.getFullYear()))

  const { data: planning } = await supabase
    .from('planning_sessions')
    .select(`
      id, date_prevue, heure_debut, heure_fin, statut, session_id,
      zones_prospection (id, nom, couleur, numero)
    `)
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
    .order('date_prevue')

  return NextResponse.json({ planning: planning ?? [], mois, annee })
}

// POST /api/planning — générer ou regénérer le planning d'un mois
// Body : { mois?, annee? }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body  = await req.json().catch(() => ({}))
  const now   = new Date()
  const mois  = body.mois  ?? (now.getMonth() + 1)
  const annee = body.annee ?? now.getFullYear()

  const { data: result } = await supabase.rpc('generer_planning_mois', {
    p_commercial_id: user.id,
    p_mois:          mois,
    p_annee:         annee,
  })

  return NextResponse.json({ ok: true, nb_sessions_creees: result ?? 0, mois, annee })
}

// PATCH /api/planning — modifier une entrée du planning (reporter, annuler)
// Body : { planning_id, date_prevue?, statut?, zone_id? }
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { planning_id, date_prevue, statut, zone_id } = body

  if (!planning_id) return NextResponse.json({ error: 'planning_id requis' }, { status: 400 })

  const updates: any = { updated_at: new Date().toISOString() }
  if (date_prevue) updates.date_prevue = date_prevue
  if (statut)      updates.statut      = statut
  if (zone_id)     updates.zone_id     = zone_id

  const { data, error } = await supabase
    .from('planning_sessions')
    .update(updates)
    .eq('id', planning_id)
    .eq('commercial_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planning: data })
}
