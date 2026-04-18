import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_TYPE_PROJET = ['vente','achat','estimation','investissement','location']
const VALID_HORIZON = ['moins_6_mois','6_12_mois','1_2_ans','plus_2_ans','inconnu']
const VALID_MOTIF = ['mutation','agrandissement','separation','succession','retraite','investissement','fin_bail','autre']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const contact_id = searchParams.get('contact_id')
  let query = supabase.from('projets_immobiliers').select('*').eq('commercial_id', user.id).order('created_at', { ascending: false })
  if (contact_id) query = query.eq('contact_id', contact_id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projets: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.contact_id) return NextResponse.json({ error: 'contact_id requis' }, { status: 400 })
  const insert = {
    contact_id: body.contact_id,
    commercial_id: user.id,
    type_projet: (body.type_projet ?? []).filter((t: string) => VALID_TYPE_PROJET.includes(t)),
    horizon_projet: VALID_HORIZON.includes(body.horizon_projet) ? body.horizon_projet : 'inconnu',
    motif_projet: (body.motif_projet ?? []).filter((m: string) => VALID_MOTIF.includes(m)),
    statut: 'actif',
  }
  const { data, error } = await supabase.from('projets_immobiliers').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projet: data })
}
