// GET    /api/courriers/template/[id]  → récupère un template
// PUT    /api/courriers/template/[id]  → met à jour un template
// DELETE /api/courriers/template/[id]  → supprime un template

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TemplateV2 } from '@/lib/lettres/templateEngine'

type Ctx = { params: { id: string } }

export async function GET(_req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .select('*')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })
  return NextResponse.json({ template: data as TemplateV2 })
}

export async function PUT(request: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body: Partial<TemplateV2> = await request.json()

  // Si on définit ce template comme défaut, désactiver les autres
  if (body.is_default === true) {
    await supabase
      .from('lettre_templates_v2')
      .update({ is_default: false })
      .eq('commercial_id', user.id)
      .neq('id', params.id)
  }

  // Champs autorisés
  const patch: Record<string, unknown> = {}
  if (typeof body.name             === 'string')  patch.name             = body.name.trim().slice(0, 100)
  if (typeof body.is_default       === 'boolean') patch.is_default       = body.is_default
  if (body.mode === 'sections' || body.mode === 'unique') patch.mode     = body.mode
  if ('unique_text'      in body) patch.unique_text      = body.unique_text      ?? null
  if ('logo_data'        in body) patch.logo_data        = body.logo_data        ?? null
  if ('logo_mime'        in body) patch.logo_mime        = body.logo_mime        ?? null
  if ('sections_config'  in body) patch.sections_config  = body.sections_config  ?? null
  if (typeof body.envelope_enabled === 'boolean') patch.envelope_enabled = body.envelope_enabled
  if (typeof body.envelope_line1   === 'string')  patch.envelope_line1   = body.envelope_line1

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .update(patch)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Non trouvé' }, { status: 500 })
  return NextResponse.json({ template: data as TemplateV2 })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Récupérer le template pour vérifier s'il est défaut
  const { data: tpl } = await supabase
    .from('lettre_templates_v2')
    .select('is_default, commercial_id')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  await supabase
    .from('lettre_templates_v2')
    .delete()
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  // Si c'était le défaut, désigner le plus ancien restant comme défaut
  if (tpl?.is_default) {
    const { data: remaining } = await supabase
      .from('lettre_templates_v2')
      .select('id')
      .eq('commercial_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
    if (remaining?.[0]) {
      await supabase
        .from('lettre_templates_v2')
        .update({ is_default: true })
        .eq('id', remaining[0].id)
    }
  }

  return NextResponse.json({ ok: true })
}
