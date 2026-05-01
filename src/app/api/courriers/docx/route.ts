import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, ShadingType, WidthType,
  Table, TableRow, TableCell, VerticalAlign, ExternalHyperlink
} from 'docx'
import {
  getDpeGroup, showGL, getIntroCtx, getDpeTexts,
  getVenteText, getGLText, getAdemeItems, RENOVATION_CA_TEXT
} from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'

const TEAL    = '009597'
const DARK    = '1A1A1A'
const GREY    = '5F5E5A'
const RED_BG  = 'FDEDEB'
const RED_BD  = 'C0392B'
const TEAL_BG = 'E8F6F6'
const TEAL_BD = '009597'

function T(text: string, opts: any = {}) {
  return new TextRun({ text, font: 'Arial', size: 20, color: DARK, ...opts })
}

function body(text: string, opts: any = {}) {
  return new Paragraph({
    children: [T(text)],
    alignment: AlignmentType.BOTH,
    spacing: { after: 120 },
    ...opts
  })
}

function bodyRich(parts: Array<{text: string; bold?: boolean}>, opts: any = {}) {
  return new Paragraph({
    children: parts.map(p => T(p.text, { bold: p.bold ?? false })),
    alignment: AlignmentType.BOTH,
    spacing: { after: 120 },
    ...opts
  })
}

function secTitle(text: string) {
  return new Paragraph({
    children: [T(text, { bold: true, size: 18, color: TEAL, allCaps: true })],
    border: { left: { style: BorderStyle.THICK, size: 20, color: TEAL, space: 8 } },
    indent: { left: 160 },
    spacing: { before: 200, after: 100 }
  })
}

function infoLine(text: string, bgColor: string, bdColor: string) {
  return new Paragraph({
    children: [T(text, { size: 18 })],
    shading: { type: ShadingType.CLEAR, fill: bgColor },
    border: { left: { style: BorderStyle.THICK, size: 20, color: bdColor, space: 8 } },
    indent: { left: 160 },
    spacing: { after: 60 }
  })
}

// ── Construction lettre DOCX — utilise exactement les mêmes fonctions que le HTML ──
function buildLetter(letter: DpeAdresseData, commercial: any): any[] {
  const agentNom = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || 'Votre conseiller'
  const today    = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const ville    = letter.nom_commune ?? letter.commune ?? ''
  const dpe      = (letter.dpe_etiquette ?? '?').toUpperCase()
  const isAppt   = letter.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const ctx      = ville ? 'sur le secteur de ' + ville : 'dans notre secteur'

  // ── Même logique que generator.ts ──
  const dpeGroup = getDpeGroup(dpe)
  const isRed    = dpeGroup === 'FG' || dpeGroup === 'E'
  const { intro: dpeIntro, detail: dpeDetail } = getDpeTexts(dpe, typeBien)
  const venteText  = getVenteText(dpeGroup, dpe, typeBien)
  const { line1: ademeL1, line2: ademeL2 } = getAdemeItems(letter)
  const introCtx   = getIntroCtx(dpeGroup, ctx, typeBien)

  const bg = isRed ? RED_BG : TEAL_BG
  const bd = isRed ? RED_BD : TEAL_BD

  const paras: any[] = []

  // Date
  paras.push(new Paragraph({
    children: [T(`${ville ? ville + ', le ' : 'Le '}${today}`, { size: 18, color: GREY, italics: true })],
    alignment: AlignmentType.RIGHT, spacing: { after: 240 }
  }))

  // Appel
  paras.push(new Paragraph({
    children: [T('Madame, Monsieur,', { italics: true, size: 20 })],
    spacing: { after: 200 }
  }))

  // Accroche
  paras.push(bodyRich([
    { text: `Je me permets de vous contacter au sujet de ${typeBien} situé : ` },
    { text: letter.adresse_brute || '', bold: true }
  ]))
  paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))

  // Introduction
  paras.push(body(introCtx))

  // Section DPE
  paras.push(secTitle('Situation énergétique de votre bien'))
  // Phrase intro en GRAS
  paras.push(new Paragraph({
    children: [T(dpeIntro, { bold: true })],
    alignment: AlignmentType.BOTH,
    spacing: { after: 100 }
  }))
  paras.push(body(dpeDetail))

  // Encart ADEME — ligne1: Conso+Coût / ligne2: Énergie+GES
  if (ademeL1) paras.push(infoLine(ademeL1, bg, bd))
  if (ademeL2) paras.push(infoLine(ademeL2, bg, bd))
  if (ademeL1 || ademeL2) paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))

  // Audit (E/F/G uniquement si disponible)
  if (isRed && letter.audit?.n_audit) {
    const scenarios = (letter.audit.scenarios || [])
      .filter(sc => !/états*initial/i.test(sc.categorie || '')).slice(0, 3)
    if (scenarios.length) {
      paras.push(secTitle('Audit énergétique & rénovation'))
      paras.push(bodyRich([
        { text: `Un audit énergétique (n° ` },
        { text: letter.audit.n_audit, bold: true },
        { text: `${letter.audit.date_audit ? ', réalisé le ' + letter.audit.date_audit : ''}) a été réalisé pour ce bien. Il identifie plusieurs scénarios de rénovation :` }
      ]))
      for (const sc of scenarios) {
        const label = (sc.categorie || 'Scénario').trim()
        const cout  = sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} € de travaux` : ''
        const gain  = sc.gain_pct    ? ` — gain estimé : ${sc.gain_pct}%` : ''
        paras.push(bodyRich([
          { text: '→ ' }, { text: label, bold: true },
          { text: ' : atteindre DPE ' }, { text: sc.classe_apres || '?', bold: true },
          { text: `${cout}${gain}` }
        ], { spacing: { after: 60 } }))
      }
      paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
    }
  }

  // Estimation
  paras.push(secTitle('Estimation gratuite de votre bien'))
  paras.push(bodyRich([
    { text: 'Pour vous accompagner dans votre réflexion, je vous propose de réaliser une ' },
    { text: 'estimation gratuite et sans engagement', bold: true },
    { text: ` de ${typeBien}. Cette estimation, établie à partir des ventes récentes de biens comparables dans votre secteur, vous donnera une vision claire de la valeur actuelle de votre propriété sur le marché.` }
  ]))

  // Vente
  paras.push(secTitle('Vous envisagez de vendre ?'))
  paras.push(body(venteText))

  // Gestion locative OU bloc rénovation CA — JAMAIS les deux (même règle que HTML)
  if (showGL(dpeGroup, isAppt)) {
    paras.push(secTitle('Notre service de gestion locative'))
    paras.push(body(getGLText(isAppt)))
  } else if (isRed) {
    paras.push(secTitle('Un projet de rénovation ?'))
    // Lien cliquable dans le DOCX
    paras.push(new Paragraph({
      children: [
        T('Square Habitat est le réseau immobilier du groupe Crédit Agricole. Si vous envisagez des travaux de rénovation énergétique, nous pouvons vous mettre en relation avec un conseiller du Crédit Agricole pour étudier leur financement (prêts et solutions dédiées). Vous pouvez également utiliser le site '),
        new ExternalHyperlink({
          link: 'https://j-ecorenove.credit-agricole.fr',
          children: [T("J'écorénove", { color: TEAL, underline: { type: 'single', color: TEAL } })]
        }),
        T(' pour simuler vos travaux et estimer les aides auxquelles vous pourriez prétendre.'),
      ],
      alignment: AlignmentType.BOTH, spacing: { after: 120 }
    }))
  }

  // Politesse
  paras.push(new Paragraph({ children: [], spacing: { after: 120 } }))
  paras.push(body("Je reste à votre entière disposition pour répondre à vos questions ou convenir d'un rendez-vous à votre convenance, sans aucun engagement de votre part."))
  paras.push(body("Dans l'attente de votre retour, je vous adresse, Madame, Monsieur, mes cordiales salutations."))

  // Signature
  paras.push(new Paragraph({ children: [], spacing: { before: 400 } }))
  paras.push(new Paragraph({
    children: [T(agentNom, { bold: true, size: 22 })],
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 6 } },
    spacing: { before: 80, after: 60 }
  }))
  paras.push(new Paragraph({ children: [T('Conseiller Immobilier — ' + (commercial?.agence_nom || 'Square Habitat'), { size: 18, color: GREY })] }))
  if (commercial?.agence_telephone) paras.push(new Paragraph({ children: [T('📞 ' + commercial.agence_telephone, { size: 18, color: GREY })] }))
  if (commercial?.agence_email)     paras.push(new Paragraph({ children: [T('✉ ' + commercial.agence_email, { size: 18, color: GREY })] }))

  return paras
}

function buildHeader(commercial: any): Table {
  const agentNom  = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || ''
  const agenceNom = commercial?.agence_nom || 'Square Habitat'
  const agenceAdr = commercial?.agence_adresse || ''
  const agenceTel = commercial?.agence_telephone || ''
  const agentMail = commercial?.agence_email || ''
  const cellNil   = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
  const bottomLine = { top: cellNil, left: cellNil, right: cellNil, bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL } }

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1123, 4867, 3370],
    borders: { top: cellNil, bottom: cellNil, left: cellNil, right: cellNil, insideH: cellNil, insideV: cellNil },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 1123, type: WidthType.DXA }, borders: bottomLine, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [T('SQH', { bold: true, size: 28, color: TEAL })], alignment: AlignmentType.CENTER })]
        }),
        new TableCell({
          width: { size: 4867, type: WidthType.DXA }, borders: bottomLine, verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ children: [T(agenceNom, { bold: true, size: 26, color: TEAL })], spacing: { after: 40 } }),
            ...(agenceAdr ? [new Paragraph({ children: [T(agenceAdr, { size: 15, color: GREY })], spacing: { after: 20 } })] : []),
            ...(agenceTel ? [new Paragraph({ children: [T('📞 ' + agenceTel, { size: 15, color: GREY })] })] : []),
          ]
        }),
        new TableCell({
          width: { size: 3370, type: WidthType.DXA }, borders: bottomLine, verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ children: [T(agentNom, { bold: true, size: 20, color: DARK })], alignment: AlignmentType.RIGHT, spacing: { after: 40 } }),
            new Paragraph({ children: [T('Conseiller Immobilier', { size: 15, color: GREY })], alignment: AlignmentType.RIGHT }),
            ...(agentMail ? [new Paragraph({ children: [T(agentMail, { size: 14, color: GREY })], alignment: AlignmentType.RIGHT })] : []),
          ]
        }),
      ]
    })]
  })
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
    .from('commerciaux').select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email')
    .eq('id', user.id).maybeSingle()

  const sections = letters.map((letter: DpeAdresseData) => ({
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
    },
    headers: {
      default: { options: { children: [buildHeader(commercial), new Paragraph({ children: [], spacing: { after: 200 } })] } }
    },
    children: buildLetter(letter, commercial)
  }))

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20, color: DARK } } } },
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
