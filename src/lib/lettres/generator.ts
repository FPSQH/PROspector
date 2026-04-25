// Moteur de génération de lettres DPE — PROspector
// Adapté de FPDPEPRO (https://fpsqh.github.io/FPDPEPRO/)

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
  agent_nom?:          string
  agent_prenom?:       string
  agent_agence?:       string
  agent_telephone?:    string
  agent_email?:        string
}

type DpeGroup = 'AB' | 'CD' | 'E' | 'FG'

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }

function getDpeGroup(dpe: string): DpeGroup {
  const d = dpe.toUpperCase()
  if (['A','B'].includes(d)) return 'AB'
  if (['C','D'].includes(d)) return 'CD'
  if (d === 'E') return 'E'
  if (['F','G'].includes(d)) return 'FG'
  return 'CD'
}

function glPara(isAppt: boolean): string {
  return isAppt
    ? "Par ailleurs, si vous souhaitez conserver votre bien tout en vous libérant des contraintes de la gestion, sachez que notre agence propose également un service de gestion locative complète : recherche de locataires, encaissement des loyers et suivi quotidien de votre bien."
    : "Si la vente ne correspond pas à votre projet immédiat, notre agence propose également un service de gestion locative : prise en charge intégrale de la gestion, de la recherche de locataires à la perception des loyers, pour valoriser votre patrimoine sereinement."
}

export function generateLetterHTML(b: DpeAdresseData): string {
  const today    = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'})
  const ville    = cap(b.nom_commune ?? '')
  const isAppt   = b.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const Bien     = isAppt ? 'Votre appartement' : 'Votre bien'
  const dpe      = (b.dpe_etiquette ?? '?').toUpperCase()
  const dpeGroup = getDpeGroup(dpe)
  const ctx      = ville ? `sur le secteur de ${ville}` : 'dans notre secteur'
  const agentNom = [`${b.agent_prenom ?? ''}`, `${b.agent_nom ?? ''}`].join(' ').trim() || 'Votre conseiller'

  const intro = dpeGroup === 'AB'
    ? `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux opportunités du marché ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`
    : `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux évolutions réglementaires qui concernent les propriétaires ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`

  const dpeText = dpeGroup === 'FG'
    ? `${Bien} est classé DPE ${dpe}, ce qui le place dans la catégorie des logements à forte consommation énergétique — communément appelés « passoires thermiques ». Depuis le 1er janvier ${dpe === 'G' ? '2023' : '2025'}, ce type de logement ne peut plus être mis en location. Face à cette contrainte réglementaire, de nombreux propriétaires font le choix de céder leur bien dans de bonnes conditions, avant que les obligations de rénovation ne se renforcent davantage.`
    : dpeGroup === 'E'
    ? `${Bien} est classé DPE E. Depuis 2023, les loyers de ce type de logement sont gelés : il n'est plus possible de les réviser à la hausse. De plus, à horizon 2034, ces biens seront soumis aux mêmes restrictions que les classes F et G. Il peut donc être judicieux d'évaluer vos options dès maintenant.`
    : dpeGroup === 'CD'
    ? `${Bien} est classé DPE ${dpe}. Bien que cette classe ne soit pas encore soumise à des restrictions immédiates, le contexte réglementaire évolue rapidement. Le marché immobilier local est actuellement dynamique, et c'est souvent dans ces périodes favorables que se réalisent les meilleures transactions.`
    : `${Bien} est classé DPE ${dpe}, ce qui constitue un vrai atout sur le marché actuel. Les acheteurs sont de plus en plus sensibles aux performances énergétiques, et un bon classement DPE valorise significativement ${typeBien}.`

  const vente = dpeGroup === 'FG' || dpeGroup === 'E'
    ? `Un DPE ${dpe} ne constitue pas un obstacle à la vente : certains acquéreurs recherchent précisément ce type de bien, y voyant l'opportunité de réaliser un projet de rénovation. Grâce à ma connaissance du marché local et des acquéreurs actifs sur votre secteur, je suis en mesure de vous accompagner vers une transaction réussie.`
    : dpeGroup === 'CD'
    ? `Si vous envisagez de vendre ${typeBien}, votre DPE ${dpe} est un atout : les acheteurs sont de plus en plus sensibles aux performances énergétiques. Je serais ravi de vous accompagner.`
    : `Votre DPE ${dpe} est un argument de vente de premier ordre. Si vous envisagez de mettre ${typeBien} sur le marché, je vous aiderai à le valoriser pleinement.`

  const infoColor = (dpeGroup === 'FG' || dpeGroup === 'E') ? '#FEF2F2' : '#F0FDF4'
  const infoBorder = (dpeGroup === 'FG' || dpeGroup === 'E') ? '#FECACA' : '#BBF7D0'

  const ademeItems: string[] = []
  if (b.conso_ep_m2)        ademeItems.push(`⚡ Consommation : <strong>${b.conso_ep_m2} kWhep/m²/an</strong>`)
  if (b.cout_annuel)        ademeItems.push(`💶 Coût annuel estimé : <strong>${Math.round(b.cout_annuel).toLocaleString('fr-FR')} €</strong>`)
  if (b.energie_principale) ademeItems.push(`🔥 Énergie principale : <strong>${b.energie_principale}</strong>`)
  if (b.ges_m2)             ademeItems.push(`🌿 GES : <strong>${b.ges_m2} kgeqCO₂/m²/an</strong>`)

  const dpeBox = ademeItems.length
    ? `<div style="background:${infoColor};border:1px solid ${infoBorder};border-radius:8px;padding:12px 16px;margin:12px 0;text-align:center;font-size:13px;">${ademeItems.join(' &nbsp;·&nbsp; ')}</div>`
    : ''

  const audScenarios = (b.audit?.scenarios ?? [])
    .filter(sc => !/états*initial/i.test(sc.categorie ?? '')).slice(0, 3)
  const auditBlock = (b.audit?.n_audit && audScenarios.length)
    ? `<h4 style="font-size:13px;font-weight:700;color:#1D9E75;margin:20px 0 8px;text-transform:uppercase;">Audit énergétique &amp; rénovation</h4>
<p style="font-size:13px;line-height:1.7;margin:0 0 10px;">Un audit énergétique (n° <strong>${b.audit!.n_audit}</strong>${b.audit?.date_audit ? ' réalisé le ' + b.audit.date_audit : ''}) a été réalisé pour ce bien. Il identifie plusieurs scénarios de rénovation :</p>
<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:12px;line-height:1.8;">${audScenarios.map(sc => `→ <strong>${(sc.categorie ?? 'Scénario').replace(/principale?/gi,'').trim()}</strong> : atteindre DPE <strong>${sc.classe_apres ?? '?'}</strong>${sc.cout_travaux ? ` pour ~${sc.cout_travaux.toLocaleString('fr-FR')} €` : ''}${sc.gain_pct ? ` — gain : <strong>${sc.gain_pct}%</strong>` : ''}`).join('<br>')}</div>`
    : ''

  const h4 = (t: string) => `<h4 style="font-size:13px;font-weight:700;color:#1D9E75;margin:20px 0 8px;text-transform:uppercase;letter-spacing:0.05em;">${t}</h4>`
  const p  = (t: string) => `<p style="font-size:13px;line-height:1.7;margin:0 0 12px;">${t}</p>`

  return [
    `<p style="text-align:right;font-size:13px;color:#5F5E5A;">${ville ? ville + ', le ' : 'Le '}${today}</p>`,
    p('Madame, Monsieur,'),
    p(`Je me permets de vous contacter au sujet de ${typeBien} situé : <strong>${b.adresse_brute}</strong>`),
    p(intro),
    h4('Situation énergétique de votre bien'),
    p(dpeText),
    dpeBox,
    auditBlock,
    h4('Estimation gratuite de votre bien'),
    p(`Pour vous accompagner dans votre réflexion, je vous propose de réaliser une <strong>estimation gratuite et sans engagement</strong> de ${typeBien}. Cette estimation, établie à partir des ventes récentes de biens comparables, vous donnera une vision claire de la valeur actuelle de votre propriété.`),
    h4('Vous envisagez de vendre ?'),
    p(vente),
    h4('Notre service de gestion locative'),
    p(glPara(isAppt)),
    p('Je reste à votre entière disposition pour répondre à vos questions ou convenir d&apos;un rendez-vous, sans aucun engagement de votre part.'),
    p(`Dans l'attente de votre retour, je vous adresse, Madame, Monsieur, mes cordiales salutations.`),
    `<p style="font-size:13px;margin-top:24px;"><strong>${agentNom}</strong><br>Conseiller Immobilier — ${b.agent_agence ?? 'Square Habitat'}<br>${b.agent_telephone ? '📞 ' + b.agent_telephone + '<br>' : ''}✉ ${b.agent_email ?? ''}</p>`,
  ].join('\n')
}

export function generateLetterText(b: DpeAdresseData): string {
  const html = generateLetterHTML(b)
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\n{3,}/g,'\n\n').trim()
}

export function getLetterStrategy(dpe: string): string {
  const g = getDpeGroup(dpe.toUpperCase())
  if (g === 'FG') return 'Passoire thermique — location interdite, argument clé pour déclencher une vente'
  if (g === 'E')  return 'Gel des loyers applicable — restrictions à venir en 2034'
  if (g === 'CD') return 'Marché dynamique, opportunité de valorisation'
  return 'DPE excellent — atout de vente ou de location'
}
