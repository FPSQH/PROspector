import { getEffectiveCommercialId } from '@/lib/delegation'
// GET  /api/courriers/template   → liste des templates v2 du commercial
// POST /api/courriers/template   → crée un nouveau template v2

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TemplateV2, TemplateSection } from '@/lib/lettres/templateEngine'
import { DEFAULT_SECTIONS } from '@/lib/lettres/templateEngine'

// ── Template Nadège — texte unique, mise en page HTML soignée ────────────────
const NADEGE_UNIQUE_TEXT = `<p style="margin:0 0 20px;">Madame, Monsieur,</p><p style="margin:0 0 13px;text-align:justify;">Je me permets de vous adresser ce courrier après avoir consulté les données publiées par l'ADEME, indiquant la réalisation d'un Diagnostic de Performance Énergétique (<strong>DPE&nbsp;{dpe}</strong>) concernant {typeBien} situé <strong>{adresse}</strong>, à <strong>{ville}</strong>.</p><p style="margin:0 0 13px;text-align:justify;">Cette démarche est souvent le signe d'une réflexion en cours — qu'il s'agisse d'un projet de mise en vente, d'une rénovation énergétique ou d'une mise en location. Dans ce contexte, je serais ravi(e) de pouvoir échanger avec vous et de vous proposer un accompagnement personnalisé.</p><p style="margin:0 0 13px;text-align:justify;">En tant que <strong>{agentTitre}</strong> au sein de <strong>{agenceNom}</strong>, je mets à votre disposition mon expertise du marché immobilier {ctx}, ainsi que les atouts d'un réseau reconnu pour la qualité de son accompagnement et la confiance de ses clients.</p><p style="margin:0 0 13px;text-align:justify;">Qu'il s'agisse d'une <strong>estimation gratuite et sans engagement</strong>, d'un accompagnement complet jusqu'à la vente ou de conseils sur les démarches de rénovation, je reste à votre écoute pour vous guider au mieux dans votre projet.</p><p style="margin:0 0 13px;text-align:justify;">N'hésitez pas à me contacter pour toute question ou pour convenir d'un rendez-vous — ce serait un réel plaisir d'échanger avec vous.</p><p style="margin:0 0 0;">Dans cette attente, veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.</p>`

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

  // ── Migration silencieuse : corriger le doublon {adresse} — {ctx} ─────────────
  const OLD_PATTERN = "situé {adresse} — {ctx}."
  const NEW_PATTERN = "situé {adresse}."
  for (const t of (data ?? [])) {
    if (t.unique_text?.includes(OLD_PATTERN)) {
      const fixed = t.unique_text.replace(OLD_PATTERN, NEW_PATTERN)
      await supabase.from('lettre_templates_v2').update({ unique_text: fixed }).eq('id', t.id)
      t.unique_text = fixed
    }
  }

  // ── Garantir la présence des 2 templates verrouillés pour tous les utilisateurs ──
  const list = data ?? []
  const baseFields = {
    commercial_id:    user.id,
    logo_data:        null,
    logo_mime:        null,
    logo_scale_pct:   100,
    logo_position:    'header',
    sections_config:  DEFAULT_SECTIONS as unknown as TemplateSection[],
    envelope_enabled: false,
    envelope_line1:   'Monsieur Madame le Propriétaire',
    envelope_line2:   '',
  }

  const hasPersonnalise  = list.some(t => t.is_locked && t.mode === 'sections')
  const hasNadege        = list.some(t => t.is_locked && t.mode === 'unique')
  const noDefault        = !list.some(t => t.is_default)
  const seeded: typeof list = []

  // ── Migration silencieuse : mettre à jour le unique_text des Nadège sans HTML ──
  for (const t of list) {
    if (t.is_locked && t.mode === 'unique' && t.unique_text && !/<p[\s>]/i.test(t.unique_text)) {
      await supabase.from('lettre_templates_v2').update({ unique_text: NADEGE_UNIQUE_TEXT }).eq('id', t.id)
      t.unique_text = NADEGE_UNIQUE_TEXT
    }
  }

  if (!hasPersonnalise) {
    const { data: t1 } = await supabase.from('lettre_templates_v2').insert({
      ...baseFields,
      name:        'Personnalisé',
      is_default:  noDefault,          // défaut seulement si aucun autre ne l'est
      is_locked:   true,
      mode:        'sections',
      unique_text: null,
    }).select().single()
    if (t1) seeded.push(t1)
  }

  if (!hasNadege) {
    const { data: t2 } = await supabase.from('lettre_templates_v2').insert({
      ...baseFields,
      name:        'Template Nadège',
      is_default:  false,
      is_locked:   true,
      mode:        'unique',
      unique_text: NADEGE_UNIQUE_TEXT,
    }).select().single()
    if (t2) seeded.push(t2)
  }

  return NextResponse.json({ templates: [...list, ...seeded] })
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

  // Champs optionnels (duplication d'un template existant ou modèle prédéfini)
  const mode    = body.mode === 'unique' ? 'unique' : 'sections'
  const logoPos = body.logo_position === 'footer' ? 'footer' : 'header'

  // Option B : création depuis le modèle Nadège
  const uniqueText = body.preset === 'nadege'
    ? NADEGE_UNIQUE_TEXT
    : (body.unique_text ?? null)

  const { data, error } = await supabase
    .from('lettre_templates_v2')
    .insert({
      commercial_id:    user.id,
      name,
      is_default:       isDefault,
      mode:             body.preset === 'nadege' ? 'unique' : mode,
      unique_text:      uniqueText,
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
      header_enabled:   body.header_enabled   ?? true,
      header_html:      body.header_html      ?? null,
      header_height_mm: body.header_height_mm ?? 30,
      footer_enabled:   body.footer_enabled   ?? true,
      footer_html:      body.footer_html      ?? null,
      footer_height_mm: body.footer_height_mm ?? 20,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data as TemplateV2 }, { status: 201 })
}
