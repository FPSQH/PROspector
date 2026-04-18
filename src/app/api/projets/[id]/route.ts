import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_TYPE_PROJET = ['vente','achat','estimation','investissement','location']
const VALID_HORIZON = ['moins_6_mois','6_12_mois','1_2_ans','plus_2_ans','inconnu']
const VALID_MOTIF = ['mutation','agrandissement','separation','succession','retraite','investissement','fin_bail','autre']
const VALID_STATUT = ['actif','conclu','abandonne']

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.type_projet) update.type_projet = body.type_projet.filter((t: string) => VALID_TYPE_PROJET.includes(t))
  if (body.horizon_projet && VALID_HORIZON.includes(body.horizon_projet)) update.horizon_projet = body.horizon_projet
  if (body.motif_projet) update.motif_projet = body.motif_projet.filter((m: string) => VALID_MOTIF.includes(m))
  if (body.statut && VALID_STATUT.includes(body.statut)) update.statut = body.statut
  const { data, error } = await supabase.from('projets_immobiliers').update(update).eq('id', params.id).eq('commercial_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projet: data })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  const { error } = await supabase.from('projets_immobiliers').delete().eq('id', params.id).eq('commercial_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
