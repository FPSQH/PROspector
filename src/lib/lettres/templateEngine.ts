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

/** Condition d'affichage d'une section. Logique ET entre critères. */
export interface SectionCondition {
  dpe?:          string[]   // ex: ['E','F','G'] — undefined/[] = toutes les notes
  types?:        string[]   // ex: ['appartement','maison'] — undefined/[] = tous
  requireAudit?: boolean    // true = uniquement si un audit est présent
}

export interface TemplateSection {
  id:             string        // FixedSectionId (originel) ou UUID (dupliqué / custom)
  fixedId?:       string        // FixedSectionId pour les sections fixes dupliquées (ex: 'dpe')
  type:           'fixed' | 'custom'
  enabled:        boolean
  title:          string        // titre affiché (renommable)
  showTitle:      boolean       // afficher l'en-tête de section ?
  titleColor:     string        // '#009597'
  titleSize:      number        // taille du titre en pt (ex: 14)
  titleBold:      boolean
  titleUnderline: boolean
  bodyHtml:       string | null // null = généré automatiquement selon DPE
  condition?:     SectionCondition // undefined = pas de filtre (affichage systématique)
  // ── Image dans le bloc ──────────────────────────────────────────────────
  image_enabled?:        boolean                          // false par défaut
  image_data?:           string | null                   // base64
  image_mime?:           string | null
  image_position?:       'left' | 'right' | 'fullwidth' // défaut 'left'
  image_width_pct?:      number                          // % de la largeur totale (20–80), défaut 35
  image_valign?:         'top' | 'middle' | 'bottom'    // alignement vertical image/texte (left/right), défaut 'top'
  image_natural_width?:  number                          // dimensions mesurées à l'upload
  image_natural_height?: number
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
  logo_width?:      number   // largeur naturelle en px (à 100 %)
  logo_height?:     number   // hauteur naturelle en px (à 100 %)
  logo_scale_pct?:  number   // échelle % (10–200, défaut 100)
  logo_position?:   'header' | 'footer'  // défaut 'header'
  sections_config:  TemplateSection[] | null
  envelope_enabled: boolean
  envelope_line1:   string   // ligne 1 — destinataire (ex: "Monsieur Madame le Propriétaire")
  envelope_line2?:  string   // ligne 2 — complément optionnel (ex: "Apt 3B - Bât A")
  // ── Image en mode Texte unique ─────────────────────────────────────────────
  unique_image?:    UniqueImageConfig | null
  // ── En-tête et pied de page personnalisables ────────────────────────────────
  header_enabled?:   boolean          // true par défaut — false = pas d'en-tête
  header_html?:      string | null    // null = auto-généré
  header_height_mm?: number           // hauteur min en mm (10–80), défaut 30
  footer_enabled?:   boolean          // true par défaut — false = pas de pied de page
  footer_html?:      string | null    // null = auto-généré
  footer_height_mm?: number           // hauteur min en mm (10–80), défaut 20
  is_locked?:        boolean          // true = template système, non supprimable
  created_at?:       string
  updated_at?:       string
}

export interface UniqueImageConfig {
  data:            string
  mime:            string
  position?:       'left' | 'right' | 'fullwidth'
  width_pct?:      number
  valign?:         'top' | 'middle' | 'bottom'
  natural_width?:  number
  natural_height?: number
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
    condition: { dpe: ['E','F','G'], requireAudit: true },
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
    condition: { dpe: ['A','B','C','D'] },
  },
  {
    id: 'renovation', type: 'fixed', enabled: true,
    title: 'Bloc rénovation', showTitle: true,
    titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
    bodyHtml: null,
    condition: { dpe: ['E','F','G'] },
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
  { key: '{agentNom}',    label: 'Nom du conseiller',    example: 'Jean Dupont' },
  { key: '{agentTitre}', label: 'Titre du conseiller',  example: 'Conseillère Immobilier' },
  { key: '{agenceNom}',     label: 'Nom de l\'agence',     example: 'Square Habitat Bordeaux' },
  { key: '{agenceAdresse}', label: 'Adresse de l\'agence', example: '12 Rue du Commerce, 33000 Bordeaux' },
  { key: '{agenceTel}',     label: 'Téléphone agence',     example: '05 56 00 00 00' },
  { key: '{agenceEmail}',   label: 'Email agence',         example: 'contact@squarehabitat.fr' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Conditions par défaut (pour migration des templates existants) ─────────────

export const DEFAULT_SECTION_CONDITIONS: Record<string, SectionCondition> = {
  audit:            { dpe: ['E','F','G'], requireAudit: true },
  gestion_locative: { dpe: ['A','B','C','D'] },
  renovation:       { dpe: ['E','F','G'] },
}

/** Clé de contenu d'une section (type de génération à utiliser dans les switch). */
export function sectionContentKey(sec: TemplateSection): string {
  return sec.fixedId ?? sec.id
}

// ── Détection de conflits ──────────────────────────────────────────────────────

function condFingerprint(c?: SectionCondition): string {
  if (!c) return ''
  return [
    [...(c.dpe   ?? [])].sort().join(','),
    [...(c.types ?? [])].sort().join(','),
    c.requireAudit ? '1' : '0',
  ].join('|')
}

/**
 * Retourne les ids des sections en conflit : même type + conditions identiques.
 * Ces sections seront exclues du DOCX (affichage ambigu).
 */
export function getSectionConflicts(sections: TemplateSection[]): Set<string> {
  const seen      = new Map<string, string>()
  const conflicts = new Set<string>()
  for (const sec of sections) {
    if (!sec.enabled) continue
    const key   = `${sectionContentKey(sec)}::${condFingerprint(sec.condition)}`
    const first = seen.get(key)
    if (first !== undefined) {
      conflicts.add(sec.id)
      conflicts.add(first)
    } else {
      seen.set(key, sec.id)
    }
  }
  return conflicts
}

/**
 * Vérifie si une section doit être affichée selon ses conditions.
 * Logique ET entre critères ; sans condition → toujours affiché.
 */
export function sectionMatchesCondition(
  sec: TemplateSection,
  dpe: string,
  type_bien: string,
  hasAudit: boolean,
): boolean {
  const c = sec.condition
  if (!c) return true
  if (c.dpe?.length && !c.dpe.includes(dpe.toUpperCase())) return false
  if (c.types?.length && !c.types.includes((type_bien ?? '').toLowerCase())) return false
  if (c.requireAudit && !hasAudit) return false
  return true
}

/**
 * Migration : ajoute la condition par défaut sur une section qui n'en a pas encore
 * (propriété absente = ancien format avant la feature conditions).
 */
export function migrateSectionCondition(sec: TemplateSection): TemplateSection {
  if ('condition' in sec) return sec   // déjà configuré (même si undefined)
  const def = DEFAULT_SECTION_CONDITIONS[sec.id]
  return def ? { ...sec, condition: def } : sec
}

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

/** Normalise une ligne d'adresse selon AFNOR NF Z 10-011 (majuscules, sans ponctuation). */
export function afnorLine(s: string): string {
  return s.toUpperCase().replace(/[,;.]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Extrait la rue d'une adresse_brute qui contient souvent "RUE CP VILLE"
 * (format courant dans les données ADEME DPE).
 * Retourne { street, cpVille } séparés proprement.
 */
export function parseAddress(
  adresse_brute: string,
  code_postal: string,
  ville: string,
): { street: string; cpVille: string } {
  const adr    = adresse_brute.trim()
  const villeU = (ville || '').trim().toUpperCase()

  if (!villeU) return { street: adr, cpVille: code_postal || '' }

  const aU      = adr.toUpperCase()
  const escaped = villeU.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Cherche " [5 chiffres] VILLE" à la fin
  const m1 = aU.match(new RegExp('\\s+(\\d{4,5})\\s+' + escaped + '$'))
  if (m1) {
    return {
      street:  adr.slice(0, m1.index!).trim(),
      cpVille: [code_postal || m1[1], ville].filter(Boolean).join(' '),
    }
  }

  // Cherche " VILLE" à la fin (sans CP dans l'adresse brute)
  const m2 = aU.match(new RegExp('\\s+' + escaped + '$'))
  if (m2) {
    return {
      street:  adr.slice(0, m2.index!).trim(),
      cpVille: [code_postal, ville].filter(Boolean).join(' '),
    }
  }

  // Pas de correspondance : retourne l'adresse brute telle quelle
  return { street: adr, cpVille: [code_postal, ville].filter(Boolean).join(' ') }
}

/** Génère le bloc d'adresse enveloppe format DL (AFNOR NF Z 10-011). */
export function getEnvelopeHtml(
  template: TemplateV2,
  adresse: string,
  codePostal: string,
  ville: string,
): string {
  const dest   = template.envelope_line1 || 'Monsieur Madame le Propriétaire'
  const compl  = template.envelope_line2 || ''
  const { street, cpVille } = parseAddress(adresse, codePostal, ville)
  const adr    = afnorLine(street)
  const cpVill = afnorLine(cpVille)
  const lines  = [dest, compl ? afnorLine(compl) : '', adr, cpVill].filter(Boolean)
  return [
    `<div style="border:1px solid #c8c8c8;padding:14px 18px;margin:24px 0 24px 60%;font-size:12px;line-height:1.9;font-family:Arial,sans-serif;min-width:220px;max-width:260px;background:#fafafa;letter-spacing:0.02em;">`,
    ...lines.map(l => `<div>${l}</div>`),
    `</div>`,
  ].join('\n')
}
