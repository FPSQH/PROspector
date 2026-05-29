// GET  /api/courriers/template   → liste des templates v2 du commercial
// POST /api/courriers/template   → crée un nouveau template v2

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TemplateV2, TemplateSection } from '@/lib/lettres/templateEngine'
import { DEFAULT_SECTIONS } from '@/lib/lettres/templateEngine'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .select('*')
    .eq('commercial_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? 'Nouveau template').toString().trim().slice(0, 100) || 'Nouveau template'

  // Vérifier si c'est le premier template → le marquer comme défaut
  const { count } = await supabase
    .from('lettre_templates_v2')
    .select('id', { count: 'exact', head: true })
    .eq('commercial_id', user.id)

  const isDefault = (count ?? 0) === 0

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .insert({
      commercial_id:    user.id,
      name,
      is_default:       isDefault,
      mode:             'sections',
      sections_config:  DEFAULT_SECTIONS as unknown as TemplateSection[],
      envelope_enabled: false,
      envelope_line1:   'Mr et ou Mme le Propriétaire',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data as TemplateV2 }, { status: 201 })
}
