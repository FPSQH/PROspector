import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { LetterTemplate } from '@/lib/lettres/generator'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data } = await supabase
    .from('lettre_templates')
    .select('*')
    .eq('commercial_id', user.id)
    .maybeSingle()

  return NextResponse.json({ template: data ?? null })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body: Partial<LetterTemplate> = await request.json()

  // Champs autorisés uniquement
  const allowed = [
    'intro_ab','intro_other',
    'dpe_g_intro','dpe_g_detail','dpe_f_intro','dpe_f_detail',
    'dpe_e_intro','dpe_e_detail','dpe_cd_intro','dpe_cd_detail',
    'dpe_ab_intro','dpe_ab_detail',
    'estimation','vente_fg','vente_cd','vente_ab',
    'gl_appt','gl_maison','politesse1','politesse2','renovation_ca',
  ] as const

  const patch: Record<string, string | null> = { commercial_id: user.id }
  for (const key of allowed) {
    const v = (body as any)[key]
    patch[key] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }

  const { data, error } = await supabase
    .from('lettre_templates')
    .upsert(patch, { onConflict: 'commercial_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  await supabase.from('lettre_templates').delete().eq('commercial_id', user.id)
  return NextResponse.json({ ok: true })
}
