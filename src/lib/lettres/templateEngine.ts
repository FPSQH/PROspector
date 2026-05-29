// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR DE TEMPLATES V2 — sections configurables, templates multiples
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────────

export type FixedSectionId =
  | 'intro'
  | 'dpe'
  | 'audit'
  | 'estimation'
  | 'vente'
  | 'gestion_locative'
  | 'renovation'
  | 'politesse'

export interface TemplateSection {
  id:             string        // FixedSectionId ou UUID custom
  type:           'fixed' | 'custom'
  enabled:        boolean
  title:          string        // titre affiché (renommable)
  showTitle:      boolean       // afficher l'en-tête de section ?
  titleColor:     string        // '#009597'
  titleSize:      number        // taille du titre en pt (ex: 14)
  titleBold:      boolean
  titleUnderline: boolean
  bodyHtml:       string | null // null = généré automatiquement selon DPE
}

export interface TemplateV2 {
  id:               string
  commercial_id:    string
  name:             string
  is_default:       boolean
  mode:             'sections' | 'unique'
  unique_text:      string | null
  logo_data:        string | null
  logo_mime:        string | null
  sections_config:  TemplateSection[] | null
  envelope_enabled: boolean
  envelope_line1:   string
  created_at?:      string
  updated_at?:      string
}

// ── Sections par défaut ────────────────────────────────────────────────────────

export const DEFAULT_SECTIONS: TemplateSection[] = [
  {
    id: 'intro', type: 'fixed', enabled: true,
    title: 'Introduction', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'dpe', type: 'fixed', enabled: true,
    title: 'Situation énergétique de votre bien', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'audit', type: 'fixed', enabled: true,
    title: 'Audit énergétique & rénovation', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'estimation', type: 'fixed', enabled: true,
    title: 'Estimation gratuite de votre bien', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'vente', type: 'fixed', enabled: true,
    title: 'Vous envisagez de vendre ?', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'gestion_locative', type: 'fixed', enabled: true,
    title: 'Notre service de gestion locative', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'renovation', type: 'fixed', enabled: true,
    title: 'Bloc rénovation', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
  {
    id: 'politesse', type: 'fixed', enabled: true,
    title: 'Formules de politesse', showTitle: false,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
  },
]

// ── Métadonnées des sections fixes (pour l'éditeur) ──────────────────────────

export interface SectionMeta {
  description:  string
  conditional?: string   // condition d'affichage automatique
  vars:         string[] // variables disponibles dans le corps
}

export const SECTION_META: Record<string, SectionMeta> = {
  intro: {
    description: 'Paragraphe d\'accroche adapté au DPE du bien.',
    vars: ['{typeBien}', '{ctx}', '{dpe}', '{ville}', '{adresse}', '{agentNom}'],
  },
  dpe: {
    description: 'Situation énergétique du bien — DPE, consommation, réglementation.',
    vars: ['{typeBien}', '{dpe}', '{conso}', '{cout}', '{ges}', '{energie}'],
  },
  audit: {
    description: 'Résultats de l\'audit énergétique (scénarios de rénovation).',
    conditional: 'DPE E, F ou G avec données d\'audit disponibles',
    vars: ['{typeBien}', '{dpe}'],
  },
  estimation: {
    description: 'Proposition d\'estimation gratuite et sans engagement.',
    vars: ['{typeBien}', '{ctx}', '{agentNom}'],
  },
  vente: {
    description: 'Accompagnement à la vente adapté au DPE.',
    vars: ['{typeBien}', '{dpe}', '{agentNom}'],
  },
  gestion_locative: {
    description: 'Service de gestion locative.',
    conditional: 'DPE A/B (toujours) ou DPE C/D pour un appartement',
    vars: ['{typeBien}'],
  },
  renovation: {
    description: 'Financement des travaux de rénovation énergétique.',
    conditional: 'DPE E, F ou G (quand la gestion locative n\'est pas affichée)',
    vars: [],
  },
  politesse: {
    description: 'Formules de politesse et clôture de la lettre.',
    vars: ['{agentNom}', '{agenceNom}'],
  },
}

// ── Variables disponibles globalement ─────────────────────────────────────────

export interface VarDef { key: string; label: string; example: string }

export const ALL_VARIABLES: VarDef[] = [
  { key: '{typeBien}',  label: 'Type de bien',         example: 'votre appartement' },
  { key: '{ctx}',       label: 'Contexte géo',         example: 'sur le secteur de Bordeaux' },
  { key: '{dpe}',       label: 'Étiquette DPE',        example: 'F' },
  { key: '{ville}',     label: 'Commune',              example: 'Bordeaux' },
  { key: '{adresse}',   label: 'Adresse complète',     example: '12 Rue de la Paix' },
  { key: '{conso}',     label: 'Conso. énergétique',   example: '320 kWhep/m²/an' },
  { key: '{cout}',      label: 'Coût annuel estimé',   example: '2 800 €' },
  { key: '{ges}',       label: 'Émissions GES',        example: '62 kgeqCO₂/m²/an' },
  { key: '{energie}',   label: 'Énergie principale',   example: 'Électricité' },
  { key: '{agentNom}',   label: 'Nom du conseiller',    example: 'Jean Dupont' },
  { key: '{agenceNom}',  label: 'Nom de l\'agence',     example: 'Square Habitat Bordeaux' },
  { key: '{agenceTel}',  label: 'Téléphone agence',     example: '05 56 00 00 00' },
  { key: '{agenceEmail}', label: 'Email agence',        example: 'contact@squarehabitat.fr' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retourne les sections effectives : config personnalisée OU sections par défaut. */
export function getEffectiveSections(template: TemplateV2 | null): TemplateSection[] {
  if (!template) return DEFAULT_SECTIONS
  if (!template.sections_config || template.sections_config.length === 0) return DEFAULT_SECTIONS
  return template.sections_config
}

/** Remplace toutes les variables {xxx} dans un HTML. */
export function fillVarsHtml(html: string, vars: Record<string, string>): string {
  return html.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key]
    return val !== undefined ? escapeHtml(val) : `{${key}}`
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

/** Génère le bloc d'adresse d'enveloppe en HTML. */
export function getEnvelopeHtml(
  template: TemplateV2,
  adresse: string,
  codePostal: string,
  ville: string,
): string {
  const line1 = template.envelope_line1 || 'Mr et ou Mme le Propriétaire'
  const line2 = adresse || ''
  const line3 = [codePostal, ville].filter(Boolean).join(' ')
  return [
    `<div style="border:1px dashed #aaa;padding:12px 16px;margin:24px 0;font-size:13px;line-height:2;font-family:Arial,sans-serif;max-width:280px;">`,
    `<div>${line1}</div>`,
    line2 ? `<div>${line2}</div>` : '',
    line3 ? `<div>${line3}</div>` : '',
    `</div>`,
  ].filter(Boolean).join('\n')
}
