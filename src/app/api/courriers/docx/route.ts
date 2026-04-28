import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, PageBreak,
  AlignmentType, BorderStyle, ShadingType, WidthType,
  Table, TableRow, TableCell, VerticalAlign
} from 'docx'

// ── Palette couleurs conformes specs FPDPEPRO ─────────────────────────────────
const TEAL    = '009597'   // Couleur principale titres / en-tête
const DARK    = '1A1A1A'
const GREY    = '5F5E5A'
const LGREY   = 'B4B2A9'
const RED_BG  = 'FDEDEB'   // Fond encart F/G/E
const RED_BD  = 'C0392B'   // Bordure encart F/G/E
const TEAL_BG = 'E8F6F6'   // Fond encart AB/CD
const TEAL_BD = '009597'   // Bordure encart AB/CD

// ── Helpers de base ───────────────────────────────────────────────────────────
function T(text: string, opts: any = {}) {
  return new TextRun({ text, font: 'Arial', size: 20, color: DARK, ...opts })
}

// Parser <strong>...</strong> → TextRun bold
function richRuns(text: string, baseOpts: any = {}) {
  const runs: TextRun[] = []
  const parts = text.split(/(<strong>|<\/strong>)/)
  let bold = false
  for (const part of parts) {
    if (part === '<strong>') { bold = true; continue }
    if (part === '</strong>') { bold = false; continue }
    if (part) runs.push(T(part, { bold, ...baseOpts }))
  }
  return runs
}

function body(text: string, opts: any = {}) {
  return new Paragraph({
    children: richRuns(text),
    alignment: AlignmentType.BOTH,
    spacing: { after: 120 },
    ...opts
  })
}

// Titre de section : bordure GAUCHE épaisse teal + indent (spec §6.4)
function secTitle(text: string) {
  return new Paragraph({
    children: [T(text, { bold: true, size: 18, color: TEAL, allCaps: true })],
    border: { left: { style: BorderStyle.THICK, size: 20, color: TEAL, space: 8 } },
    indent: { left: 160 },
    spacing: { before: 200, after: 100 }
  })
}

// Encart coloré : bordure GAUCHE épaisse (spec §6.5)
function infoLine(text: string, bgColor: string, bdColor: string) {
  return new Paragraph({
    children: [T(text, { size: 18, color: DARK })],
    alignment: AlignmentType.LEFT,
    shading: { type: ShadingType.CLEAR, fill: bgColor },
    border: { left: { style: BorderStyle.THICK, size: 20, color: bdColor, space: 8 } },
    indent: { left: 160 },
    spacing: { after: 60 }
  })
}

// Logique gestion locative (spec §3.3)
function showGL(dpeGroup: string, isAppt: boolean): boolean {
  if (dpeGroup === 'AB') return true                    // AB maison + appart → toujours
  if (dpeGroup === 'CD' && isAppt) return true          // CD appart seulement
  return false                                           // E/FG → jamais
}

// ── Construction d'une lettre (spec §4 + §5) ─────────────────────────────────
function buildLetter(letter: any, commercial: any): Paragraph[] {
  const agentNom = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || 'Votre conseiller'
  const today    = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const ville    = letter.nom_commune || letter.commune || ''
  const dpe      = (letter.dpe_etiquette || '?').toUpperCase()
  const isAppt   = letter.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const ctx      = ville ? 'sur le secteur de ' + ville : 'dans notre secteur'

  // Groupe DPE
  const dpeGroup: 'AB'|'CD'|'E'|'FG' =
    ['A','B'].includes(dpe) ? 'AB' :
    ['C','D'].includes(dpe) ? 'CD' :
    dpe === 'E' ? 'E' : 'FG'

  const isRedGroup = dpeGroup === 'E' || dpeGroup === 'FG'

  // ── Textes selon specs §5 ──────────────────────────────────────────────────

  // §5.2 Introduction
  const introCtx = dpeGroup === 'AB'
    ? `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux opportunités du marché ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`
    : `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux évolutions réglementaires qui concernent les propriétaires ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`

  // §5.3 Paragraphe DPE
  let dpeText = ''
  if (dpeGroup === 'FG') {
    const annee = dpe === 'G' ? '2023' : '2025'
    dpeText = `Votre bien est classé <strong>DPE ${dpe}</strong>, ce qui le place dans la catégorie des logements à forte consommation énergétique — communément appelés « passoires thermiques ». Depuis le 1er janvier ${annee}, ce type de logement ne peut plus être mis en location. Face à cette contrainte réglementaire, de nombreux propriétaires font le choix de céder leur bien dans de bonnes conditions, avant que les obligations de rénovation ne se renforcent davantage.`
  } else if (dpeGroup === 'E') {
    dpeText = `Votre bien est classé <strong>DPE E</strong>. Depuis 2023, les loyers de ce type de logement sont gelés : il n'est plus possible de les réviser à la hausse, ni lors d'un renouvellement de bail, ni entre deux locataires. De plus, à horizon 2034, ces biens seront soumis aux mêmes restrictions que les classes F et G. Il peut donc être judicieux d'évaluer vos options dès maintenant.`
  } else if (dpeGroup === 'CD') {
    dpeText = `Votre bien est classé <strong>DPE ${dpe}</strong>. Bien que cette classe ne soit pas encore soumise à des restrictions immédiates, le contexte réglementaire évolue rapidement. Le marché immobilier local est actuellement dynamique, et c'est souvent dans ces périodes favorables que se réalisent les meilleures transactions.`
  } else {
    dpeText = `Votre bien est classé <strong>DPE ${dpe}</strong>, ce qui constitue un vrai atout sur le marché actuel. Les acheteurs sont de plus en plus sensibles aux performances énergétiques, et un excellent classement DPE valorise significativement ${typeBien} lors d'une mise en vente ou d'une mise en location.`
  }

  // §5.4 Vente
  let venteText = ''
  if (isRedGroup) {
    venteText = `Un DPE ${dpe} ne constitue pas un obstacle à la vente : certains acquéreurs recherchent précisément ce type de bien, y voyant l'opportunité de réaliser un projet de rénovation selon leurs propres choix. Grâce à ma connaissance du marché local et des acquéreurs actifs sur votre secteur, je suis en mesure de cibler ces profils et de vous accompagner vers une transaction réussie, dans les meilleures conditions.`
  } else if (dpeGroup === 'CD') {
    venteText = `Si vous envisagez de vendre ${typeBien}, votre DPE ${dpe} est un atout supplémentaire apprécié des acheteurs. Je serais ravi de vous accompagner et de vous proposer les meilleures conditions de vente en valorisant ce point fort.`
  } else {
    venteText = `Votre DPE ${dpe} est un argument de vente de premier ordre. Je vous aiderai à valoriser pleinement cet atout auprès des acheteurs les plus exigeants, pour une transaction dans les meilleures conditions.`
  }

  // §5.5 Gestion locative (conditionnel — spec §3.3)
  const glText = isAppt
    ? `Par ailleurs, si vous souhaitez conserver votre bien tout en vous libérant des contraintes de la gestion, sachez que notre agence propose également un service de gestion locative complète : recherche de locataires, encaissement des loyers et suivi quotidien de votre bien.`
    : `Si la vente ne correspond pas à votre projet immédiat, notre agence propose également un service de gestion locative : prise en charge intégrale de la gestion, de la recherche de locataires à la perception des loyers, pour valoriser votre patrimoine sereinement.`

  const paras: any[] = []

  // 1. DATE (spec §4 §1)
  paras.push(new Paragraph({
    children: [T(`${ville ? ville + ', le ' : 'Le '}${today}`, { size: 18, color: GREY, italics: true })],
    alignment: AlignmentType.RIGHT,
    spacing: { after: 240 }
  }))

  // 2. FORMULE D'APPEL (spec §4 §2) — "Madame, Monsieur," (générique car pas de nom propriétaire)
  paras.push(new Paragraph({
    children: [T('Madame, Monsieur,', { italics: true, size: 20 })],
    spacing: { after: 200 }
  }))

  // 3. PHRASE D'ACCROCHE (spec §4 §3 + §5.1)
  paras.push(body(`Je me permets de vous contacter au sujet de ${typeBien} situé : <strong>${letter.adresse_brute || ''}</strong>`))
  paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))

  // 4. INTRODUCTION CONTEXTUELLE (spec §4 §4 + §5.2)
  paras.push(body(introCtx))

  // 5. SECTION DPE (spec §4 §5)
  paras.push(secTitle('Situation énergétique de votre bien'))
  paras.push(body(dpeText))

  // Encart ADEME (spec §6.5) — si données disponibles
  const ademeItems: string[] = []
  if (letter.conso_ep_m2)        ademeItems.push(`⚡ Consommation : ${letter.conso_ep_m2} kWhep/m²/an`)
  if (letter.energie_principale) ademeItems.push(`🔥 Énergie principale : ${letter.energie_principale}`)
  if (letter.cout_annuel)        ademeItems.push(`💶 Coût annuel estimé : ${Math.round(letter.cout_annuel).toLocaleString('fr-FR')} €`)
  if (letter.ges_m2)             ademeItems.push(`🌿 GES : ${letter.ges_m2} kgeqCO₂/m²/an`)
  if (ademeItems.length) {
    const bg = isRedGroup ? RED_BG : TEAL_BG
    const bd = isRedGroup ? RED_BD : TEAL_BD
    // Ligne 1 : conso + énergie / Ligne 2 : coût + GES
    paras.push(infoLine(ademeItems.slice(0,2).join('   ·   '), bg, bd))
    if (ademeItems.length > 2) paras.push(infoLine(ademeItems.slice(2).join('   ·   '), bg, bd))
    paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
  }

  // Bloc AUDIT (spec §4 §5 + règle §10.4 : uniquement E/F/G si dispo)
  if (isRedGroup && letter.audit?.n_audit) {
    const scenarios = (letter.audit.scenarios || [])
      .filter((sc: any) => !/états*initial/i.test(sc.categorie || '')).slice(0, 3)
    if (scenarios.length) {
      paras.push(secTitle('Audit énergétique & rénovation'))
      paras.push(body(`Un audit énergétique (n° <strong>${letter.audit.n_audit}</strong>${letter.audit.date_audit ? ', réalisé le ' + letter.audit.date_audit : ''}) a été réalisé pour ce bien. Il identifie plusieurs scénarios de rénovation :`))
      for (const sc of scenarios) {
        const label = (sc.categorie || 'Scénario').trim()
        const cout  = sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} € de travaux` : ''
        const gain  = sc.gain_pct    ? ` — gain estimé : <strong>${sc.gain_pct}%</strong>` : ''
        paras.push(body(`→ <strong>${label}</strong> : atteindre DPE <strong>${sc.classe_apres || '?'}</strong>${cout}${gain}`))
      }
      // Mention Crédit Agricole (spec §7)
      paras.push(infoLine(
        'En tant que filiale du Groupe Crédit Agricole, nous pouvons vous accompagner dans la réflexion sur le financement de votre projet de rénovation.   🔗 j-ecorenove.credit-agricole.fr',
        TEAL_BG, TEAL_BD
      ))
      paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
    }
  }

  // 6. SECTION ESTIMATION (spec §4 §6 — identique pour tous)
  paras.push(secTitle('Estimation gratuite de votre bien'))
  paras.push(body(`Pour vous accompagner dans votre réflexion, je vous propose de réaliser une <strong>estimation gratuite et sans engagement</strong> de ${typeBien}. Cette estimation, établie à partir des ventes récentes de biens comparables dans votre secteur, vous donnera une vision claire de la valeur actuelle de votre propriété sur le marché.`))

  // 7. SECTION VENTE (spec §4 §7)
  paras.push(secTitle('Vous envisagez de vendre ?'))
  paras.push(body(venteText))

  // 8. SECTION GESTION LOCATIVE (conditionnelle — spec §3.3)
  if (showGL(dpeGroup, isAppt)) {
    paras.push(secTitle('Notre service de gestion locative'))
    paras.push(body(glText))
  }

  // 9. FORMULE DE POLITESSE (spec §4 §9)
  paras.push(new Paragraph({ children: [], spacing: { after: 120 } }))
  paras.push(body('Je reste à votre entière disposition pour répondre à vos questions ou convenir d'un rendez-vous à votre convenance, sans aucun engagement de votre part.'))
  paras.push(body('Dans l'attente de votre retour, je vous adresse, Madame, Monsieur, mes cordiales salutations.'))

  // 10. SIGNATURE (spec §4 §10 + §7)
  paras.push(new Paragraph({ children: [], spacing: { before: 400 } }))
  paras.push(new Paragraph({
    children: [T(agentNom, { bold: true, size: 22 })],
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 6 } },
    spacing: { before: 80, after: 60 }
  }))
  paras.push(new Paragraph({ children: [T('Conseiller Immobilier — ' + (commercial?.agence_nom || 'Square Habitat'), { size: 18, color: GREY })] }))
  if (commercial?.agence_telephone) {
    paras.push(new Paragraph({ children: [T('📞 ' + commercial.agence_telephone, { size: 18, color: GREY })] }))
  }
  if (commercial?.agence_email) {
    paras.push(new Paragraph({ children: [T('✉ ' + commercial.agence_email, { size: 18, color: GREY })] }))
  }

  return paras
}

// ── En-tête tableau (spec §6.6) ───────────────────────────────────────────────
function buildHeader(commercial: any): Table {
  const agentNom  = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || ''
  const agenceNom = commercial?.agence_nom || 'Square Habitat'
  const agenceAdr = commercial?.agence_adresse || ''
  const agenceTel = commercial?.agence_telephone || ''
  const agentMail = commercial?.agence_email || ''

  const cellBorder = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
  const noBorders  = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }
  const bottomLine = { top: cellBorder, left: cellBorder, right: cellBorder,
    bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL } }

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1123, 4867, 3370],
    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder,
      insideH: cellBorder, insideV: cellBorder },
    rows: [
      new TableRow({
        children: [
          // Col 1 : Logo placeholder (12%)
          new TableCell({
            width: { size: 1123, type: WidthType.DXA },
            borders: bottomLine,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [T('SQH', { bold: true, size: 28, color: TEAL })],
              alignment: AlignmentType.CENTER
            })]
          }),
          // Col 2 : Agence (52%)
          new TableCell({
            width: { size: 4867, type: WidthType.DXA },
            borders: bottomLine,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({ children: [T(agenceNom, { bold: true, size: 26, color: TEAL })], spacing: { after: 40 } }),
              ...(agenceAdr ? [new Paragraph({ children: [T(agenceAdr, { size: 15, color: GREY })], spacing: { after: 20 } })] : []),
              ...(agenceTel ? [new Paragraph({ children: [T('📞 ' + agenceTel, { size: 15, color: GREY })] })] : []),
            ]
          }),
          // Col 3 : Agent (36%)
          new TableCell({
            width: { size: 3370, type: WidthType.DXA },
            borders: bottomLine,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({ children: [T(agentNom, { bold: true, size: 20, color: DARK })], alignment: AlignmentType.RIGHT, spacing: { after: 40 } }),
              new Paragraph({ children: [T('Conseiller Immobilier', { size: 15, color: GREY })], alignment: AlignmentType.RIGHT }),
              ...(agentMail ? [new Paragraph({ children: [T(agentMail, { size: 14, color: GREY })], alignment: AlignmentType.RIGHT })] : []),
            ]
          }),
        ]
      })
    ]
  })
}

// ── Route POST ────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json()
  const { letters = [], date_debut, date_fin } = body
  if (!letters.length) return NextResponse.json({ error: 'Aucune lettre' }, { status: 400 })

  const adminDb = createAdminClient()
  const { data: commercial } = await adminDb
    .from('commerciaux')
    .select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email')
    .eq('id', user.id)
    .maybeSingle()

  // Spec §6.7 : une SECTION par courrier (pas PageBreak) → saut de page automatique Word
  const sections = letters.map((letter: any) => ({
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } // 2cm
      }
    },
    headers: {
      default: {
        options: {
          children: [
            buildHeader(commercial),
            new Paragraph({ children: [], spacing: { after: 200 } })
          ]
        }
      }
    },
    children: buildLetter(letter, commercial)
  }))

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: DARK } } }
    },
    sections
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `courriers-dpe-${date_debut ?? ''}-${date_fin ?? ''}.docx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.byteLength.toString(),
    }
  })
}
