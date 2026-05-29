'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { TemplateV2, TemplateSection, FixedSectionId } from '@/lib/lettres/templateEngine'
import {
  DEFAULT_SECTIONS, SECTION_META, ALL_VARIABLES, getEffectiveSections,
} from '@/lib/lettres/templateEngine'
import {
  generateLetterHTML, getDpeGroup, getDpeTexts, getIntroCtx,
  getVenteText, getGLText, getEstimationText, getPolitesse1, getPolitesse2,
  getAdemeItems, showGL, getRenovationCaHTML,
} from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'
import { fillVarsHtml } from '@/lib/lettres/templateEngine'

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  card2:   '#1A1A1E',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.10)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  blue:    '#60A5FA',
  gold:    '#D97706',
  danger:  '#EF4444',
  success: '#22C55E',
}

// ── Données DPE de prévisualisation ───────────────────────────────────────────
const PREVIEW_BASE: DpeAdresseData = {
  id: 'preview',
  adresse_brute: '12 Rue de la Paix',
  nom_commune: 'Bordeaux',
  type_bien: 'appartement',
  conso_ep_m2: 320,
  cout_annuel: 2800,
  energie_principale: 'Électricité',
  ges_m2: 62,
}

// ── Couleurs DPE ──────────────────────────────────────────────────────────────
const DPE_COLORS: Record<string, string> = {
  A:'#319834', B:'#51A351', C:'#B0CC30', D:'#F0D30A',
  E:'#F0A500', F:'#E06029', G:'#CC1016',
}

// ── Palette couleurs titre ─────────────────────────────────────────────────────
const TITLE_PALETTE = [
  '#009597','#1D9E75','#2563EB','#7C3AED','#DB2777',
  '#EA580C','#CA8A04','#16A34A','#1A1A1A','#6B7280',
]

// ── ID auto pour sections custom ──────────────────────────────────────────────
function uid() { return crypto.randomUUID() }

// ── Génération aperçu HTML depuis template V2 ─────────────────────────────────
function generatePreviewHTMLV2(data: DpeAdresseData, template: TemplateV2): string {
  const ville    = data.nom_commune ?? data.commune ?? ''
  const dpe      = (data.dpe_etiquette ?? '?').toUpperCase()
  const isAppt   = data.type_bien === 'appartement'
  const typeBien = isAppt ? 'votre appartement' : 'votre bien'
  const ctx      = ville ? `sur le secteur de ${ville}` : 'dans notre secteur'
  const today    = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  const dpeGroup = getDpeGroup(dpe)
  const isRed    = dpeGroup === 'FG' || dpeGroup === 'E'

  const vars: Record<string, string> = {
    typeBien, ctx, dpe, ville,
    adresse:     data.adresse_brute || '',
    conso:       data.conso_ep_m2    ? `${data.conso_ep_m2} kWhep/m²/an` : '',
    cout:        data.cout_annuel    ? `${Math.round(data.cout_annuel).toLocaleString('fr-FR')} €` : '',
    ges:         data.ges_m2         ? `${data.ges_m2} kgeqCO₂/m²/an` : '',
    energie:     data.energie_principale ?? '',
    agentNom:    'Jean Dupont',
    agenceNom:   'Square Habitat',
    agenceTel:   '05 56 00 00 00',
    agenceEmail: 'contact@squarehabitat.fr',
  }

  const TEAL = '#009597'
  const infoBox_bg  = isRed ? '#FDEDEB' : '#E8F6F6'
  const infoBox_brd = isRed ? '#C0392B' : '#009597'

  const h4 = (sec: TemplateSection) => {
    if (!sec.showTitle) return ''
    const col = sec.titleColor ?? TEAL
    const size = (sec.titleSize ?? 14) + 1
    const weight = sec.titleBold ?? true ? 700 : 400
    const deco = sec.titleUnderline ? 'underline' : 'none'
    return `<h4 style="font-size:${size}px;font-weight:${weight};color:${col};text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 6px;border-left:4px solid ${col};padding-left:10px;text-decoration:${deco};">${sec.title}</h4>`
  }
  const p = (t: string) => `<p style="font-size:13px;line-height:1.75;margin:0 0 10px;text-align:justify;color:#1A1A1A;">${t}</p>`

  if (template.mode === 'unique' && template.unique_text) {
    return [
      `<p style="text-align:right;font-size:12px;color:#5F5E5A;font-style:italic;">${ville ? ville + ', le ' : 'Le '}${today}</p>`,
      p(fillVarsHtml(template.unique_text, vars)),
    ].join('\n')
  }

  const sections = getEffectiveSections(template)
  const parts: string[] = []

  // Enveloppe
  if (template.envelope_enabled) {
    const l1 = template.envelope_line1 || 'Mr et ou Mme le Propriétaire'
    parts.push(`<div style="border:1px dashed #aaa;padding:12px 16px;margin:0 0 24px;font-size:13px;line-height:2;max-width:280px;"><div>${l1}</div><div>${data.adresse_brute || ''}</div><div>${[data.code_postal, ville].filter(Boolean).join(' ')}</div></div>`)
  }

  parts.push(`<p style="text-align:right;font-size:12px;color:#5F5E5A;font-style:italic;">${ville ? ville + ', le ' : 'Le '}${today}</p>`)
  parts.push(p('Madame, Monsieur,'))
  parts.push(p(`Je me permets de vous contacter au sujet de ${typeBien} situé : <strong>${data.adresse_brute}</strong>`))

  for (const sec of sections) {
    if (!sec.enabled) continue

    switch (sec.id) {
      case 'intro':
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getIntroCtx(dpeGroup, ctx, typeBien, null)))
        break
      case 'dpe': {
        parts.push(h4(sec))
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
        if (!isRed || !data.audit?.n_audit) break
        parts.push(h4(sec))
        if (sec.bodyHtml) {
          parts.push(p(fillVarsHtml(sec.bodyHtml, vars)))
        } else {
          const scenarios = (data.audit.scenarios || []).filter(sc => !/états*initial/i.test(sc.categorie || '')).slice(0,3)
          if (scenarios.length) {
            parts.push(p(`Un audit énergétique (n° <strong>${data.audit.n_audit}</strong>) a été réalisé.`))
            parts.push(scenarios.map(sc => `→ <strong>${sc.categorie ?? ''}</strong> : DPE <strong>${sc.classe_apres ?? '?'}</strong>`).join('<br>'))
          }
        }
        break
      case 'estimation':
        parts.push(h4(sec))
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getEstimationText(typeBien, null).replace('estimation gratuite et sans engagement', '<strong>estimation gratuite et sans engagement</strong>')))
        break
      case 'vente':
        parts.push(h4(sec))
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getVenteText(dpeGroup, dpe, typeBien, null)))
        break
      case 'gestion_locative':
        if (!showGL(dpeGroup, isAppt)) break
        parts.push(h4(sec))
        parts.push(p(sec.bodyHtml ? fillVarsHtml(sec.bodyHtml, vars) : getGLText(isAppt, null)))
        break
      case 'renovation':
        if (!isRed || showGL(dpeGroup, isAppt)) break
        parts.push(h4(sec))
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
          parts.push(h4(sec))
          parts.push(p(fillVarsHtml(sec.bodyHtml, vars)))
        }
    }
  }

  parts.push(`<p style="margin-top:28px;font-size:13px;color:#1A1A1A;"><strong>Jean Dupont</strong><br>Conseiller Immobilier — Square Habitat</p>`)
  return parts.filter(Boolean).join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT ÉDITEUR RICH TEXT
// ─────────────────────────────────────────────────────────────────────────────

interface RichEditorProps {
  value:     string
  onChange:  (html: string) => void
  placeholder?: string
  vars?:     string[]
}

function RichEditor({ value, onChange, placeholder, vars = [] }: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [showVars, setShowVars] = useState(false)

  // Sync value → DOM uniquement quand value change de l'extérieur (pas depuis onInput)
  const lastEmitted = useRef('')
  useEffect(() => {
    if (!ref.current) return
    // Si la valeur vient du parent (différente de ce qu'on a émis), on met à jour le DOM
    if (value !== lastEmitted.current) {
      ref.current.innerHTML = value
      lastEmitted.current = value
    }
  }, [value])

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    emit()
  }

  const emit = () => {
    const html = ref.current?.innerHTML ?? ''
    lastEmitted.current = html
    onChange(html)
  }

  const insertVar = (v: string) => {
    ref.current?.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(v))
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      ref.current!.innerHTML += v
    }
    emit()
  }

  const toolbar: React.CSSProperties = {
    display: 'flex', gap: 4, flexWrap: 'wrap', padding: '6px 8px',
    background: C.card2, borderRadius: '6px 6px 0 0',
    borderBottom: `1px solid ${C.border}`,
  }
  const btn = (active?: boolean): React.CSSProperties => ({
    padding: '3px 7px', borderRadius: 4, border: `1px solid ${C.border}`,
    background: active ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? C.primary : C.mid, fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit',
  })

  return (
    <div style={{ border: `1px solid ${C.borderl}`, borderRadius: 8, overflow: 'visible' }}>
      {/* Toolbar */}
      <div style={toolbar}>
        <button style={btn()} onMouseDown={e=>{e.preventDefault();exec('bold')}} title="Gras"><strong>B</strong></button>
        <button style={btn()} onMouseDown={e=>{e.preventDefault();exec('italic')}} title="Italique"><em>I</em></button>
        <button style={btn()} onMouseDown={e=>{e.preventDefault();exec('underline')}} title="Souligné"><u>S</u></button>
        <div style={{ width: 1, background: C.border, margin: '2px 2px' }} />
        {/* Couleur texte */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <input type="color" defaultValue="#1A1A1A"
            onChange={e => { exec('foreColor', e.target.value) }}
            style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 4 }}
            title="Couleur du texte"
          />
        </div>
        {/* Taille de police */}
        <select style={{ ...btn(), padding: '3px 5px' }} defaultValue="3"
          onChange={e => exec('fontSize', e.target.value)} title="Taille">
          {[['1','8pt'],['2','10pt'],['3','12pt'],['4','14pt'],['5','18pt'],['6','24pt']].map(([v,l]) =>
            <option key={v} value={v}>{l}</option>
          )}
        </select>
        <div style={{ width: 1, background: C.border, margin: '2px 2px' }} />
        <button style={btn()} onMouseDown={e=>{e.preventDefault();exec('removeFormat')}} title="Effacer la mise en forme" >✕ Style</button>
        {/* Variables */}
        {vars.length > 0 && (
          <button style={{ ...btn(showVars), marginLeft: 4 }} onMouseDown={e=>{e.preventDefault();setShowVars(v=>!v)}}>
            {'{ }'} Variables
          </button>
        )}
      </div>

      {/* Variables dropdown */}
      {showVars && vars.length > 0 && (
        <div style={{ padding: '8px 10px', background: '#1A1A1E', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {vars.map(v => {
            const meta = ALL_VARIABLES.find(x => x.key === v)
            return (
              <button key={v}
                onMouseDown={e => { e.preventDefault(); insertVar(v) }}
                title={meta ? `Exemple : ${meta.example}` : v}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', color: '#93C5FD', border: '1px solid rgba(96,165,250,0.2)', fontFamily: 'monospace', cursor: 'pointer' }}>
                {v}
              </button>
            )
          })}
          <span style={{ fontSize: 11, color: C.dim, alignSelf: 'center' }}>← cliquer pour insérer</span>
        </div>
      )}

      {/* Zone éditable — pas de dangerouslySetInnerHTML, géré par useEffect */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholder}
        style={{
          minHeight: 100, padding: '10px 12px',
          color: '#1A1A1A', fontSize: 13, lineHeight: 1.65, outline: 'none',
          background: '#fff', borderRadius: '0 0 6px 6px',
          fontFamily: 'Arial, sans-serif',
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT ITEM DE SECTION (drag + toggle + éditeur)
// ─────────────────────────────────────────────────────────────────────────────

interface SectionItemProps {
  section:   TemplateSection
  index:     number
  expanded:  boolean
  onToggle:  () => void
  onChange:  (patch: Partial<TemplateSection>) => void
  onDelete?: () => void
  onDragStart: (i: number) => void
  onDragOver:  (i: number) => void
  onDrop:      () => void
}

function SectionItem({
  section, index, expanded, onToggle, onChange, onDelete,
  onDragStart, onDragOver, onDrop,
}: SectionItemProps) {
  const [editTitle, setEditTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(section.title)
  const [showTitleFmt, setShowTitleFmt] = useState(false)
  const meta = section.type === 'fixed' ? SECTION_META[section.id] : null
  const vars = meta?.vars ?? ALL_VARIABLES.map(v => v.key)

  const titleStyle: React.CSSProperties = {
    color:          section.titleColor,
    fontSize:       section.titleSize + 1,
    fontWeight:     section.titleBold      ? 700 : 400,
    textDecoration: section.titleUnderline ? 'underline' : 'none',
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      style={{
        background: C.card2, borderRadius: 8,
        border: `1px solid ${expanded ? C.primary + '40' : C.border}`,
        marginBottom: 6, transition: 'border-color 0.15s',
        opacity: section.enabled ? 1 : 0.45,
      }}>

      {/* ── En-tête de section ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'pointer' }}
        onClick={onToggle}>
        {/* Drag handle */}
        <span style={{ color: C.dim, fontSize: 14, cursor: 'grab', flexShrink: 0, userSelect: 'none' }}
          onMouseDown={e => e.stopPropagation()}>⠿</span>

        {/* Toggle */}
        <button
          onClick={e => { e.stopPropagation(); onChange({ enabled: !section.enabled }) }}
          title={section.enabled ? 'Désactiver la section' : 'Activer la section'}
          style={{
            width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: section.enabled ? C.primary : C.dim, position: 'relative', transition: 'background 0.2s',
          }}>
          <span style={{
            position: 'absolute', top: 2, left: section.enabled ? 15 : 2, width: 14, height: 14,
            borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>

        {/* Titre */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editTitle ? (
            <input
              autoFocus value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => { onChange({ title: titleDraft }); setEditTitle(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { onChange({ title: titleDraft }); setEditTitle(false) }; if (e.key === 'Escape') { setTitleDraft(section.title); setEditTitle(false) } }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.primary}`, borderRadius: 4, color: C.text, fontSize: 13, padding: '2px 6px' }}
            />
          ) : (
            <span style={{ fontSize: 13, color: section.showTitle ? section.titleColor : C.mid, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {section.title}
              {!section.showTitle && <span style={{ fontSize: 10, color: C.dim, marginLeft: 6, fontWeight: 400 }}>(sans titre)</span>}
              {section.type === 'custom' && <span style={{ fontSize: 10, color: C.gold, marginLeft: 6, background: 'rgba(217,119,6,0.12)', padding: '1px 5px', borderRadius: 3 }}>custom</span>}
            </span>
          )}
          {meta?.conditional && (
            <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>⚡ {meta.conditional}</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button title="Renommer" onClick={() => setEditTitle(true)}
            style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.dim, fontSize: 11, cursor: 'pointer' }}>
            ✎
          </button>
          {onDelete && (
            <button title="Supprimer" onClick={() => { if (confirm('Supprimer cette section ?')) onDelete() }}
              style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid rgba(239,68,68,0.25)`, background: 'rgba(239,68,68,0.05)', color: C.danger, fontSize: 11, cursor: 'pointer' }}>
              ✕
            </button>
          )}
          <span style={{ color: C.dim, fontSize: 12, alignSelf: 'center', paddingLeft: 2 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* ── Corps expansible ── */}
      {expanded && (
        <div style={{ padding: '0 10px 12px', borderTop: `1px solid ${C.border}` }}>

          {/* Formatage du titre */}
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>En-tête de section :</span>
              {/* Show/hide title toggle */}
              <button onClick={() => onChange({ showTitle: !section.showTitle })}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: section.showTitle ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.03)', color: section.showTitle ? C.primary : C.dim, cursor: 'pointer' }}>
                {section.showTitle ? '✓ Titre visible' : 'Titre masqué'}
              </button>
              {section.showTitle && (
                <button onClick={() => setShowTitleFmt(v => !v)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.mid, cursor: 'pointer' }}>
                  Formater le titre
                </button>
              )}
            </div>

            {section.showTitle && showTitleFmt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: C.card, borderRadius: 6, flexWrap: 'wrap' }}>
                {/* Palette couleurs */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {TITLE_PALETTE.map(col => (
                    <button key={col} onClick={() => onChange({ titleColor: col })}
                      style={{ width: 18, height: 18, borderRadius: 3, border: section.titleColor === col ? '2px solid #fff' : '2px solid transparent', background: col, cursor: 'pointer', padding: 0 }}
                    />
                  ))}
                  <input type="color" value={'#' + section.titleColor.replace('#','')}
                    onChange={e => onChange({ titleColor: e.target.value })}
                    style={{ width: 18, height: 18, padding: 0, border: 'none', borderRadius: 3, cursor: 'pointer' }}
                    title="Couleur personnalisée"
                  />
                </div>
                <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
                {/* Taille */}
                <select value={section.titleSize}
                  onChange={e => onChange({ titleSize: Number(e.target.value) })}
                  style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11, padding: '2px 4px' }}>
                  {[10,11,12,13,14,16,18,20,24].map(s => <option key={s} value={s}>{s}pt</option>)}
                </select>
                {/* Bold */}
                <button onClick={() => onChange({ titleBold: !section.titleBold })}
                  style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${C.border}`, background: section.titleBold ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.04)', color: section.titleBold ? C.primary : C.mid, fontWeight: 700, cursor: 'pointer' }}>
                  G
                </button>
                {/* Underline */}
                <button onClick={() => onChange({ titleUnderline: !section.titleUnderline })}
                  style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${C.border}`, background: section.titleUnderline ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.04)', color: section.titleUnderline ? C.primary : C.mid, textDecoration: 'underline', cursor: 'pointer' }}>
                  S
                </button>
                {/* Aperçu titre */}
                <div style={{ ...titleStyle, marginLeft: 8, padding: '2px 0', borderLeft: `3px solid ${section.titleColor}`, paddingLeft: 8 }}>
                  {section.title}
                </div>
              </div>
            )}
          </div>

          {/* Éditeur corps */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                Corps du texte {section.bodyHtml === null ? <span style={{ color: C.dim }}>(texte par défaut utilisé)</span> : <span style={{ color: C.primary }}>• personnalisé</span>}
              </span>
              {section.bodyHtml !== null && (
                <button onClick={() => onChange({ bodyHtml: null })}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid rgba(239,68,68,0.25)`, background: 'rgba(239,68,68,0.05)', color: C.danger, cursor: 'pointer' }}>
                  Réinitialiser au défaut
                </button>
              )}
            </div>
            <RichEditor
              value={section.bodyHtml ?? ''}
              onChange={html => onChange({ bodyHtml: html || null })}
              placeholder={meta ? meta.description : 'Saisissez le texte de cette section…'}
              vars={vars}
            />
            {section.bodyHtml === null && meta && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.dim }}>
                💡 {meta.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'sections' | 'logo' | 'preview'

export default function TemplatesPage() {
  // ── États globaux ─────────────────────────────────────────────────────────
  const [templates,   setTemplates]   = useState<TemplateV2[]>([])
  const [activeId,    setActiveId]    = useState<string | null>(null)
  const [draft,       setDraft]       = useState<TemplateV2 | null>(null)
  const [saved,       setSaved]       = useState<TemplateV2 | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saveOk,      setSaveOk]      = useState(false)
  const [saveErr,     setSaveErr]     = useState('')
  const [creating,    setCreating]    = useState(false)
  const [tab,         setTab]         = useState<Tab>('sections')
  const [previewDpe,  setPreviewDpe]  = useState('F')
  const [expandedSec, setExpandedSec] = useState<string | null>(null)

  // Drag-drop state
  const dragIdx = useRef<number>(-1)
  const overIdx = useRef<number>(-1)

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/courriers/template')
      .then(r => r.json())
      .then(d => {
        const list: TemplateV2[] = d.templates ?? []
        setTemplates(list)
        const def = list.find(t => t.is_default) ?? list[0] ?? null
        if (def) { setActiveId(def.id); setSaved(def); setDraft(hydrate(def)) }
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Hydrate sections_config avec les defaults ─────────────────────────────
  function hydrate(t: TemplateV2): TemplateV2 {
    return { ...t, sections_config: getEffectiveSections(t) }
  }

  // ── Changer de template actif ─────────────────────────────────────────────
  const switchTemplate = (id: string) => {
    const t = templates.find(x => x.id === id)
    if (!t) return
    setActiveId(id)
    setSaved(t)
    setDraft(hydrate(t))
    setExpandedSec(null)
    setTab('sections')
    setSaveOk(false)
    setSaveErr('')
  }

  // ── Créer un nouveau template ──────────────────────────────────────────────
  const createTemplate = async () => {
    const name = prompt('Nom du nouveau template :')
    if (!name) return
    setCreating(true)
    try {
      const r = await fetch('/api/courriers/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error ?? 'Erreur'); return }
      const t: TemplateV2 = d.template
      setTemplates(prev => [...prev, t])
      setActiveId(t.id)
      setSaved(t)
      setDraft(hydrate(t))
      setExpandedSec(null)
    } finally { setCreating(false) }
  }

  // ── Supprimer le template actif ───────────────────────────────────────────
  const deleteTemplate = async () => {
    if (!activeId || !draft) return
    if (!confirm(`Supprimer le template "${draft.name}" ? Cette action est irréversible.`)) return
    await fetch(`/api/courriers/template/${activeId}`, { method: 'DELETE' })
    const remaining = templates.filter(t => t.id !== activeId)
    setTemplates(remaining)
    const next = remaining[0] ?? null
    if (next) { setActiveId(next.id); setSaved(next); setDraft(hydrate(next)) }
    else { setActiveId(null); setSaved(null); setDraft(null) }
  }

  // ── Définir comme défaut ──────────────────────────────────────────────────
  const setAsDefault = async () => {
    if (!activeId || !draft) return
    const patch: Partial<TemplateV2> = { is_default: true }
    const r = await fetch(`/api/courriers/template/${activeId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const d = await r.json()
    if (!r.ok) return
    const updated = d.template as TemplateV2
    setTemplates(prev => prev.map(t => t.id === activeId ? { ...t, is_default: true } : { ...t, is_default: false }))
    setSaved(updated)
    setDraft(prev => prev ? { ...prev, is_default: true } : prev)
  }

  // ── Patcher le draft ──────────────────────────────────────────────────────
  const patchDraft = useCallback((patch: Partial<TemplateV2>) => {
    setDraft(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  // ── Patcher une section ───────────────────────────────────────────────────
  const patchSection = useCallback((idx: number, patch: Partial<TemplateSection>) => {
    setDraft(prev => {
      if (!prev?.sections_config) return prev
      const sections = [...prev.sections_config]
      sections[idx] = { ...sections[idx], ...patch }
      return { ...prev, sections_config: sections }
    })
  }, [])

  // ── Ajouter section custom ────────────────────────────────────────────────
  const addCustomSection = () => {
    const title = prompt('Titre de la nouvelle section :')
    if (!title) return
    const newSec: TemplateSection = {
      id: uid(), type: 'custom', enabled: true,
      title, showTitle: true,
      titleColor: '#009597', titleSize: 14, titleBold: true, titleUnderline: false,
      bodyHtml: '',
    }
    setDraft(prev => {
      if (!prev) return prev
      const sections = [...(prev.sections_config ?? DEFAULT_SECTIONS), newSec]
      return { ...prev, sections_config: sections }
    })
    setExpandedSec(newSec.id)
  }

  // ── Supprimer section custom ──────────────────────────────────────────────
  const deleteSection = (idx: number) => {
    setDraft(prev => {
      if (!prev?.sections_config) return prev
      const sections = prev.sections_config.filter((_, i) => i !== idx)
      return { ...prev, sections_config: sections }
    })
  }

  // ── Drag-drop ─────────────────────────────────────────────────────────────
  const handleDrop = () => {
    const from = dragIdx.current
    const to   = overIdx.current
    if (from === to || from < 0 || to < 0) return
    setDraft(prev => {
      if (!prev?.sections_config) return prev
      const secs = [...prev.sections_config]
      const [moved] = secs.splice(from, 1)
      secs.splice(to, 0, moved)
      return { ...prev, sections_config: secs }
    })
    dragIdx.current = -1
    overIdx.current = -1
  }

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!draft || !activeId) return
    setSaving(true); setSaveOk(false); setSaveErr('')
    try {
      const r = await fetch(`/api/courriers/template/${activeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error ?? 'Erreur'); return }
      const updated = d.template as TemplateV2
      setSaved(updated)
      setDraft(hydrate(updated))
      setTemplates(prev => prev.map(t => t.id === activeId ? updated : t))
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e: any) { setSaveErr(e.message ?? 'Erreur réseau') }
    finally { setSaving(false) }
  }

  // ── Upload logo ───────────────────────────────────────────────────────────
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1_500_000) { alert('Logo trop lourd (max 1,5 Mo)'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result as string
      const mime = file.type
      // Enlever le préfixe data:image/xxx;base64,
      const base64 = data.split(',')[1]
      patchDraft({ logo_data: base64, logo_mime: mime })
    }
    reader.readAsDataURL(file)
  }

  // ── Aperçu lettre ─────────────────────────────────────────────────────────
  const previewData: DpeAdresseData = {
    ...PREVIEW_BASE, dpe_etiquette: previewDpe,
    agent_nom: 'Dupont', agent_prenom: 'Jean',
    agent_agence: draft?.name ?? 'Square Habitat',
  }
  // Génère l'aperçu depuis le template v2 (reflète vraiment les personnalisations)
  const letterHTML = draft
    ? generatePreviewHTMLV2(previewData, draft)
    : generateLetterHTML(previewData, null)

  // ── Changements non sauvegardés ───────────────────────────────────────────
  const hasChanges = draft && saved && JSON.stringify(draft) !== JSON.stringify(hydrate(saved))

  // ── Sections effectives ───────────────────────────────────────────────────
  const sections = draft?.sections_config ?? DEFAULT_SECTIONS

  // ─── Rendu ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', background:C.bg, color:C.muted, fontSize:14 }}>
        Chargement des templates…
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100dvh', background:C.bg, color:C.text, overflow:'hidden' }}>

      {/* ── Sidebar gauche : liste des templates ─────────────────────── */}
      <div style={{ width:200, flexShrink:0, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', background:C.card, overflow:'hidden' }}>

        <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <Link href="/courriers" style={{ textDecoration:'none', fontSize:12, color:C.muted, display:'block', marginBottom:10 }}>
            ← Retour courriers
          </Link>
          <div style={{ fontWeight:700, fontSize:14, color:C.text }}>Templates</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Courriers DPE</div>
        </div>

        <nav style={{ flex:1, overflowY:'auto', padding:'8px 8px' }}>
          {templates.map(t => (
            <button key={t.id} onClick={() => switchTemplate(t.id)}
              style={{
                width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:7,
                border:`1px solid ${activeId===t.id ? C.primary+'40' : 'transparent'}`,
                background: activeId===t.id ? 'rgba(29,158,117,0.10)' : 'transparent',
                color: activeId===t.id ? C.primary : C.mid,
                fontWeight: activeId===t.id ? 600 : 400,
                fontSize:13, cursor:'pointer', marginBottom:2, display:'flex', alignItems:'center', gap:6,
              }}>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</span>
              {t.is_default && <span style={{ fontSize:9, background:'rgba(29,158,117,0.2)', color:C.primary, padding:'1px 5px', borderRadius:3 }}>défaut</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding:'10px 10px', borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
          <button onClick={createTemplate} disabled={creating}
            style={{ width:'100%', padding:'8px', borderRadius:7, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, fontSize:12, cursor:'pointer' }}>
            + Nouveau template
          </button>
        </div>
      </div>

      {/* ── Zone principale ───────────────────────────────────────────── */}
      {!draft ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, color:C.muted }}>
          <div style={{ fontSize:40 }}>📄</div>
          <div>Aucun template. Créez-en un pour commencer.</div>
          <button onClick={createTemplate}
            style={{ padding:'10px 24px', borderRadius:8, border:'none', background:C.primary, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Créer mon premier template
          </button>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {/* ── Barre du haut ── */}
          <div style={{ padding:'10px 20px', borderBottom:`1px solid ${C.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
            {/* Nom du template */}
            <input
              value={draft.name}
              onChange={e => patchDraft({ name: e.target.value })}
              style={{ fontSize:15, fontWeight:700, color:C.text, background:'transparent', border:'none', outline:'none', flex:1, minWidth:0 }}
              placeholder="Nom du template"
            />

            {/* Mode toggle */}
            <div style={{ display:'flex', borderRadius:8, border:`1px solid ${C.border}`, overflow:'hidden', flexShrink:0 }}>
              {(['sections','unique'] as const).map(m => (
                <button key={m} onClick={() => patchDraft({ mode: m })}
                  style={{ padding:'5px 12px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                    background: draft.mode===m ? C.primary : 'transparent',
                    color: draft.mode===m ? '#fff' : C.muted,
                  }}>
                  {m === 'sections' ? 'Sections' : 'Texte unique'}
                </button>
              ))}
            </div>

            {/* Actions */}
            {!draft.is_default && (
              <button onClick={setAsDefault} title="Utiliser ce template par défaut"
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.03)', color:C.mid, fontSize:11, cursor:'pointer', flexShrink:0 }}>
                ☆ Défaut
              </button>
            )}
            {draft.is_default && (
              <span style={{ fontSize:11, color:C.primary, flexShrink:0 }}>★ Défaut</span>
            )}
            <button onClick={deleteTemplate}
              style={{ padding:'5px 10px', borderRadius:7, border:`1px solid rgba(239,68,68,0.25)`, background:'rgba(239,68,68,0.05)', color:C.danger, fontSize:11, cursor:'pointer', flexShrink:0 }}>
              Supprimer
            </button>
            {saveErr && <span style={{ fontSize:12, color:C.danger }}>{saveErr}</span>}
            {saveOk  && <span style={{ fontSize:12, color:C.success }}>✓ Sauvegardé</span>}
            {hasChanges && (
              <button onClick={save} disabled={saving}
                style={{ padding:'7px 18px', borderRadius:8, border:'none', background:saving?C.dim:C.primary, color:'#fff', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', flexShrink:0 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>

          {/* ── Onglets ── */}
          <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${C.border}`, flexShrink:0, padding:'0 20px' }}>
            {([['sections','Sections'],['logo','Logo & Enveloppe'],['preview','Aperçu']] as [Tab,string][]).map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding:'9px 16px', border:'none', borderBottom:`2px solid ${tab===t?C.primary:'transparent'}`, background:'transparent',
                  color:tab===t?C.primary:C.muted, fontSize:13, fontWeight:tab===t?600:400, cursor:'pointer', marginRight:2 }}>
                {l}
              </button>
            ))}
          </div>

          {/* ── Contenu des onglets ── */}
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

            {/* ────────── ONGLET SECTIONS ────────── */}
            {tab === 'sections' && (
              <div style={{ maxWidth:720 }}>

                {/* Mode unique */}
                {draft.mode === 'unique' ? (
                  <div>
                    <div style={{ fontSize:13, color:C.muted, marginBottom:12 }}>
                      En mode <strong style={{ color:C.text }}>Texte unique</strong>, une seule lettre est générée pour tous les DPE, sans sections conditionnelles.
                      Utilisez les variables disponibles pour personnaliser dynamiquement.
                    </div>
                    <div style={{ marginBottom:8, display:'flex', gap:8, flexWrap:'wrap' }}>
                      {ALL_VARIABLES.map(v => (
                        <span key={v.key} title={`Exemple : ${v.example}`}
                          style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'rgba(96,165,250,0.1)', color:'#93C5FD', border:'1px solid rgba(96,165,250,0.2)', fontFamily:'monospace', cursor:'help' }}>
                          {v.key}
                        </span>
                      ))}
                    </div>
                    <RichEditor
                      value={draft.unique_text ?? ''}
                      onChange={html => patchDraft({ unique_text: html || null })}
                      placeholder="Rédigez votre courrier unique ici… Utilisez les variables {typeBien}, {dpe}, etc."
                      vars={ALL_VARIABLES.map(v => v.key)}
                    />
                  </div>
                ) : (
                  /* Mode sections */
                  <div>
                    <div style={{ fontSize:12, color:C.dim, marginBottom:12 }}>
                      Glissez les sections pour les réordonner · Cliquez sur une section pour l'éditer
                    </div>

                    {sections.map((sec, idx) => (
                      <SectionItem key={sec.id}
                        section={sec}
                        index={idx}
                        expanded={expandedSec === sec.id}
                        onToggle={() => setExpandedSec(prev => prev === sec.id ? null : sec.id)}
                        onChange={patch => patchSection(idx, patch)}
                        onDelete={sec.type === 'custom' ? () => deleteSection(idx) : undefined}
                        onDragStart={i => { dragIdx.current = i }}
                        onDragOver={i => { overIdx.current = i }}
                        onDrop={handleDrop}
                      />
                    ))}

                    <button onClick={addCustomSection}
                      style={{ width:'100%', padding:'10px', borderRadius:8, border:`1px dashed ${C.border}`, background:'rgba(255,255,255,0.02)', color:C.muted, fontSize:13, cursor:'pointer', marginTop:4, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      + Ajouter une section personnalisée
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ────────── ONGLET LOGO & ENVELOPPE ────────── */}
            {tab === 'logo' && (
              <div style={{ maxWidth:560 }}>

                {/* Logo */}
                <div style={{ marginBottom:32 }}>
                  <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:4 }}>Logo de l'agence</div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
                    Affiché dans l'en-tête de vos lettres DOCX. PNG ou JPG recommandé, max 1,5 Mo.
                  </div>

                  {draft.logo_data ? (
                    <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
                      <img
                        src={`data:${draft.logo_mime ?? 'image/png'};base64,${draft.logo_data}`}
                        alt="Logo"
                        style={{ maxWidth:180, maxHeight:80, objectFit:'contain', borderRadius:6, background:'#fff', padding:8 }}
                      />
                      <button onClick={() => patchDraft({ logo_data: null, logo_mime: null })}
                        style={{ padding:'6px 12px', borderRadius:6, border:`1px solid rgba(239,68,68,0.3)`, background:'rgba(239,68,68,0.05)', color:C.danger, fontSize:12, cursor:'pointer' }}>
                        Supprimer le logo
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding:'24px', border:`2px dashed ${C.border}`, borderRadius:8, textAlign:'center', marginBottom:12 }}>
                      <div style={{ fontSize:13, color:C.muted, marginBottom:8 }}>Aucun logo — en-tête textuel utilisé</div>
                    </div>
                  )}

                  <label style={{ display:'inline-block', padding:'8px 16px', borderRadius:7, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, fontSize:12, cursor:'pointer' }}>
                    {draft.logo_data ? 'Changer le logo' : 'Choisir un logo'}
                    <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoUpload} />
                  </label>
                </div>

                {/* Enveloppe */}
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                    <div style={{ fontWeight:600, fontSize:14, color:C.text }}>Bloc adresse enveloppe</div>
                    <button onClick={() => patchDraft({ envelope_enabled: !draft.envelope_enabled })}
                      style={{ padding:'3px 10px', borderRadius:5, border:`1px solid ${C.borderl}`, background: draft.envelope_enabled ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.04)', color: draft.envelope_enabled ? C.primary : C.muted, fontSize:11, cursor:'pointer' }}>
                      {draft.envelope_enabled ? '✓ Activé' : 'Désactivé'}
                    </button>
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
                    Insère un pavé d'adresse destinataire en tête de lettre, formaté pour une enveloppe à fenêtre (courrier plié en 3).
                  </div>

                  {draft.envelope_enabled && (
                    <div>
                      <div style={{ marginBottom:8 }}>
                        <label style={{ fontSize:12, color:C.muted, display:'block', marginBottom:4 }}>Ligne 1 (destinataire) :</label>
                        <input
                          value={draft.envelope_line1}
                          onChange={e => patchDraft({ envelope_line1: e.target.value })}
                          style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${C.borderl}`, borderRadius:7, color:C.text, fontSize:13, padding:'8px 12px', boxSizing:'border-box' }}
                          placeholder="Mr et ou Mme le Propriétaire"
                        />
                      </div>
                      <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 16px', fontSize:12, color:C.muted, lineHeight:2.2 }}>
                        <div style={{ color:C.text }}>{draft.envelope_line1}</div>
                        <div style={{ color:C.dim }}>← Adresse du bien (remplie automatiquement)</div>
                        <div style={{ color:C.dim }}>← Code postal + Ville (remplis automatiquement)</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ────────── ONGLET APERÇU ────────── */}
            {tab === 'preview' && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:12, color:C.muted }}>Aperçu avec DPE :</span>
                  {['A','B','C','D','E','F','G'].map(l => (
                    <button key={l} onClick={() => setPreviewDpe(l)}
                      style={{ padding:'3px 10px', borderRadius:5, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                        background: previewDpe===l ? DPE_COLORS[l] : 'rgba(255,255,255,0.08)',
                        color: previewDpe===l ? '#fff' : C.mid,
                      }}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ background:'#fff', borderRadius:10, padding:'32px 40px', boxShadow:'0 4px 24px rgba(0,0,0,0.4)', fontFamily:'Arial, sans-serif', fontSize:13, lineHeight:1.75, color:'#1A1A1A', maxWidth:700 }}
                  dangerouslySetInnerHTML={{ __html: letterHTML }}
                />
              </div>
            )}
          </div>

          {/* ── Barre de sauvegarde bas ── */}
          {hasChanges && (
            <div style={{ padding:'10px 20px', borderTop:`1px solid ${C.border}`, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(29,158,117,0.04)' }}>
              <span style={{ fontSize:12, color:C.primary }}>Modifications non sauvegardées</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { if (saved) setDraft(hydrate(saved)) }}
                  style={{ padding:'7px 14px', borderRadius:7, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, fontSize:13, cursor:'pointer' }}>
                  Annuler
                </button>
                <button onClick={save} disabled={saving}
                  style={{ padding:'7px 18px', borderRadius:8, border:'none', background:saving?C.dim:C.primary, color:'#fff', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
