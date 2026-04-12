import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const update: Record<string, any> = {}
  if (body.zone_id  !== undefined) update.zone_id  = body.zone_id
  if (body.statut   !== undefined) update.statut   = body.statut
  if (body.heure_debut !== undefined) update.heure_debut = body.heure_debut
  if (body.heure_fin   !== undefined) update.heure_fin   = body.heure_fin
  if (body.date_prevue !== undefined) update.date_prevue = body.date_prevue

  const { data, error } = await supabase
    .from('planning_sessions')
    .update(update)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, zones_prospection (id, nom, couleur, numero)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { error } = await supabase
    .from('planning_sessions')
    .delete()
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
