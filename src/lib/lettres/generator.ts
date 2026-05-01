// ═══════════════════════════════════════════════════════════════════════════
// SOURCE DE VÉRITÉ UNIQUE pour la génération des courriers DPE
// Utilisé par : prévisualisation HTML (page /courriers) + export DOCX
// Règles : specs FPDPEPRO + repères légaux DPE 2023-2034
// ═══════════════════════════════════════════════════════════════════════════

export type DpeGroup = 'AB' | 'CD' | 'E' | 'FG'

export interface AuditScenario {
  categorie?:    string
  classe_apres?: string
  cout_travaux?: number
  gain_pct?:     number
  etape?:        number
}

export interface AuditData {
  n_audit:     string
  date_audit?: string
  scenarios:   AuditScenario[]
}

export interface DpeAdresseData {
  id:                  string
  adresse_brute:       string
  code_postal?:        string
  nom_commune?:        string
  commune?:            string
  type_bien?:          string
  surface_habitable?:  number
  dpe_etiquette?:      string
  conso_ep_m2?:        number
  cout_annuel?:        number
  energie_principale?: string
  ges_m2?:             number
  latest_dpe_date?:    string
  dpe_numero?:         string
  audit?:              AuditData | null
  has_audit?:          boolean
  needs_audit?:        boolean
  agent_nom?:          string
  agent_prenom?:       string
  agent_agence?:       string
  agent_telephone?:    string
  agent_email?:        string
}

// ── Utilitaires ────────────────────────────────────────────────────────────────

export function getDpeGroup(dpe: string): DpeGroup {
  const d = dpe.toUpperCase()
  if (['A','B'].includes(d)) return 'AB'
  if (['C','D'].includes(d)) return 'CD'
  if (d === 'E') return 'E'
  return 'FG'
}

// Logique gestion locative (specs §3.3 + repères légaux)
// FG/E → location interdite ou gel loyers → JAMAIS GL → bloc rénovation CA
// CD maison → pas de GL / CD appart → GL
// AB → toujours GL
export function showGL(dpeGroup: DpeGroup, isAppt: boolean): boolean {
  if (dpeGroup === 'FG' || dpeGroup === 'E') return false
  if (dpeGroup === 'CD') return isAppt
  return true
}

// ── Contenus textuels (même source pour HTML et DOCX) ─────────────────────────

export function getIntroCtx(dpeGroup: DpeGroup, ctx: string, typeBien: string): string {
  return dpeGroup === 'AB'
    ? `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux opportunités du marché ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`
    : `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux évolutions réglementaires qui concernent les propriétaires ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`
}

export function getDpeTexts(dpe: string, typeBien: string): { intro: string; detail: string } {
  const g = getDpeGroup(dpe)
  if (dpe.toUpperCase() === 'G') return {
    intro: `Votre bien est classé DPE G, ce qui le place dans la catégorie des logements à très forte consommation énergétique — communément appelés « passoires thermiques ».`,
    detail: `Depuis le 1er janvier 2025, tous les logements classés G sont interdits à la mise en location (nouvelles locations et renouvellements de bail). Par ailleurs, les loyers de ces logements sont gelés : il n'est plus possible de les réviser à la hausse. De nombreux propriétaires font aujourd'hui le choix de céder leur bien dans de bonnes conditions, avant que les contraintes réglementaires ne se renforcent davantage.`
  }
  if (dpe.toUpperCase() === 'F') return {
    intro: `Votre bien est classé DPE F, ce qui le place dans la catégorie des logements énergivores — communément appelés « passoires thermiques ».`,
    detail: `Les loyers des logements classés F sont déjà gelés dans de nombreuses situations : il n'est pas possible d'augmenter le loyer tant que le DPE n'est pas amélioré. De plus, à partir du 1er janvier 2028, les logements classés F seront interdits à la mise en location. Face à ces contraintes réglementaires croissantes, il peut être judicieux d'envisager une cession dans les meilleures conditions dès maintenant.`
  }
  if (g === 'E') return {
    intro: `Votre bien est classé DPE E.`,
    detail: `Depuis 2023, les loyers des logements classés E sont gelés : il n'est plus possible de les réviser à la hausse, ni lors d'un renouvellement de bail, ni entre deux locataires. De plus, à partir du 1er janvier 2034, les logements classés E seront soumis aux mêmes restrictions de location que les classes F et G. Il peut donc être judicieux d'évaluer vos options dès maintenant, avant que ces contraintes ne pèsent davantage sur la valeur de votre bien.`
  }
  if (g === 'CD') return {
    intro: `Votre bien est classé DPE ${dpe.toUpperCase()}.`,
    detail: `Bien que cette classe ne soit pas encore soumise à des restrictions immédiates, le contexte réglementaire évolue rapidement. Le marché immobilier local est actuellement dynamique, et c'est souvent dans ces périodes favorables que se réalisent les meilleures transactions.`
  }
  return {
    intro: `Votre bien est classé DPE ${dpe.toUpperCase()}, ce qui constitue un vrai atout sur le marché actuel.`,
    detail: `Les acheteurs sont de plus en plus sensibles aux performances énergétiques, et un excellent classement DPE valorise significativement ${typeBien} lors d'une mise en vente ou d'une mise en location.`
  }
}

export function getVenteText(dpeGroup: DpeGroup, dpe: string, typeBien: string): string {
  if (dpeGroup === 'FG' || dpeGroup === 'E') {
    return `Un DPE ${dpe.toUpperCase()} ne constitue pas un obstacle à la vente : certains acquéreurs recherchent précisément ce type de bien, y voyant l'opportunité de réaliser un projet de rénovation selon leurs propres choix. Grâce à ma connaissance du marché local et des acquéreurs actifs sur votre secteur, je suis en mesure de cibler ces profils et de vous accompagner vers une transaction réussie, dans les meilleures conditions.`
  }
  if (dpeGroup === 'CD') {
    return `Si vous envisagez de vendre ${typeBien}, votre DPE ${dpe.toUpperCase()} est un atout supplémentaire apprécié des acheteurs. Je serais ravi de vous accompagner et de vous proposer les meilleures conditions de vente en valorisant ce point fort.`
  }
  return `Votre DPE ${dpe.toUpperCase()} est un argument de vente de premier ordre. Je vous aiderai à valoriser pleinement cet atout auprès des acheteurs les plus exigeants, pour une transaction dans les meilleures conditions.`
}

export function getGLText(isAppt: boolean): string {
  return isAppt
    ? `Par ailleurs, si vous souhaitez conserver votre bien tout en vous libérant des contraintes de la gestion, notre agence propose un service de gestion locative complète : recherche de locataires, encaissement des loyers et suivi quotidien de votre bien.`
    : `Si la vente ne correspond pas à votre projet immédiat, notre agence propose également un service de gestion locative : prise en charge intégrale de la gestion, de la recherche de locataires à la perception des loyers, pour valoriser votre patrimoine sereinement.`
}

export const RENOVATION_CA_TEXT = `Square Habitat est le réseau immobilier du groupe Crédit Agricole. Si vous envisagez des travaux de rénovation énergétique, nous pouvons vous mettre en relation avec un conseiller du Crédit Agricole pour étudier leur financement (prêts et solutions dédiées). Vous pouvez également utiliser le site J'écorénove (j-ecorenove.credit-agricole.fr) pour simuler vos travaux et estimer les aides auxquelles vous pourriez prétendre.`

export const RENOVATION_CA_HTML = `Square Habitat est le réseau immobilier du groupe Crédit Agricole. Si vous envisagez des travaux de rénovation énergétique, nous pouvons vous mettre en relation avec un conseiller du Crédit Agricole pour étudier leur financement (prêts et solutions dédiées). Vous pouvez également utiliser le site <a href="https://j-ecorenove.credit-agricole.fr" style="color:#009597">J'écorénove</a> pour simuler vos travaux et estimer les aides auxquelles vous pourriez prétendre.`

// ── Données ADEME ──────────────────────────────────────────────────────────────

export function getAdemeItems(b: DpeAdresseData): { line1: string; line2: string } {
  const l1: string[] = []
  const l2: string[] = []
  if (b.conso_ep_m2)        l1.push(`⚡ Consommation : ${b.conso_ep_m2} kWhep/m²/an`)
  if (b.cout_annuel)        l1.push(`💶 Coût annuel estimé : ${Math.round(b.cout_annuel).toLocaleString('fr-FR')} €`)
  if (b.energie_principale) l2.push(`🔥 Énergie principale : ${b.energie_principale}`)
  if (b.ges_m2)             l2.push(`🌿 GES : ${b.ges_m2} kgeqCO₂/m²/an`)
  return { line1: l1.join('   ·   '), line2: l2.join('   ·   ') }
}

export function getLetterStrategy(dpe: string): string {
  const g = getDpeGroup(dpe.toUpperCase())
  if (g === 'FG') return 'Passoire thermique — location interdite, cession recommandée'
  if (g === 'E')  return 'Gel des loyers + restrictions à venir en 2034'
  if (g === 'CD') return 'Marché dynamique — opportunité de valorisation'
  return 'Excellente performance énergétique — atout de vente'
}

// ── Génération HTML (prévisualisation dans l'app) ─────────────────────────────

export function generateLetterHTML(b: DpeAdresseData): string {
  const today    = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const ville    = b.nom_commune ?? b.commune ?? ''
  const dpe      = (b.dpe_etiquette ?? '?').toUpperCase()
  const isAppt   = b.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const ctx      = ville ? `sur le secteur de ${ville}` : 'dans notre secteur'
  const dpeGroup = getDpeGroup(dpe)
  const isRed    = dpeGroup === 'FG' || dpeGroup === 'E'
  const agentNom = [`${b.agent_prenom ?? ''}`, `${b.agent_nom ?? ''}`].join(' ').trim() || 'Votre conseiller'

  const { intro: dpeIntro, detail: dpeDetail } = getDpeTexts(dpe, typeBien)
  const venteText = getVenteText(dpeGroup, dpe, typeBien)
  const { line1: ademeL1, line2: ademeL2 } = getAdemeItems(b)
  const hasAdeme = ademeL1 || ademeL2

  const TEAL = '#009597'
  const infoBox_bg  = isRed ? '#FDEDEB' : '#E8F6F6'
  const infoBox_brd = isRed ? '#C0392B' : '#009597'

  const h4 = (t: string) => `<h4 style="font-size:12px;font-weight:700;color:${TEAL};text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 6px;border-left:4px solid ${TEAL};padding-left:10px;">${t}</h4>`
  const p  = (t: string) => `<p style="font-size:13px;line-height:1.75;margin:0 0 10px;text-align:justify;">${t}</p>`

  const auditBlock = (() => {
    if (!isRed || !b.audit?.n_audit) return ''
    const scenarios = (b.audit.scenarios ?? [])
      .filter(sc => !/états*initial/i.test(sc.categorie ?? '')).slice(0, 3)
    if (!scenarios.length) return ''
    const scLines = scenarios.map(sc => {
      const label = (sc.categorie ?? 'Scénario').trim()
      const cout  = sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} € de travaux` : ''
      const gain  = sc.gain_pct    ? ` — gain estimé : <strong>${sc.gain_pct}%</strong>` : ''
      return `→ <strong>${label}</strong> : atteindre DPE <strong>${sc.classe_apres ?? '?'}</strong>${cout}${gain}`
    }).join('<br>')
    return h4('Audit énergétique &amp; rénovation')
      + p(`Un audit énergétique (n° <strong>${b.audit.n_audit}</strong>${b.audit.date_audit ? ', réalisé le ' + b.audit.date_audit : ''}) a été réalisé pour ce bien. Il identifie plusieurs scénarios de rénovation :`)
      + `<div style="font-size:12px;line-height:1.8;margin:0 0 12px;">${scLines}</div>`
  })()

  const glBlock  = showGL(dpeGroup, isAppt) ? h4('Notre service de gestion locative') + p(getGLText(isAppt)) : ''
  const caBlock  = (!showGL(dpeGroup, isAppt) && isRed) ? h4('Un projet de rénovation ?') + p(RENOVATION_CA_HTML) : ''

  return [
    `<p style="text-align:right;font-size:12px;color:#5F5E5A;font-style:italic;">${ville ? ville + ', le ' : 'Le '}${today}</p>`,
    p('Madame, Monsieur,'),
    p(`Je me permets de vous contacter au sujet de ${typeBien} situé : <strong>${b.adresse_brute}</strong>`),
    p(getIntroCtx(dpeGroup, ctx, typeBien)),

    h4('Situation énergétique de votre bien'),
    p(`<strong>${dpeIntro}</strong>`),
    p(dpeDetail),

    hasAdeme ? `<div style="background:${infoBox_bg};border-left:4px solid ${infoBox_brd};padding:10px 14px;margin:10px 0 14px;font-size:12px;">`
      + (ademeL1 ? `<div>${ademeL1}</div>` : '')
      + (ademeL2 ? `<div>${ademeL2}</div>` : '')
      + `</div>` : '',

    auditBlock,

    h4('Estimation gratuite de votre bien'),
    p(`Pour vous accompagner dans votre réflexion, je vous propose de réaliser une <strong>estimation gratuite et sans engagement</strong> de ${typeBien}. Cette estimation, établie à partir des ventes récentes de biens comparables dans votre secteur, vous donnera une vision claire de la valeur actuelle de votre propriété sur le marché.`),

    h4('Vous envisagez de vendre ?'),
    p(venteText),

    glBlock,
    caBlock,

    p("Je reste à votre entière disposition pour répondre à vos questions ou convenir d'un rendez-vous à votre convenance, sans aucun engagement de votre part."),
    p("Dans l'attente de votre retour, je vous adresse, Madame, Monsieur, mes cordiales salutations."),

    `<p style="margin-top:28px;font-size:13px;"><strong>${agentNom}</strong><br>`
    + `Conseiller Immobilier — ${b.agent_agence ?? 'Square Habitat'}<br>`
    + (b.agent_telephone ? `📞 ${b.agent_telephone}<br>` : '')
    + (b.agent_email    ? `✉ ${b.agent_email}` : '')
    + `</p>`,
  ].filter(Boolean).join('\n')
}

export function generateLetterText(b: DpeAdresseData): string {
  return generateLetterHTML(b).replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').trim()
}
