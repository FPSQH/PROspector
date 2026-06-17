// Génération de la prévisualisation HTML depuis un TemplateV2.
// Utilisé par : /courriers/templates (éditeur) + /courriers (liste DPE)

import {
  getDpeGroup, getDpeTexts, getIntroCtx, getVenteText, getGLText,
  getEstimationText, getPolitesse1, getPolitesse2, getAdemeItems, getRenovationCaHTML,
} from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'
import type { TemplateV2, TemplateSection } from '@/lib/lettres/templateEngine'
import {
  fillVarsHtml, getEffectiveSections, parseAddress,
  sectionMatchesCondition, migrateSectionCondition, getSectionConflicts, sectionContentKey,
} from '@/lib/lettres/templateEngine'

export function generatePreviewHTMLV2(data: DpeAdresseData, template: TemplateV2): string {
  const ville       = data.nom_commune ?? data.commune ?? ''
  const dpe         = (data.dpe_etiquette ?? '?').toUpperCase()
  const isAppt      = data.type_bien === 'appartement'
  const typeBien    = data.type_bien === 'appartement' ? 'votre appartement'
                   : data.type_bien === 'maison'       ? 'votre maison'
                   : 'votre bien'
  const ctx         = ville ? `sur le secteur de ${ville}` : 'dans notre secteur'
  const today       = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const dpeGroup    = getDpeGroup(dpe)
  const isRed       = dpeGroup === 'FG' || dpeGroup === 'E'
  const agentNom    = [`${data.agent_prenom ?? ''}`, `${data.agent_nom ?? ''}`].join(' ').trim() || 'Jean Dupont'
  const agentTitre  = data.agent_titre     ?? 'Conseiller Immobilier'
  const agenceNom   = data.agent_agence    ?? 'Square Habitat'
  const agenceTel   = data.agent_telephone ?? '05 56 00 00 00'
  const agenceEmail = data.agent_email     ?? 'contact@squarehabitat.fr'

  const vars: Record<string, string> = {
    typeBien, ctx, dpe, ville,
    adresse:    data.adresse_brute || '',
    conso:      data.conso_ep_m2  ? `${data.conso_ep_m2} kWhep/m²/an` : '',
    cout:       data.cout_annuel  ? `${Math.round(data.cout_annuel).toLocaleString('fr-FR')} €` : '',
    ges:        data.ges_m2       ? `${data.ges_m2} kgeqCO₂/m²/an` : '',
    energie:    data.energie_principale ?? '',
    agentNom, agentTitre, agenceNom, agenceTel, agenceEmail,
  }

  const TEAL        = '#009597'
  const infoBox_bg  = isRed ? '#FDEDEB' : '#E8F6F6'
  const infoBox_brd = isRed ? '#C0392B' : '#009597'

  const logoInFooter = template.logo_position === 'footer'
  const logoScale    = (template.logo_scale_pct ?? 100) / 100
  const logoW        = Math.round((template.logo_width  ?? 60) * logoScale)
  const logoH        = Math.round((template.logo_height ?? 40) * logoScale)
  const logoHtml     = (template.logo_data && template.logo_mime && !logoInFooter)
    ? `<img src="data:${template.logo_mime};base64,${template.logo_data}" alt="Logo" style="width:${logoW}px;height:${logoH}px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="font-size:18px;font-weight:700;color:#009597;font-family:Arial,sans-serif;">SQH</span>`

  const footerHtml = (template.logo_data && template.logo_mime && logoInFooter)
    ? `<div style="margin-top:32px;border-top:2px solid #009597;padding-top:10px;text-align:center;"><img src="data:${template.logo_mime};base64,${template.logo_data}" alt="Logo" style="width:${logoW}px;height:${logoH}px;object-fit:contain;" /></div>`
    : ''

  const headerHtml = `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-family:Arial,sans-serif;"><tr>`
    + `<td style="width:75px;border-bottom:2px solid #009597;vertical-align:middle;text-align:center;padding-bottom:10px;">${logoHtml}</td>`
    + `<td style="border-bottom:2px solid #009597;vertical-align:middle;padding:0 12px 10px;">`
    +   `<div style="font-size:15px;font-weight:700;color:#009597;">${agenceNom}</div>`
    +   (agenceTel ? `<div style="font-size:11px;color:#5F5E5A;">📞 ${agenceTel}</div>` : '')
    + `</td>`
    + `<td style="width:190px;border-bottom:2px solid #009597;vertical-align:middle;text-align:right;padding-bottom:10px;">`
    +   `<div style="font-size:12px;font-weight:700;color:#1A1A1A;">${agentNom}</div>`
    +   `<div style="font-size:11px;color:#5F5E5A;">${agentTitre}</div>`
    +   (agenceEmail ? `<div style="font-size:11px;color:#5F5E5A;">${agenceEmail}</div>` : '')
    + `</td>`
    + `</tr></table>`

  const signatureHtml = `<div style="margin-top:28px;border-top:2px solid #009597;padding-top:10px;font-family:Arial,sans-serif;">`
    + `<div style="font-size:13px;font-weight:700;color:#1A1A1A;">${agentNom}</div>`
    + `<div style="font-size:12px;color:#5F5E5A;">${agentTitre} — ${agenceNom}</div>`
    + (agenceTel   ? `<div style="font-size:12px;color:#5F5E5A;">📞 ${agenceTel}</div>`   : '')
    + (agenceEmail ? `<div style="font-size:12px;color:#5F5E5A;">✉ ${agenceEmail}</div>` : '')
    + `</div>`

  const h4 = (sec: TemplateSection) => {
    if (!sec.showTitle) return ''
    const col    = sec.titleColor ?? TEAL
    const size   = (sec.titleSize ?? 14) + 1
    const weight = sec.titleBold ?? true ? 700 : 400
    const deco   = sec.titleUnderline ? 'underline' : 'none'
    return `<h4 style="font-size:${size}px;font-weight:${weight};color:${col};text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 6px;border-left:4px solid ${col};padding-left:10px;text-decoration:${deco};">${sec.title}</h4>`
  }
  const p = (t: string) => `<p style="font-size:13px;line-height:1.75;margin:0 0 10px;text-align:justify;color:#1A1A1A;">${t}</p>`

  const wrapImgPreview = (
    img: { data: string; mime: string; position?: string; width_pct?: number; valign?: string },
    content: string,
  ): string => {
    const src = `data:${img.mime};base64,${img.data}`
    const pct = img.width_pct ?? 35
    if (img.position === 'fullwidth') {
      return `<div style="text-align:center;margin:0 0 10px;"><img src="${src}" style="max-width:100%;height:auto;border-radius:4px;" /></div>${content}`
    }
    const isLeft  = (img.position ?? 'left') !== 'right'
    const pad     = isLeft ? 'padding-right:14px' : 'padding-left:14px'
    const valignMap: Record<string, string> = { top:'flex-start', middle:'center', bottom:'flex-end' }
    const align   = valignMap[img.valign ?? 'top'] ?? 'flex-start'
    const imgDiv  = `<div style="flex-shrink:0;width:${pct}%;${pad};"><img src="${src}" style="width:100%;height:auto;border-radius:4px;" /></div>`
    const txtDiv  = `<div style="flex:1;">${content}</div>`
    const [l, r]  = isLeft ? [imgDiv, txtDiv] : [txtDiv, imgDiv]
    return `<div style="display:flex;align-items:${align};">${l}${r}</div>`
  }

  // ── Mode texte unique ──────────────────────────────────────────────────────
  if (template.mode === 'unique' && template.unique_text) {
    const parts: string[] = [headerHtml]
    if (template.envelope_enabled) {
      const dest  = template.envelope_line1 || 'Monsieur Madame le Propriétaire'
      const compl = template.envelope_line2 || ''
      const adr   = (data.adresse_brute || '').toUpperCase()
      const cpv   = [data.code_postal, ville].filter(Boolean).join(' ').toUpperCase()
      const lines = [dest, compl ? compl.toUpperCase() : '', adr, cpv].filter(Boolean)
      parts.push(`<div style="display:flex;justify-content:flex-end;margin:0 0 24px;"><div style="border:1px solid #c8c8c8;padding:12px 16px;font-size:12px;line-height:1.9;font-family:Arial,sans-serif;min-width:200px;max-width:260px;background:#fafafa;letter-spacing:0.02em;">${lines.map(l => `<div>${l}</div>`).join('')}</div></div>`)
    }
    parts.push(`<p style="text-align:right;font-size:12px;color:#5F5E5A;font-style:italic;">${ville ? ville + ', le ' : 'Le '}${today}</p>`)
    const uBody = p(fillVarsHtml(template.unique_text, vars))
    const ui = template.unique_image
    if (ui?.data && ui?.mime) {
      parts.push(wrapImgPreview({ data: ui.data, mime: ui.mime, position: ui.position, width_pct: ui.width_pct, valign: ui.valign }, uBody))
    } else {
      parts.push(uBody)
    }
    if (footerHtml) parts.push(footerHtml)
    return parts.join('\n')
  }

  // ── Mode sections ──────────────────────────────────────────────────────────
  const hasAuditPreview = !!(data.audit?.n_audit)
  const typeBienRaw     = data.type_bien ?? 'appartement'
  const sections        = getEffectiveSections(template).map(migrateSectionCondition)
  const parts: string[] = [headerHtml]

  if (template.envelope_enabled) {
    const dest  = template.envelope_line1 || 'Monsieur Madame le Propriétaire'
    const compl = template.envelope_line2 || ''
    const { street, cpVille } = parseAddress(data.adresse_brute || '', data.code_postal || '', ville)
    const adr   = street.toUpperCase()
    const cpv   = cpVille.toUpperCase()
    const lines = [dest, compl ? compl.toUpperCase() : '', adr, cpv].filter(Boolean)
    parts.push(`<div style="border:1px solid #c8c8c8;padding:14px 18px;margin:0 0 24px 55%;font-size:12px;line-height:1.9;font-family:Arial,sans-serif;min-width:220px;background:#fafafa;letter-spacing:0.02em;">${lines.map(l => `<div>${l}</div>`).join('')}</div>`)
  }

  parts.push(`<p style="text-align:right;font-size:12px;color:#5F5E5A;font-style:italic;">${ville ? ville + ', le ' : 'Le '}${today}</p>`)
  parts.push(p('Madame, Monsieur,'))
  parts.push(p(`Je me permets de vous contacter au sujet de ${typeBien} situé : <strong>${data.adresse_brute}</strong>`))

  const previewConflicts = getSectionConflicts(sections)
  for (const sec of sections) {
    if (!sec.enabled) continue
    if (previewConflicts.has(sec.id)) continue
    if (!sectionMatchesCondition(sec, dpe, typeBienRaw, hasAuditPreview)) continue

    const titleHtml = h4(sec)
    if (titleHtml) parts.push(titleHtml)
    const startIdx = parts.length

    switch (sectionContentKey(sec)) {
      case 'intro':
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getIntroCtx(dpeGroup, ctx, typeBien, null)))
        break
      case 'dpe': {
        if (sec.bodyHtml) {
          parts.push(p(fillVarsHtml(sec.bodyHtml, vars)))
        } else {
          const { intro: di, detail: dd } = getDpeTexts(dpe, typeBien, null)
          parts.push(p(`<strong>${di}</strong>`))
          parts.push(p(dd))
          const { line1: al1, line2: al2 } = getAdemeItems(data)
          if (al1 || al2) {
            parts.push(`<div style="background:${infoBox_bg};border-left:4px solid ${infoBox_brd};padding:10px 14px;margin:10px 0 14px;font-size:12px;">${al1 ? `<div>${al1}</div>` : ''}${al2 ? `<div>${al2}</div>` : ''}</div>`)
          }
        }
        break
      }
      case 'audit':
        if (!data.audit?.n_audit) break
        if (sec.bodyHtml) {
          parts.push(p(fillVarsHtml(sec.bodyHtml, vars)))
        } else {
          const scenarios = (data.audit.scenarios || []).filter((sc: any) => !/états*initial/i.test(sc.categorie || '')).slice(0, 3)
          if (scenarios.length) {
            parts.push(p(`Un audit énergétique (n° <strong>${data.audit.n_audit}</strong>) a été réalisé.`))
            parts.push(scenarios.map((sc: any) => `→ <strong>${sc.categorie ?? ''}</strong> : DPE <strong>${sc.classe_apres ?? '?'}</strong>`).join('<br>'))
          }
        }
        break
      case 'estimation':
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getEstimationText(typeBien, null).replace('estimation gratuite et sans engagement', '<strong>estimation gratuite et sans engagement</strong>')))
        break
      case 'vente':
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getVenteText(dpeGroup, dpe, typeBien, null)))
        break
      case 'gestion_locative':
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getGLText(isAppt, null)))
        break
      case 'renovation':
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getRenovationCaHTML(null)))
        break
      case 'politesse':
        if (sec.bodyHtml) {
          parts.push(p(fillVarsHtml(sec.bodyHtml, vars)))
        } else {
          parts.push(p(getPolitesse1(null)))
          parts.push(p(getPolitesse2(null)))
        }
        break
      default:
        if (sec.type === 'custom' && sec.bodyHtml) {
          parts.push(p(fillVarsHtml(sec.bodyHtml, vars)))
        }
    }

    if (sec.image_enabled && sec.image_data && sec.image_mime && parts.length > startIdx) {
      const merged = parts.splice(startIdx).join('\n')
      parts.push(wrapImgPreview(
        { data: sec.image_data, mime: sec.image_mime, position: sec.image_position, width_pct: sec.image_width_pct, valign: sec.image_valign },
        merged,
      ))
    }
  }

  parts.push(signatureHtml)
  if (footerHtml) parts.push(footerHtml)
  return parts.filter(Boolean).join('\n')
}
