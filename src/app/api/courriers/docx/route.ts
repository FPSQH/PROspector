import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  AlignmentType, BorderStyle, ShadingType, WidthType,
  Table, TableRow, TableCell, VerticalAlign, ExternalHyperlink
} from 'docx'
import {
  getDpeGroup, showGL, getIntroCtx, getDpeTexts,
  getVenteText, getGLText, getAdemeItems,
  getEstimationText, getPolitesse1, getPolitesse2,
} from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'
import type { TemplateV2, TemplateSection } from '@/lib/lettres/templateEngine'
import { DEFAULT_SECTIONS, getEffectiveSections, fillVarsHtml } from '@/lib/lettres/templateEngine'
import { htmlToRuns } from '@/lib/lettres/htmlToDocx'

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

function bodyRuns(runs: any[], opts: any = {}) {
  return new Paragraph({
    children: runs,
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

function secTitle(text: string, color = TEAL, sizePt = 14, bold = true, underline = false) {
  return new Paragraph({
    children: [T(text, {
      bold, size: sizePt * 2, color,
      allCaps: true,
      underline: underline ? { type: 'single', color } : undefined,
    })],
    border: { left: { style: BorderStyle.THICK, size: 20, color, space: 8 } },
    indent: { left: 160 },
    spacing: { before: 200, after: 100 }
  })
}

function secTitleFromSection(sec: TemplateSection): Paragraph {
  const color = (sec.titleColor ?? '#009597').replace('#', '')
  return secTitle(sec.title, color, sec.titleSize ?? 14, sec.titleBold ?? true, sec.titleUnderline ?? false)
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

// ── Génère un paragraphe à partir d'un HTML de section ───────────────────────
function htmlPara(html: string, vars: Record<string, string>): Paragraph {
  const filled = fillVarsHtml(html, vars)
  const runs   = htmlToRuns(filled, DARK, 20) as any[]
  return new Paragraph({
    children: runs.length ? runs : [T('')],
    alignment: AlignmentType.BOTH,
    spacing: { after: 120 },
  })
}

// ── Variables disponibles pour un DPE ─────────────────────────────────────────
function buildVars(letter: DpeAdresseData, commercial: any): Record<string, string> {
  const ville    = letter.nom_commune ?? letter.commune ?? ''
  const isAppt   = letter.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const ctx      = ville ? 'sur le secteur de ' + ville : 'dans notre secteur'
  const dpe      = (letter.dpe_etiquette ?? '?').toUpperCase()
  return {
    typeBien,
    ctx,
    dpe,
    ville,
    adresse:    letter.adresse_brute || '',
    conso:      letter.conso_ep_m2    ? `${letter.conso_ep_m2} kWhep/m²/an` : '',
    cout:       letter.cout_annuel    ? `${Math.round(letter.cout_annuel).toLocaleString('fr-FR')} €` : '',
    ges:        letter.ges_m2         ? `${letter.ges_m2} kgeqCO₂/m²/an` : '',
    energie:    letter.energie_principale ?? '',
    agentNom:   [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || 'Votre conseiller',
    agenceNom:  commercial?.agence_nom || 'Square Habitat',
    agenceTel:  commercial?.agence_telephone || '',
    agenceEmail:commercial?.agence_email || '',
  }
}

// ── Génération lettre V2 (templates avec sections_config) ────────────────────
function buildLetterV2(letter: DpeAdresseData, commercial: any, template: TemplateV2): Paragraph[] {
  const vars    = buildVars(letter, commercial)
  const today   = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const ville   = vars.ville
  const dpe     = vars.dpe
  const isAppt  = letter.type_bien === 'appartement'
  const typeBien = vars.typeBien
  const ctx     = vars.ctx

  const dpeGroup = getDpeGroup(dpe)
  const isRed    = dpeGroup === 'FG' || dpeGroup === 'E'
  const bg = isRed ? RED_BG : TEAL_BG
  const bd = isRed ? RED_BD : TEAL_BD

  // Mode unique
  if (template.mode === 'unique' && template.unique_text) {
    const paras: Paragraph[] = []
    paras.push(new Paragraph({
      children: [T(`${ville ? ville + ', le ' : 'Le '}${today}`, { size: 18, color: GREY, italics: true })],
      alignment: AlignmentType.RIGHT, spacing: { after: 240 }
    }))
    paras.push(new Paragraph({
      children: [T('Madame, Monsieur,', { italics: true, size: 20 })],
      spacing: { after: 200 }
    }))
    paras.push(htmlPara(template.unique_text, vars))
    appendSignature(paras, vars.agentNom, commercial)
    return paras
  }

  // Mode sections
  const sections = getEffectiveSections(template)
  const paras: Paragraph[] = []

  // Bloc enveloppe (avant la date, en haut)
  if (template.envelope_enabled) {
    const line1 = template.envelope_line1 || 'Mr et ou Mme le Propriétaire'
    const line2 = letter.adresse_brute || ''
    const line3 = [letter.code_postal, ville].filter(Boolean).join(' ')
    const envLines = [line1, line2, line3].filter(Boolean)
    const cellNil = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
    paras.push(new Paragraph({ children: [], spacing: { after: 600 } }))
    for (const l of envLines) {
      paras.push(new Paragraph({ children: [T(l, { size: 20 })], spacing: { after: 40 } }))
    }
    paras.push(new Paragraph({ children: [], spacing: { after: 480 } }))
  }

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

  // Accroche fixe (adresse + intro)
  paras.push(bodyRich([
    { text: `Je me permets de vous contacter au sujet de ${typeBien} situé : ` },
    { text: letter.adresse_brute || '', bold: true }
  ]))
  paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))

  // Parcourir les sections dans l'ordre
  for (const sec of sections) {
    if (!sec.enabled) continue

    switch (sec.id as string) {
      // ── Intro ──────────────────────────────────────────────────────────────
      case 'intro': {
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          paras.push(body(getIntroCtx(dpeGroup, ctx, typeBien, null)))
        }
        break
      }

      // ── Situation énergétique ──────────────────────────────────────────────
      case 'dpe': {
        if (sec.showTitle) paras.push(secTitleFromSection(sec))
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          const { intro: dpeIntro, detail: dpeDetail } = getDpeTexts(dpe, typeBien, null)
          paras.push(new Paragraph({
            children: [T(dpeIntro, { bold: true })],
            alignment: AlignmentType.BOTH, spacing: { after: 100 }
          }))
          paras.push(body(dpeDetail))
          // Encart ADEME
          const { line1: ademeL1, line2: ademeL2 } = getAdemeItems(letter)
          if (ademeL1) paras.push(infoLine(ademeL1, bg, bd))
          if (ademeL2) paras.push(infoLine(ademeL2, bg, bd))
          if (ademeL1 || ademeL2) paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
        }
        break
      }

      // ── Audit ──────────────────────────────────────────────────────────────
      case 'audit': {
        if (!isRed || !letter.audit?.n_audit) break
        const scenarios = (letter.audit.scenarios || [])
          .filter(sc => !/états*initial/i.test(sc.categorie || '')).slice(0, 3)
        if (!scenarios.length) break
        if (sec.showTitle) paras.push(secTitleFromSection(sec))
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
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
        break
      }

      // ── Estimation ─────────────────────────────────────────────────────────
      case 'estimation': {
        if (sec.showTitle) paras.push(secTitleFromSection(sec))
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          const estimText = getEstimationText(typeBien, null)
          const parts = estimText.split('estimation gratuite et sans engagement')
          paras.push(bodyRich(
            parts.length === 2
              ? [{ text: parts[0] }, { text: 'estimation gratuite et sans engagement', bold: true }, { text: parts[1] }]
              : [{ text: estimText }]
          ))
        }
        break
      }

      // ── Vente ──────────────────────────────────────────────────────────────
      case 'vente': {
        if (sec.showTitle) paras.push(secTitleFromSection(sec))
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          paras.push(body(getVenteText(dpeGroup, dpe, typeBien, null)))
        }
        break
      }

      // ── Gestion locative ───────────────────────────────────────────────────
      case 'gestion_locative': {
        if (!showGL(dpeGroup, isAppt)) break
        if (sec.showTitle) paras.push(secTitleFromSection(sec))
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          paras.push(body(getGLText(isAppt, null)))
        }
        break
      }

      // ── Rénovation ─────────────────────────────────────────────────────────
      case 'renovation': {
        if (!isRed) break
        if (showGL(dpeGroup, isAppt)) break  // GL et rénovation s'excluent
        if (sec.showTitle) paras.push(secTitleFromSection(sec))
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          // Lien cliquable par défaut
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
        break
      }

      // ── Politesse ──────────────────────────────────────────────────────────
      case 'politesse': {
        if (sec.bodyHtml) {
          paras.push(htmlPara(sec.bodyHtml, vars))
        } else {
          paras.push(body(getPolitesse1(null)))
          paras.push(body(getPolitesse2(null)))
        }
        break
      }

      // ── Section personnalisée ──────────────────────────────────────────────
      default: {
        if (sec.type === 'custom') {
          if (sec.showTitle) paras.push(secTitleFromSection(sec))
          if (sec.bodyHtml) paras.push(htmlPara(sec.bodyHtml, vars))
        }
        break
      }
    }
  }

  // Signature
  appendSignature(paras, vars.agentNom, commercial)
  return paras
}

function appendSignature(paras: Paragraph[], agentNom: string, commercial: any) {
  paras.push(new Paragraph({ children: [], spacing: { before: 400 } }))
  paras.push(new Paragraph({
    children: [T(agentNom, { bold: true, size: 22 })],
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 6 } },
    spacing: { before: 80, after: 60 }
  }))
  paras.push(new Paragraph({ children: [T('Conseiller Immobilier — ' + (commercial?.agence_nom || 'Square Habitat'), { size: 18, color: GREY })] }))
  if (commercial?.agence_telephone) paras.push(new Paragraph({ children: [T('📞 ' + commercial.agence_telephone, { size: 18, color: GREY })] }))
  if (commercial?.agence_email)     paras.push(new Paragraph({ children: [T('✉ ' + commercial.agence_email, { size: 18, color: GREY })] }))
}

// ── En-tête (header commun) ───────────────────────────────────────────────────
function buildHeader(commercial: any, template?: TemplateV2 | null): Table {
  const agentNom  = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || ''
  const agenceNom = commercial?.agence_nom || 'Square Habitat'
  const agenceAdr = commercial?.agence_adresse || ''
  const agenceTel = commercial?.agence_telephone || ''
  const agentMail = commercial?.agence_email || ''
  const cellNil   = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
  const bottomLine = { top: cellNil, left: cellNil, right: cellNil, bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL } }

  // Logo column
  const hasLogo = !!(template?.logo_data && template?.logo_mime)
  const logoCell = new TableCell({
    width: { size: 1123, type: WidthType.DXA }, borders: bottomLine, verticalAlign: VerticalAlign.CENTER,
    children: hasLogo
      ? [new Paragraph({
          children: [new ImageRun({
            data: Buffer.from(template!.logo_data!, 'base64'),
            transformation: { width: 60, height: 40 },
            type: (template!.logo_mime!.split('/')[1] as any) || 'png',
          })],
          alignment: AlignmentType.CENTER,
        })]
      : [new Paragraph({ children: [T('SQH', { bold: true, size: 28, color: TEAL })], alignment: AlignmentType.CENTER })]
  })

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1123, 4867, 3370],
    borders: { top: cellNil, bottom: cellNil, left: cellNil, right: cellNil, insideH: cellNil, insideV: cellNil },
    rows: [new TableRow({
      children: [
        logoCell,
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

// ── Route POST ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const bodyJson = await request.json()
  const { letters = [], date_debut, date_fin, template_id } = bodyJson
  if (!letters.length) return NextResponse.json({ error: 'Aucune lettre' }, { status: 400 })

  const adminDb = createAdminClient()

  // Charger le commercial + le template v2 en parallèle
  const [{ data: commercial }, { data: templateRow }] = await Promise.all([
    adminDb.from('commerciaux').select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email').eq('id', user.id).maybeSingle(),
    template_id
      ? supabase.from('lettre_templates_v2').select('*').eq('id', template_id).eq('commercial_id', user.id).maybeSingle()
      : supabase.from('lettre_templates_v2').select('*').eq('commercial_id', user.id).eq('is_default', true).maybeSingle(),
  ])

  const template: TemplateV2 | null = templateRow ?? null

  const sections = letters.map((letter: DpeAdresseData) => ({
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
    },
    headers: {
      default: { options: { children: [buildHeader(commercial, template), new Paragraph({ children: [], spacing: { after: 200 } })] } }
    },
    children: template
      ? buildLetterV2(letter, commercial, template)
      : buildLetterLegacy(letter, commercial),
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

// ── Fallback legacy (sans template v2) ───────────────────────────────────────
function buildLetterLegacy(letter: DpeAdresseData, commercial: any): Paragraph[] {
  const agentNom = [commercial?.prenom, commercial?.nom].filter(Boolean).join(' ') || 'Votre conseiller'
  const today    = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const ville    = letter.nom_commune ?? letter.commune ?? ''
  const dpe      = (letter.dpe_etiquette ?? '?').toUpperCase()
  const isAppt   = letter.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const ctx      = ville ? 'sur le secteur de ' + ville : 'dans notre secteur'
  const dpeGroup = getDpeGroup(dpe)
  const isRed    = dpeGroup === 'FG' || dpeGroup === 'E'
  const bg = isRed ? RED_BG : TEAL_BG
  const bd = isRed ? RED_BD : TEAL_BD

  const { intro: dpeIntro, detail: dpeDetail } = getDpeTexts(dpe, typeBien, null)
  const venteText  = getVenteText(dpeGroup, dpe, typeBien, null)
  const { line1: ademeL1, line2: ademeL2 } = getAdemeItems(letter)
  const introCtx   = getIntroCtx(dpeGroup, ctx, typeBien, null)

  const paras: Paragraph[] = []

  paras.push(new Paragraph({
    children: [T(`${ville ? ville + ', le ' : 'Le '}${today}`, { size: 18, color: GREY, italics: true })],
    alignment: AlignmentType.RIGHT, spacing: { after: 240 }
  }))
  paras.push(new Paragraph({
    children: [T('Madame, Monsieur,', { italics: true, size: 20 })],
    spacing: { after: 200 }
  }))
  paras.push(bodyRich([
    { text: `Je me permets de vous contacter au sujet de ${typeBien} situé : ` },
    { text: letter.adresse_brute || '', bold: true }
  ]))
  paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
  paras.push(body(introCtx))
  paras.push(secTitle('Situation énergétique de votre bien'))
  paras.push(new Paragraph({
    children: [T(dpeIntro, { bold: true })],
    alignment: AlignmentType.BOTH, spacing: { after: 100 }
  }))
  paras.push(body(dpeDetail))
  if (ademeL1) paras.push(infoLine(ademeL1, bg, bd))
  if (ademeL2) paras.push(infoLine(ademeL2, bg, bd))
  if (ademeL1 || ademeL2) paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
  if (isRed && letter.audit?.n_audit) {
    const scenarios = (letter.audit.scenarios || []).filter(sc => !/états*initial/i.test(sc.categorie || '')).slice(0, 3)
    if (scenarios.length) {
      paras.push(secTitle('Audit énergétique & rénovation'))
      paras.push(bodyRich([{ text: `Un audit énergétique (n° ` }, { text: letter.audit.n_audit, bold: true }, { text: `) a été réalisé pour ce bien. Il identifie plusieurs scénarios de rénovation :` }]))
      for (const sc of scenarios) {
        const label = (sc.categorie || 'Scénario').trim()
        const cout  = sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} € de travaux` : ''
        const gain  = sc.gain_pct    ? ` — gain estimé : ${sc.gain_pct}%` : ''
        paras.push(bodyRich([{ text: '→ ' }, { text: label, bold: true }, { text: ' : atteindre DPE ' }, { text: sc.classe_apres || '?', bold: true }, { text: `${cout}${gain}` }], { spacing: { after: 60 } }))
      }
      paras.push(new Paragraph({ children: [], spacing: { after: 80 } }))
    }
  }
  paras.push(secTitle('Estimation gratuite de votre bien'))
  const estimText = getEstimationText(typeBien, null)
  const estimParts = estimText.split('estimation gratuite et sans engagement')
  paras.push(bodyRich(estimParts.length === 2 ? [{ text: estimParts[0] }, { text: 'estimation gratuite et sans engagement', bold: true }, { text: estimParts[1] }] : [{ text: estimText }]))
  paras.push(secTitle('Vous envisagez de vendre ?'))
  paras.push(body(venteText))
  if (showGL(dpeGroup, isAppt)) {
    paras.push(secTitle('Notre service de gestion locative'))
    paras.push(body(getGLText(isAppt, null)))
  } else if (isRed) {
    paras.push(secTitle('Un projet de rénovation ?'))
    paras.push(new Paragraph({
      children: [
        T('Square Habitat est le réseau immobilier du groupe Crédit Agricole. Si vous envisagez des travaux de rénovation énergétique, nous pouvons vous mettre en relation avec un conseiller du Crédit Agricole pour étudier leur financement (prêts et solutions dédiées). Vous pouvez également utiliser le site '),
        new ExternalHyperlink({ link: 'https://j-ecorenove.credit-agricole.fr', children: [T("J'écorénove", { color: TEAL, underline: { type: 'single', color: TEAL } })] }),
        T(' pour simuler vos travaux et estimer les aides auxquelles vous pourriez prétendre.'),
      ],
      alignment: AlignmentType.BOTH, spacing: { after: 120 }
    }))
  }
  paras.push(new Paragraph({ children: [], spacing: { after: 120 } }))
  paras.push(body(getPolitesse1(null)))
  paras.push(body(getPolitesse2(null)))
  appendSignature(paras, agentNom, commercial)
  return paras
}
