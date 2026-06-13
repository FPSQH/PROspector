import { getEffectiveCommercialId } from '@/lib/delegation'
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

  const effectiveId = await getEffectiveCommercialId()

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .select('*')
    .eq('commercial_id', effectiveId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? 'Nouveau template').toString().trim().slice(0, 100) || 'Nouveau template'

  // Vérifier si c'est le premier template → le marquer comme défaut
  const { count } = await supabase
    .from('lettre_templates_v2')
    .select('id', { count: 'exact', head: true })
    .eq('commercial_id', effectiveId)

  const isDefault = (count ?? 0) === 0

  // Champs optionnels (duplication d'un template existant)
  const mode      = body.mode === 'unique' ? 'unique' : 'sections'
  const logoPos   = body.logo_position === 'footer' ? 'footer' : 'header'

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .insert({
      commercial_id:    user.id,
      name,
      is_default:       isDefault,
      mode,
      unique_text:      body.unique_text      ?? null,
      logo_data:        body.logo_data        ?? null,
      logo_mime:        body.logo_mime        ?? null,
      logo_width:       body.logo_width       ?? null,
      logo_height:      body.logo_height      ?? null,
      logo_scale_pct:   body.logo_scale_pct   ?? 100,
      logo_position:    logoPos,
      sections_config:  body.sections_config  ?? DEFAULT_SECTIONS as unknown as TemplateSection[],
      envelope_enabled: body.envelope_enabled ?? false,
      envelope_line1:   body.envelope_line1   ?? 'Monsieur Madame le Propriétaire',
      envelope_line2:   body.envelope_line2   ?? '',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data as TemplateV2 }, { status: 201 })
}
