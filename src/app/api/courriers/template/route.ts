import { getEffectiveCommercialId } from '@/lib/delegation'
// GET  /api/courriers/template   → liste des templates v2 du commercial
// POST /api/courriers/template   → crée un nouveau template v2

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TemplateV2, TemplateSection } from '@/lib/lettres/templateEngine'
import { DEFAULT_SECTIONS } from '@/lib/lettres/templateEngine'

// ── Template Nadège — texte unique, mise en page HTML soignée ────────────────
const NADEGE_UNIQUE_TEXT = `<p style="margin:0 0 20px;">Madame, Monsieur,</p><p style="margin:0 0 13px;text-align:justify;">Je me permets de vous adresser ce courrier après avoir consulté les données publiées par l'ADEME, indiquant la réalisation d'un Diagnostic de Performance Énergétique (<strong>DPE&nbsp;{dpe}</strong>) concernant {typeBien} situé <strong>{adresse}</strong>, à <strong>{ville}</strong>.</p><p style="margin:0 0 13px;text-align:justify;">Cette démarche est souvent le signe d'une réflexion en cours — qu'il s'agisse d'un projet de mise en vente, d'une rénovation énergétique ou d'une mise en location. Dans ce contexte, je serais ravi(e) de pouvoir échanger avec vous et de vous proposer un accompagnement personnalisé.</p><p style="margin:0 0 13px;text-align:justify;">En tant que <strong>{agentTitre}</strong> au sein de <strong>{agenceNom}</strong>, je mets à votre disposition mon expertise du marché immobilier {ctx}, ainsi que les atouts d'un réseau reconnu pour la qualité de son accompagnement et la confiance de ses clients.</p><p style="margin:0 0 13px;text-align:justify;">Qu'il s'agisse d'une <strong>estimation gratuite et sans engagement</strong>, d'un accompagnement complet jusqu'à la vente ou de conseils sur les démarches de rénovation, je reste à votre écoute pour vous guider au mieux dans votre projet.</p><p style="margin:0 0 13px;text-align:justify;">N'hésitez pas à me contacter pour toute question ou pour convenir d'un rendez-vous — ce serait un réel plaisir d'échanger avec vous.</p><p style="margin:0 0 0;">Dans cette attente, veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.</p>`

// ── Template Mistral — sections ultra-personnalisées par segment DPE ──────────
const MISTRAL_HEADER = `{logo}<br><strong style="color:#009597;font-size:15px;">{agenceNom}</strong><br><span style="font-size:11px;color:#5F5E5A;">{agenceAdresse}</span><br><strong style="font-size:12px;">{agentNom}</strong> <span style="color:#5F5E5A;font-size:12px;">– {agentTitre}</span><hr style="border:0;border-top:2px solid #009597;margin:6px 0 0;">`
const MISTRAL_FOOTER = `<hr style="border:0;border-top:1px solid #009597;margin:0 0 8px;"><p style="text-align:center;font-size:10px;color:#5F5E5A;margin:0;">{agenceNom} | {agenceAdresse} | {agenceTel}</p>`

const MISTRAL_SECTIONS: TemplateSection[] = [
  // 1. Introduction (toutes notes)
  {
    id: 'intro', type: 'fixed', enabled: true,
    title: 'Introduction', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<p style="margin:0 0 16px;">Madame, Monsieur,</p><p style="margin:0 0 12px;text-align:justify;">{typeBien} situé <strong>{adresse}</strong> à <strong>{ville}</strong> a récemment fait l'objet d'un <strong>Diagnostic de Performance Énergétique&nbsp;{dpe}</strong>. Cette information est précieuse, car elle révèle des <strong>opportunités concrètes</strong> pour votre projet immobilier {ctx}.</p><p style="margin:0 0 0;text-align:justify;">En tant que <strong>{agentTitre}</strong> au sein de <strong>{agenceNom}</strong>, je souhaitais vous proposer un accompagnement personnalisé, adapté à votre situation.</p>`,
  },
  // 2. Analyse DPE (contenu auto)
  {
    id: 'dpe', type: 'fixed', enabled: true,
    title: 'Votre diagnostic énergétique', showTitle: true,
    titleColor: '#2563EB', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  // 3. Alerte urgence F/G
  {
    id: 'a1b2c3d4-0001-4000-8000-000000000001', type: 'custom', enabled: true,
    title: 'Votre bien est concerné par une réglementation stricte',
    showTitle: true,
    titleColor: '#CC1016', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<div style="border-left:4px solid #CC1016;padding:10px 12px 10px 14px;background:#FFF5F5;border-radius:0 6px 6px 0;margin-bottom:4px;"><p style="margin:0 0 10px;text-align:justify;">Depuis le <strong>1er janvier 2025</strong>, les logements classés <strong>DPE&nbsp;G ne peuvent plus être mis en location</strong>. À partir de <strong>2028</strong>, ce sera également le cas pour les <strong>DPE&nbsp;F</strong>.</p><p style="margin:0 0 10px;text-align:justify;">Par ailleurs, cette catégorie de biens peut subir une <strong>décote allant jusqu'à 20&nbsp;%</strong> à la revente. Avec une consommation de <strong>{conso}</strong> et un coût énergétique annuel de <strong>{cout}</strong>, agir maintenant vous permet de préserver la valeur de votre patrimoine.</p><p style="margin:0;font-weight:700;color:#CC1016;">Je vous propose une estimation gratuite pour évaluer votre bien et définir la meilleure stratégie.</p></div>`,
    condition: { dpe: ['F', 'G'] },
  },
  // 4. Alerte modérée D/E
  {
    id: 'a1b2c3d4-0002-4000-8000-000000000002', type: 'custom', enabled: true,
    title: 'Gel des loyers et contraintes à venir pour votre bien',
    showTitle: true,
    titleColor: '#EA580C', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<div style="border-left:4px solid #EA580C;padding:10px 12px 10px 14px;background:#FFF8F0;border-radius:0 6px 6px 0;margin-bottom:4px;"><p style="margin:0 0 10px;text-align:justify;">{typeBien} classé <strong>DPE&nbsp;{dpe}</strong> est soumis au <strong>gel des loyers</strong> depuis 2025. À partir de <strong>2028</strong>, des travaux de rénovation seront obligatoires pour continuer à le louer.</p><p style="margin:0 0 10px;text-align:justify;">Avec une consommation de <strong>{conso}</strong> (coût annuel estimé : <strong>{cout}</strong>), des économies importantes sont atteignables. Nous pouvons vous orienter vers des <strong>solutions de financement adaptées</strong>, incluant les aides de l'État (MaPrimeRénov', éco-PTZ).</p><p style="margin:0;font-weight:700;color:#EA580C;">Une estimation gratuite vous permettra d'identifier les options les plus avantageuses pour votre situation.</p></div>`,
    condition: { dpe: ['D', 'E'] },
  },
  // 5. Valorisation A/B/C
  {
    id: 'a1b2c3d4-0003-4000-8000-000000000003', type: 'custom', enabled: true,
    title: 'Votre bien est un atout rare sur le marché',
    showTitle: true,
    titleColor: '#319834', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<div style="border-left:4px solid #319834;padding:10px 12px 10px 14px;background:#F0FAF0;border-radius:0 6px 6px 0;margin-bottom:4px;"><p style="margin:0 0 10px;text-align:justify;">{typeBien} affiche un excellent <strong>DPE&nbsp;{dpe}</strong>, ce qui en fait un bien <strong>particulièrement recherché</strong> {ctx}. Face aux contraintes réglementaires croissantes, les acquéreurs valorisent fortement les biens économes en énergie.</p><p style="margin:0 0 10px;text-align:justify;">Les études de marché montrent que les biens classés A, B ou C se vendent <strong>jusqu'à +10&nbsp;%</strong> par rapport aux biens équivalents moins performants. Votre consommation de <strong>{conso}</strong> — soit environ <strong>{cout}</strong>/an — est un argument de vente concret.</p><p style="margin:0;font-weight:700;color:#319834;">Profitez de cet avantage : une estimation gratuite vous permettra de maximiser votre prix de vente.</p></div>`,
    condition: { dpe: ['A', 'B', 'C'] },
  },
  // 6. Estimation (toutes notes)
  {
    id: 'estimation', type: 'fixed', enabled: true,
    title: 'Estimation gratuite et plan d\'action',
    showTitle: true,
    titleColor: '#2563EB', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<p style="margin:0 0 10px;text-align:justify;">Je vous propose une <strong>estimation précise et sans engagement</strong> de votre bien, accompagnée d'un <strong>plan d'action personnalisé</strong> pour&nbsp;:</p><ul style="padding-left:20px;margin:0 0 10px;"><li style="margin-bottom:6px;">Vendre au <strong>meilleur prix</strong>, avec des stratégies adaptées à votre profil DPE.</li><li style="margin-bottom:6px;">Explorer les <strong>solutions de rénovation</strong>&nbsp;: aides de l'État (MaPrimeRénov', éco-PTZ), financement à taux réduit.</li><li style="margin-bottom:6px;">Bénéficier de notre <strong>réseau national</strong>&nbsp;: +520 agences et 3&nbsp;200 experts pour une visibilité maximale.</li></ul>`,
  },
  // 7. CTA (toutes notes)
  {
    id: 'a1b2c3d4-0004-4000-8000-000000000004', type: 'custom', enabled: true,
    title: '', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<div style="text-align:center;margin:18px 0;padding:16px 20px;background:#F0F7FF;border-radius:8px;border:1px solid #BFDBFE;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#2563EB;">Prenez rendez-vous dès aujourd'hui — sous 15 jours, sous réserve de disponibilité</p><p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#CC1016;">{agenceTel}</p><p style="margin:0;font-size:12px;color:#5F5E5A;">✉ {agenceEmail}</p></div>`,
  },
  // 8. Politesse (toutes notes)
  {
    id: 'politesse', type: 'fixed', enabled: true,
    title: 'Formules de politesse', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<p style="margin:0 0 16px;text-align:justify;">Dans l'attente de votre retour, je reste à votre entière disposition pour toute question et me tiens prêt(e) à vous rencontrer au moment qui vous convient.</p><p style="margin:0 0 0;">Cordialement,<br><strong>{agentNom}</strong><br><em style="color:#5F5E5A;">{agentTitre} — {agenceNom}</em></p>`,
  },
  // 9. PS F/G
  {
    id: 'a1b2c3d4-0005-4000-8000-000000000005', type: 'custom', enabled: true,
    title: '', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<p style="font-size:12px;color:#5F5E5A;font-style:italic;border-top:1px solid #e5e5e5;padding-top:10px;margin-top:16px;"><strong>PS</strong>&nbsp;: Sans action, la valeur d'un bien classé F ou G peut continuer à se déprécier. Appelez-moi dès aujourd'hui pour éviter cette décote&nbsp;: <strong>{agenceTel}</strong>.</p>`,
    condition: { dpe: ['F', 'G'] },
  },
  // 10. PS D/E
  {
    id: 'a1b2c3d4-0006-4000-8000-000000000006', type: 'custom', enabled: true,
    title: '', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<p style="font-size:12px;color:#5F5E5A;font-style:italic;border-top:1px solid #e5e5e5;padding-top:10px;margin-top:16px;"><strong>PS</strong>&nbsp;: Vous pourriez diviser votre facture énergétique par deux grâce à des travaux éligibles aux aides de l'État. Je vous détaillerai toutes les options lors de notre rendez-vous.</p>`,
    condition: { dpe: ['D', 'E'] },
  },
  // 11. PS A/B/C
  {
    id: 'a1b2c3d4-0007-4000-8000-000000000007', type: 'custom', enabled: true,
    title: '', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: `<p style="font-size:12px;color:#5F5E5A;font-style:italic;border-top:1px solid #e5e5e5;padding-top:10px;margin-top:16px;"><strong>PS</strong>&nbsp;: Les biens classés <strong>DPE&nbsp;{dpe}</strong> se vendent jusqu'à 15&nbsp;% plus cher {ctx}. Ne manquez pas cette opportunité — contactez-moi dès aujourd'hui&nbsp;!</p>`,
    condition: { dpe: ['A', 'B', 'C'] },
  },
]

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

  const hasPersonnalise  = list.some(t => t.is_locked && t.name === 'Personnalisé')
  const hasNadege        = list.some(t => t.is_locked && t.name === 'Template Nadège')
  const hasMistral       = list.some(t => t.is_locked && t.name === 'Mistral')
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
      is_default:  noDefault,
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

  if (!hasMistral) {
    const { data: t3 } = await supabase.from('lettre_templates_v2').insert({
      ...baseFields,
      name:             'Mistral',
      is_default:       false,
      is_locked:        true,
      mode:             'sections',
      unique_text:      null,
      sections_config:  MISTRAL_SECTIONS as unknown as TemplateSection[],
      header_html:      MISTRAL_HEADER,
      footer_html:      MISTRAL_FOOTER,
      header_height_mm: 35,
      footer_height_mm: 20,
    }).select().single()
    if (t3) seeded.push(t3)
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
