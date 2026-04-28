import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, PageBreak,
  AlignmentType, BorderStyle, ShadingType,
  HeadingLevel, WidthType
} from 'docx'

const GREEN  = '1D9E75'
const DARK   = '1A1A18'
const GREY   = '5F5E5A'
const LGREY  = 'B4B2A9'
const RED_BG = 'FEF2F2'
const RED_BD = 'FECACA'
const GRN_BG = 'F0FDF4'
const GRN_BD = 'BBF7D0'

function T(text: string, opts: any = {}) {
  return new TextRun({ text, font: 'Georgia', size: 22, ...opts })
}
function Tb() { return new TextRun({ break: 1 }) }

function headerLine(agenceNom: string, agenceAdr: string, agenceTel: string, agentNom: string, agentEmail: string) {
  const runs: any[] = [
    T(agenceNom || 'Square Habitat', { bold: true, size: 28, color: GREEN }),
  ]
  if (agentNom) {
    runs.push(T('   |   ', { size: 24, color: LGREY }))
    runs.push(T(agentNom, { bold: true, size: 24, color: DARK }))
    runs.push(T('  –  Conseiller Immobilier', { size: 20, color: GREY }))
  }
  if (agenceAdr || agenceTel || agentEmail) {
    runs.push(Tb())
    if (agenceAdr) runs.push(T(agenceAdr, { size: 18, color: GREY }))
    if (agenceTel) runs.push(T((agenceAdr ? '    ' : '') + 'Tel : ' + agenceTel, { size: 18, color: GREY }))
    if (agentEmail) runs.push(T('    ' + agentEmail, { size: 18, color: GREY }))
  }
  return new Paragraph({
    children: runs,
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GREEN, space: 8 } },
    spacing: { after: 300 }
  })
}

function secTitle(text: string) {
  return new Paragraph({
    children: [T(text, { bold: true, size: 20, color: GREEN, allCaps: true })],
    spacing: { before: 280, after: 100 }
  })
}

function body(text: string) {
  return new Paragraph({
    children: [T(text, { size: 22, color: DARK })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120 }
  })
}

function infoBox(items: string[], bgColor: string, bdColor: string) {
  if (!items.length) return null
  return new Paragraph({
    children: [T(items.join('   ·   '), { size: 20, color: DARK, bold: true })],
    alignment: AlignmentType.CENTER,
    border: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: bdColor },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: bdColor },
      left:   { style: BorderStyle.SINGLE, size: 4, color: bdColor },
      right:  { style: BorderStyle.SINGLE, size: 4, color: bdColor },
    },
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    spacing: { before: 120, after: 180 }
  })
}

function buildLetter(letter: any, commercial: any): Paragraph[] {
  const agentNom  = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ')
  const agentSig  = agentNom || 'Votre conseiller'
  const today     = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const ville     = letter.nom_commune || ''
  const dpe       = (letter.dpe_etiquette || '?').toUpperCase()
  const isAppt    = letter.type_bien === 'appartement'
  const typeBien  = isAppt ? 'votre appartement' : 'votre bien'
  const ctx       = ville ? 'sur le secteur de ' + ville : 'dans notre secteur'

  // ── Textes selon stratégie DPE ──
  const introCtx = (['F','G','E'].includes(dpe))
    ? `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux évolutions réglementaires qui concernent les propriétaires ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`
    : `Dans le cadre de mon activité de conseiller immobilier local, je suis attentif aux opportunités du marché ${ctx}. J'ai pris connaissance du diagnostic de performance énergétique récemment réalisé pour ${typeBien}, et je souhaitais vous contacter directement.`

  let dpeText = ''
  if (['F','G'].includes(dpe)) {
    dpeText = `Votre bien est classé DPE ${dpe}, ce qui le place dans la catégorie des logements à forte consommation énergétique — communément appelés « passoires thermiques ». Depuis le 1er janvier ${dpe === 'G' ? '2023' : '2025'}, ce type de logement ne peut plus être mis en location. Face à cette contrainte réglementaire, de nombreux propriétaires font le choix de céder leur bien dans de bonnes conditions, avant que les obligations de rénovation ne se renforcent davantage.`
  } else if (dpe === 'E') {
    dpeText = `Votre bien est classé DPE E. Depuis 2023, les loyers de ce type de logement sont gelés : il n'est plus possible de les réviser à la hausse, ni lors d'un renouvellement de bail, ni entre deux locataires. De plus, à horizon 2034, ces biens seront soumis aux mêmes restrictions que les classes F et G. Il peut donc être judicieux d'évaluer vos options dès maintenant.`
  } else if (['C','D'].includes(dpe)) {
    dpeText = `Votre bien est classé DPE ${dpe}. Bien que cette classe ne soit pas encore soumise à des restrictions immédiates, le contexte réglementaire évolue rapidement. Le marché immobilier local est actuellement dynamique, et c'est souvent dans ces périodes favorables que se réalisent les meilleures transactions.`
  } else {
    dpeText = `Votre bien est classé DPE ${dpe}, ce qui constitue un vrai atout sur le marché actuel. Les acheteurs sont de plus en plus sensibles aux performances énergétiques, et un excellent classement DPE valorise significativement ${typeBien} lors d'une mise en vente ou d'une mise en location.`
  }

  let venteText = ''
  if (['F','G','E'].includes(dpe)) {
    venteText = `Un DPE ${dpe} ne constitue pas un obstacle à la vente : certains acquéreurs recherchent précisément ce type de bien, y voyant l'opportunité de réaliser un projet de rénovation selon leurs propres choix. Grâce à ma connaissance du marché local et des acquéreurs actifs sur votre secteur, je suis en mesure de cibler ces profils et de vous accompagner vers une transaction réussie, dans les meilleures conditions.`
  } else {
    venteText = `Si vous envisagez de vendre ${typeBien}, votre DPE ${dpe} est un atout supplémentaire apprécié des acheteurs. Je serais ravi de vous accompagner et de vous proposer les meilleures conditions de vente en valorisant ce point fort.`
  }

  const glText = isAppt
    ? `Par ailleurs, si vous souhaitez conserver votre bien tout en vous libérant des contraintes de la gestion, notre agence propose un service de gestion locative complète : recherche de locataires, encaissement des loyers et suivi quotidien de votre bien.`
    : `Si la vente ne correspond pas à votre projet immédiat, notre agence propose également un service de gestion locative : prise en charge intégrale de la gestion, de la recherche de locataires à la perception des loyers, pour valoriser votre patrimoine sereinement.`

  // ── Construction des paragraphes ──
  const paras: any[] = []

  // En-tête
  paras.push(headerLine(
    commercial?.agence_nom || 'Square Habitat',
    commercial?.agence_adresse || '',
    commercial?.agence_telephone || '',
    agentSig,
    commercial?.agence_email || ''
  ))

  // Date
  paras.push(new Paragraph({
    children: [T(`${ville ? ville + ', le ' : 'Le '}${today}`, { size: 20, color: GREY, italics: true })],
    alignment: AlignmentType.RIGHT, spacing: { after: 300 }
  }))

  // Salutation
  paras.push(new Paragraph({
    children: [T('Madame, Monsieur,', { bold: true, size: 22 })],
    spacing: { after: 200 }
  }))

  // Objet
  paras.push(body(`Je me permets de vous contacter au sujet de ${typeBien} situé :`))
  paras.push(new Paragraph({
    children: [T(letter.adresse_brute || '', { bold: true, size: 22, color: DARK })],
    spacing: { after: 200 }
  }))

  paras.push(body(introCtx))

  // Section DPE
  paras.push(secTitle('Situation énergétique de votre bien'))
  paras.push(body(dpeText))

  // Encart ADEME
  const ademeItems: string[] = []
  if (letter.conso_ep_m2)        ademeItems.push(`Conso : ${letter.conso_ep_m2} kWhep/m²/an`)
  if (letter.cout_annuel)        ademeItems.push(`Coût annuel : ${Math.round(letter.cout_annuel).toLocaleString('fr-FR')} €`)
  if (letter.energie_principale) ademeItems.push(`Énergie : ${letter.energie_principale}`)
  if (letter.ges_m2)             ademeItems.push(`GES : ${letter.ges_m2} kgeqCO₂/m²/an`)
  const box = infoBox(ademeItems, (['F','G','E'].includes(dpe)) ? RED_BG : GRN_BG, (['F','G','E'].includes(dpe)) ? RED_BD : GRN_BD)
  if (box) paras.push(box)

  // Audit ou avertissement
  if (letter.audit?.n_audit) {
    const scenarios = (letter.audit.scenarios || [])
      .filter((sc: any) => !/états*initial/i.test(sc.categorie || '')).slice(0, 3)
    if (scenarios.length) {
      paras.push(secTitle('Audit énergétique & rénovation'))
      paras.push(body(`Un audit énergétique (n° ${letter.audit.n_audit}${letter.audit.date_audit ? ', réalisé le ' + letter.audit.date_audit : ''}) a été réalisé pour ce bien. Il identifie plusieurs scénarios de rénovation :`))
      for (const sc of scenarios) {
        const label = (sc.categorie || 'Scénario').replace(/principale?/gi,'').trim()
        const cout  = sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} €` : ''
        const gain  = sc.gain_pct    ? ` — gain estimé : ${sc.gain_pct}%` : ''
        paras.push(new Paragraph({
          children: [
            T('→ ', { bold: true, color: GREEN }),
            T(`${label} : atteindre DPE `),
            T(sc.classe_apres || '?', { bold: true, color: GREEN }),
            T(`${cout}${gain}`),
          ],
          spacing: { after: 60 }
        }))
      }
    }
  } else if (['E','F','G'].includes(dpe)) {
    paras.push(new Paragraph({
      children: [T(`Ce bien est classé ${dpe} mais aucun audit énergétique n'a été enregistré. L'audit est pourtant obligatoire pour les biens classés E, F ou G depuis 2023.`, { size: 20, color: 'B91C1C', italics: true })],
      spacing: { before: 120, after: 160 }
    }))
  }

  // Estimation
  paras.push(secTitle('Estimation gratuite de votre bien'))
  paras.push(body(`Pour vous accompagner dans votre réflexion, je vous propose de réaliser une estimation gratuite et sans engagement de ${typeBien}. Cette estimation, établie à partir des ventes récentes de biens comparables dans votre secteur, vous donnera une vision claire de la valeur actuelle de votre propriété sur le marché.`))

  // Vente
  paras.push(secTitle('Vous envisagez de vendre ?'))
  paras.push(body(venteText))

  // Gestion locative
  paras.push(secTitle('Notre service de gestion locative'))
  paras.push(body(glText))

  // Closing
  paras.push(body(`Je reste à votre entière disposition pour répondre à vos questions ou convenir d'un rendez-vous à votre convenance, sans aucun engagement de votre part.`))
  paras.push(body(`Dans l'attente de votre retour, je vous adresse, Madame, Monsieur, mes cordiales salutations.`))

  // Signature
  paras.push(new Paragraph({ children: [], spacing: { before: 400 } }))
  paras.push(new Paragraph({ children: [T(agentSig, { bold: true, size: 24 })] }))
  paras.push(new Paragraph({ children: [T('Conseiller Immobilier — ' + (commercial?.agence_nom || 'Square Habitat'), { size: 20, color: GREY })] }))
  if (commercial?.agence_telephone) paras.push(new Paragraph({ children: [T('Tél. : ' + commercial.agence_telephone, { size: 20, color: GREY })] }))
  if (commercial?.agence_email)     paras.push(new Paragraph({ children: [T(commercial.agence_email, { size: 20, color: GREY })] }))

  return paras
}

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

  // Construire les sections du document (une lettre = une section A4)
  const allChildren: any[] = []
  for (let i = 0; i < letters.length; i++) {
    const letterParas = buildLetter(letters[i], commercial)
    allChildren.push(...letterParas)
    if (i < letters.length - 1) {
      allChildren.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Georgia', size: 22, color: DARK } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } // 2cm
        }
      },
      children: allChildren
    }]
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
