'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import type { TemplateV2, TemplateSection } from '@/lib/lettres/templateEngine'
import {
  DEFAULT_SECTIONS, SECTION_META, ALL_VARIABLES, getEffectiveSections, parseAddress,
  sectionMatchesCondition, migrateSectionCondition, getSectionConflicts, sectionContentKey,
} from '@/lib/lettres/templateEngine'
import type { SectionCondition } from '@/lib/lettres/templateEngine'
import { getDefaultSectionHtml, generateLetterHTML, getDpeGroup, showGL } from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'
import { generatePreviewHTMLV2 } from '@/lib/lettres/previewV2'

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
// COMPOSANT FLOWCHART (panneau droit onglet Sections)
// ─────────────────────────────────────────────────────────────────────────────

type FlowRow =
  | { kind: 'common';   sec: TemplateSection }
  | { kind: 'branched'; cols: Array<{ key: string; secs: TemplateSection[] }> }

function buildFlow(sections: TemplateSection[]): FlowRow[] {
  const rows: FlowRow[] = []
  let pending: Record<string, TemplateSection[]> = {}
  let hasPending = false

  const flushPending = () => {
    if (!hasPending) return
    rows.push({ kind: 'branched', cols: Object.entries(pending).map(([key, secs]) => ({ key, secs })) })
    pending = {}; hasPending = false
  }

  for (const sec of sections) {
    const dpeKey = sec.condition?.dpe?.length ? [...sec.condition.dpe].sort().join(',') : null
    if (!dpeKey) { flushPending(); rows.push({ kind: 'common', sec }) }
    else { if (!pending[dpeKey]) pending[dpeKey] = []; pending[dpeKey].push(sec); hasPending = true }
  }
  flushPending()
  return rows
}

function SectionFlowchart({
  sections, conflictIds, onFocus,
}: {
  sections: TemplateSection[]; conflictIds: Set<string>; onFocus: (id: string) => void
}) {
  const enabled = sections.filter(s => s.enabled)
  const rows    = buildFlow(enabled)

  const node = (sec: TemplateSection) => {
    const isConfl = conflictIds.has(sec.id)
    const badges: React.ReactNode[] = []
    if (sec.condition?.types?.length) sec.condition.types.forEach(t =>
      badges.push(<span key={t} style={{ fontSize: 8, padding: '0 3px', borderRadius: 3, background: 'rgba(96,165,250,0.15)', color: '#93C5FD' }}>{t === 'appartement' ? 'Appt' : t === 'maison' ? 'Maison' : 'Local'}</span>)
    )
    if (sec.condition?.requireAudit) badges.push(<span key="aud" style={{ fontSize: 8, padding: '0 3px', borderRadius: 3, background: 'rgba(217,119,6,0.15)', color: '#D97706' }}>Audit</span>)
    if (sec.image_enabled)           badges.push(<span key="img" style={{ fontSize: 8 }}>🖼</span>)
    return (
      <div key={sec.id} onClick={() => onFocus(sec.id)}
        title={isConfl ? '⚠ Conflit — cliquer pour ouvrir' : 'Cliquer pour ouvrir la section'}
        style={{ padding: '4px 8px', borderRadius: 5, marginBottom: 3, cursor: 'pointer', fontSize: 10,
          border: `1px solid ${isConfl ? 'rgba(239,68,68,0.5)' : C.border}`,
          background: isConfl ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.04)',
          color: isConfl ? '#FCA5A5' : C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
            {isConfl && <span style={{ color: '#EF4444', marginRight: 3 }}>⚠</span>}{sec.title}
          </span>
          {badges}
        </div>
      </div>
    )
  }

  const arrow = <div style={{ textAlign: 'center', color: C.dim, fontSize: 9, margin: '1px 0', lineHeight: 1 }}>▼</div>

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: C.mid, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
        Structure du courrier
      </div>
      <div style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(29,158,117,0.15)', border: `1px solid ${C.primary}40`, color: C.primary, fontSize: 9, fontWeight: 700, textAlign: 'center', marginBottom: 2 }}>
        ▶ DÉBUT
      </div>
      {rows.map((row, i) => (
        <div key={i}>
          {arrow}
          {row.kind === 'common' ? node(row.sec) : (
            <div style={{ display: 'flex', gap: 3 }}>
              {row.cols.map(col => (
                <div key={col.key} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 8, color: C.dim, textAlign: 'center', marginBottom: 2, padding: '1px 3px', background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    DPE {col.key}
                  </div>
                  {col.secs.map(s => node(s))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {arrow}
      <div style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.dim, fontSize: 9, fontWeight: 700, textAlign: 'center' }}>
        ■ FIN
      </div>
      {conflictIds.size > 0 && (
        <div style={{ marginTop: 10, fontSize: 10, color: '#FCA5A5', padding: '5px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 5 }}>
          ⚠ {conflictIds.size} bloc(s) en conflit — exclus du DOCX
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT ITEM DE SECTION (drag + toggle + éditeur)
// ─────────────────────────────────────────────────────────────────────────────

interface SectionItemProps {
  section:     TemplateSection
  index:       number
  expanded:    boolean
  isConflict?: boolean
  onToggle:    () => void
  onChange:    (patch: Partial<TemplateSection>) => void
  onDelete?:   () => void
  onDuplicate: () => void
  onDragStart: (i: number) => void
  onDragOver:  (i: number) => void
  onDrop:      () => void
}

const DPE_COLORS_SEC: Record<string, string> = {
  A:'#319834', B:'#51A351', C:'#B0CC30', D:'#F0D30A',
  E:'#F0A500', F:'#E06029', G:'#CC1016',
}

function SectionItem({
  section, index, expanded, isConflict, onToggle, onChange, onDelete, onDuplicate,
  onDragStart, onDragOver, onDrop,
}: SectionItemProps) {
  const [editTitle,       setEditTitle]       = useState(false)
  const [titleDraft,      setTitleDraft]       = useState(section.title)
  const [showTitleFmt,    setShowTitleFmt]     = useState(false)
  const [showConditions,  setShowConditions]   = useState(false)
  const [prefillType,     setPrefillType]      = useState<'appartement'|'maison'>('appartement')
  const effectiveId = section.fixedId ?? section.id  // UUID pour les copies, id natif pour les originaux
  const meta = section.type === 'fixed' ? SECTION_META[effectiveId] : null
  const vars = ALL_VARIABLES.map(v => v.key)

  // ── Gestion des conditions ───────────────────────────────────────────────
  const cond = section.condition ?? {}

  const applyCondition = (next: SectionCondition) => {
    const hasAny = (next.dpe?.length ?? 0) > 0 || (next.types?.length ?? 0) > 0 || !!next.requireAudit
    onChange({ condition: hasAny ? next : undefined })
  }
  const toggleDpe = (l: string) => {
    const cur  = cond.dpe ?? []
    const next = cur.includes(l) ? cur.filter(x => x !== l) : [...cur, l]
    applyCondition({ ...cond, dpe: next.length ? next : undefined })
  }
  const toggleType = (t: string) => {
    const cur  = cond.types ?? []
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]
    applyCondition({ ...cond, types: next.length ? next : undefined })
  }
  const condSummary = (() => {
    const parts: string[] = []
    if (cond.dpe?.length)   parts.push('DPE ' + cond.dpe.join(''))
    if (cond.types?.length) parts.push(cond.types.map(t => t === 'appartement' ? 'Appt' : t === 'maison' ? 'Maison' : 'Local').join('+'))
    if (cond.requireAudit)  parts.push('Audit')
    return parts.join(' · ')
  })()

  // ── Pré-remplissage du texte par défaut ──────────────────────────────────
  const loadDefault = (dpe: string) => {
    const html = getDefaultSectionHtml(effectiveId, dpe, prefillType)
    if (html !== null) onChange({ bodyHtml: html })
  }

  // ── Upload image dans le bloc ─────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) { alert('Image trop lourde (max 2 Mo)'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => onChange({
        image_data: dataUrl.split(',')[1],
        image_mime: file.type,
        image_natural_width:  img.naturalWidth,
        image_natural_height: img.naturalHeight,
      })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const titleStyle: React.CSSProperties = {
    color:          section.titleColor,
    fontSize:       section.titleSize + 1,
    fontWeight:     section.titleBold      ? 700 : 400,
    textDecoration: section.titleUnderline ? 'underline' : 'none',
  }

  return (
    <div
      id={section.id}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      style={{
        background: isConflict ? 'rgba(239,68,68,0.05)' : C.card2,
        borderRadius: 8,
        border: `1px solid ${isConflict ? 'rgba(239,68,68,0.5)' : expanded ? C.primary + '40' : C.border}`,
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
              {condSummary && <span style={{ fontSize: 9, color: '#93C5FD', marginLeft: 6, background: 'rgba(96,165,250,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>{condSummary}</span>}
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
          <button title="Dupliquer ce bloc" onClick={onDuplicate}
            style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.dim, fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>
            ⧉
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

          {/* Bandeau conflit */}
          {isConflict && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.danger, marginBottom: 2 }}>
                  Conflit de scénario détecté
                </div>
                <div style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.5 }}>
                  Un autre bloc de même type a des conditions identiques.
                  Ces blocs en conflit <strong>ne seront pas inclus dans le DOCX</strong> tant que leurs conditions ne sont pas différenciées.
                  Modifiez les conditions ci-dessous pour résoudre le conflit.
                </div>
              </div>
            </div>
          )}

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

          {/* ── Conditions d'affichage ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showConditions ? 6 : 0 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Conditions d'affichage :</span>
              {condSummary
                ? <span style={{ fontSize: 10, color: '#93C5FD', background: 'rgba(96,165,250,0.12)', padding: '1px 6px', borderRadius: 3 }}>{condSummary}</span>
                : <span style={{ fontSize: 10, color: C.dim }}>toujours affiché</span>
              }
              <span
                title="Si des conditions sont cochées, ce bloc ne s'affiche que lorsque TOUTES les conditions sont remplies (logique ET). Sans condition cochée, le bloc s'affiche systématiquement."
                style={{ fontSize: 13, cursor: 'help', color: C.dim, lineHeight: 1 }}>ⓘ</span>
              <button onClick={() => setShowConditions(v => !v)}
                style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.dim, cursor: 'pointer', marginLeft: 'auto' }}>
                {showConditions ? '▲ Masquer' : '▼ Configurer'}
              </button>
            </div>

            {showConditions && (
              <div style={{ background: C.card, borderRadius: 7, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                {/* DPE */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>
                    Note DPE <span style={{ color: C.dim }}>(aucune case = toutes les notes)</span> :
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {['A','B','C','D','E','F','G'].map(l => (
                      <button key={l} onClick={() => toggleDpe(l)}
                        style={{ padding: '3px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 700,
                          background: cond.dpe?.includes(l) ? DPE_COLORS_SEC[l] : 'rgba(255,255,255,0.08)',
                          color: cond.dpe?.includes(l) ? '#fff' : C.mid,
                          opacity: cond.dpe?.includes(l) ? 1 : 0.7 }}>
                        {l}
                      </button>
                    ))}
                    {!!cond.dpe?.length && (
                      <button onClick={() => applyCondition({ ...cond, dpe: undefined })}
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, cursor: 'pointer' }}>
                        ✕ tout décocher
                      </button>
                    )}
                  </div>
                </div>

                {/* Type de bien */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>
                    Type de bien <span style={{ color: C.dim }}>(aucune case = tous)</span> :
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[['appartement','Appartement'],['maison','Maison'],['local commercial','Local commercial']].map(([v, l]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: C.mid }}>
                        <input type="checkbox"
                          checked={!!(cond.types?.includes(v))}
                          onChange={() => toggleType(v)}
                          style={{ accentColor: C.primary, cursor: 'pointer' }}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Audit */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.mid }}>
                    <input type="checkbox"
                      checked={!!cond.requireAudit}
                      onChange={e => applyCondition({ ...cond, requireAudit: e.target.checked || undefined })}
                      style={{ accentColor: C.primary, cursor: 'pointer' }}
                    />
                    Uniquement si un audit énergétique est présent
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* ── Éditeur corps ── */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                Corps du texte {section.bodyHtml === null
                  ? <span style={{ color: C.dim }}>(texte auto selon DPE)</span>
                  : <span style={{ color: C.primary }}>• personnalisé</span>}
              </span>
              {section.bodyHtml !== null && (
                <button onClick={() => onChange({ bodyHtml: null })}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid rgba(239,68,68,0.25)`, background: 'rgba(239,68,68,0.05)', color: C.danger, cursor: 'pointer' }}>
                  Réinitialiser au défaut
                </button>
              )}
            </div>

            {/* ── Pré-remplissage depuis le texte par défaut ── */}
            {meta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, padding: '6px 10px', background: C.card, borderRadius: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>Charger le texte par défaut pour DPE :</span>
                {['A','B','C','D','E','F','G'].map(l => (
                  <button key={l} onClick={() => loadDefault(l)}
                    style={{ padding: '2px 7px', borderRadius: 3, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, background: DPE_COLORS_SEC[l], color: '#fff' }}>
                    {l}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: C.dim }}>pour</span>
                {(['appartement','maison'] as const).map(t => (
                  <button key={t} onClick={() => setPrefillType(t)}
                    style={{ padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                      border: `1px solid ${prefillType===t ? C.primary : C.border}`,
                      background: prefillType===t ? 'rgba(29,158,117,0.1)' : 'transparent',
                      color: prefillType===t ? C.primary : C.dim, fontWeight: prefillType===t ? 600 : 400 }}>
                    {t === 'appartement' ? 'Appt' : 'Maison'}
                  </button>
                ))}
              </div>
            )}

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

          {/* ── Image dans le bloc ── */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.mid }}>
              <input type="checkbox" checked={!!section.image_enabled}
                onChange={e => onChange({ image_enabled: e.target.checked })}
                style={{ accentColor: C.primary, cursor: 'pointer' }} />
              Inclure une image dans ce bloc
            </label>

            {section.image_enabled && (
              <div style={{ marginTop: 10 }}>
                {/* Upload / aperçu */}
                {section.image_data ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <img src={`data:${section.image_mime ?? 'image/png'};base64,${section.image_data}`}
                      style={{ maxWidth: 80, maxHeight: 60, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 4 }} alt="Aperçu" />
                    <button onClick={() => onChange({ image_data: null, image_mime: null })}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.05)', color: C.danger, cursor: 'pointer' }}>
                      Supprimer
                    </button>
                    <label style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.borderl}`, background: 'rgba(255,255,255,0.04)', color: C.mid, cursor: 'pointer' }}>
                      Changer
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                    </label>
                  </div>
                ) : (
                  <label style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.borderl}`, background: 'rgba(255,255,255,0.04)', color: C.mid, fontSize: 11, cursor: 'pointer', marginBottom: 10 }}>
                    Choisir une image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                  </label>
                )}

                {/* Position */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Position :</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['left','right','fullwidth'] as const).map(pos => {
                      const labels: Record<string,string> = { left:'◧ Gauche', right:'◨ Droite', fullwidth:'▬ Pleine largeur' }
                      const active = (section.image_position ?? 'left') === pos
                      return (
                        <button key={pos} onClick={() => onChange({ image_position: pos })}
                          style={{ padding: '3px 9px', borderRadius: 4, border: `1px solid ${active ? C.primary : C.border}`,
                            background: active ? 'rgba(29,158,117,0.1)' : 'transparent',
                            color: active ? C.primary : C.muted, fontSize: 11, cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
                          {labels[pos]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Alignement vertical + Slider largeur (2 colonnes seulement) */}
                {(section.image_position ?? 'left') !== 'fullwidth' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Alignement vertical de l'image :</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['top', 'middle', 'bottom'] as const).map(va => {
                          const vaLabels: Record<string, string> = { top: '↑ Haut', middle: '↕ Centre', bottom: '↓ Bas' }
                          const active = (section.image_valign ?? 'top') === va
                          return (
                            <button key={va} onClick={() => onChange({ image_valign: va })}
                              style={{ padding: '3px 9px', borderRadius: 4,
                                border: `1px solid ${active ? C.primary : C.border}`,
                                background: active ? 'rgba(29,158,117,0.1)' : 'transparent',
                                color: active ? C.primary : C.muted,
                                fontSize: 11, cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
                              {vaLabels[va]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                        Largeur image : <strong style={{ color: C.text }}>{section.image_width_pct ?? 35}%</strong>
                        <span style={{ color: C.dim }}> · texte : {100 - (section.image_width_pct ?? 35)}%</span>
                      </div>
                      <input type="range" min={20} max={70} step={5}
                        value={section.image_width_pct ?? 35}
                        onChange={e => onChange({ image_width_pct: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: C.primary }} />
                    </div>
                  </div>
                )}
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

type Tab = 'sections' | 'logo' | 'entete' | 'preview'

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
  const [previewDpe,       setPreviewDpe]       = useState('F')
  const [previewWithAudit, setPreviewWithAudit] = useState(false)
  const [previewType,      setPreviewType]      = useState<'appartement'|'maison'>('appartement')
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

  // ── Hydrate sections_config + migration conditions ────────────────────────
  function hydrate(t: TemplateV2): TemplateV2 {
    const sections = getEffectiveSections(t).map(migrateSectionCondition)
    return { ...t, sections_config: sections }
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

  // ── Dupliquer un template ─────────────────────────────────────────────────
  const duplicateTemplate = async (t: TemplateV2) => {
    try {
      const r = await fetch('/api/courriers/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             t.name + ' (copie)',
          mode:             t.mode,
          unique_text:      t.unique_text,
          logo_data:        t.logo_data,
          logo_mime:        t.logo_mime,
          logo_width:       t.logo_width,
          logo_height:      t.logo_height,
          logo_scale_pct:   t.logo_scale_pct,
          logo_position:    t.logo_position,
          sections_config:  t.sections_config,
          envelope_enabled: t.envelope_enabled,
          envelope_line1:   t.envelope_line1,
          envelope_line2:   t.envelope_line2,
        }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error ?? 'Erreur lors de la duplication'); return }
      const newT = d.template as TemplateV2
      setTemplates(prev => [...prev, newT])
      setActiveId(newT.id); setSaved(newT); setDraft(hydrate(newT))
      setExpandedSec(null); setTab('sections')
    } catch { alert('Erreur réseau') }
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

  // ── Créer depuis le modèle Nadège ─────────────────────────────────────────
  const createFromNadege = async () => {
    const name = prompt('Nom du template :', 'Template Nadège')
    if (!name) return
    setCreating(true)
    try {
      const r = await fetch('/api/courriers/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, preset: 'nadege' }),
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

  // ── Dupliquer une section ─────────────────────────────────────────────────
  const duplicateSection = (idx: number) => {
    setDraft(prev => {
      if (!prev?.sections_config) return prev
      const secs = [...prev.sections_config]
      const orig = secs[idx]
      const copy: typeof orig = {
        ...orig,
        id: crypto.randomUUID(),
        // Pour les sections fixes : mémoriser le type d'origine dans fixedId
        fixedId: orig.type === 'fixed' ? (orig.fixedId ?? orig.id) : undefined,
        title: orig.title,
      }
      secs.splice(idx + 1, 0, copy)
      return { ...prev, sections_config: secs }
    })
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
      const dataUrl = reader.result as string
      const mime = file.type
      const base64 = dataUrl.split(',')[1]
      // Mesure les dimensions naturelles pour le slider 100 %
      const img = new Image()
      img.onload = () => {
        // Taille de référence capped à 120×80 pour éviter les logos géants en DOCX
        const maxW = 120, maxH = 80
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
        const natW = Math.round(img.naturalWidth  * ratio)
        const natH = Math.round(img.naturalHeight * ratio)
        patchDraft({ logo_data: base64, logo_mime: mime, logo_width: natW, logo_height: natH, logo_scale_pct: 100 })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // ── Aperçu lettre ─────────────────────────────────────────────────────────
  const PREVIEW_AUDIT = previewWithAudit ? {
    audit: {
      n_audit: 'AUDIT-2024-001234',
      date_audit: '15/03/2024',
      scenarios: [
        { categorie: 'Scénario 1 — Isolation seule',     classe_apres: 'D', cout_travaux: 18000, gain_pct: 35 },
        { categorie: 'Scénario 2 — Rénovation partielle', classe_apres: 'C', cout_travaux: 32000, gain_pct: 55 },
        { categorie: 'Scénario 3 — Rénovation globale',  classe_apres: 'B', cout_travaux: 55000, gain_pct: 72 },
      ],
    },
  } : {}

  const previewData: DpeAdresseData = {
    ...PREVIEW_BASE, ...PREVIEW_AUDIT, dpe_etiquette: previewDpe,
    type_bien: previewType,
    agent_nom: 'Dupont', agent_prenom: 'Jean',
    agent_titre:     'Conseillère Immobilier',
    agent_agence:    'Square Habitat',
    agent_telephone: '05 56 00 00 00',
    agent_email:     'contact@squarehabitat.fr',
  }
  // Génère l'aperçu depuis le template v2 (reflète vraiment les personnalisations)
  const letterHTML = draft
    ? generatePreviewHTMLV2(previewData, draft)
    : generateLetterHTML(previewData, null)

  // ── Changements non sauvegardés ───────────────────────────────────────────
  const hasChanges = draft && saved && JSON.stringify(draft) !== JSON.stringify(hydrate(saved))

  // ── Sections effectives + détection conflits ─────────────────────────────
  const sections    = draft?.sections_config ?? DEFAULT_SECTIONS
  const conflictIds = useMemo(() => getSectionConflicts(sections), [sections])

  // ── Focaliser une section depuis le flowchart ─────────────────────────────
  const focusSection = (id: string) => {
    setExpandedSec(id)
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

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
            <div key={t.id} style={{ position:'relative', marginBottom:2 }}>
              <button onClick={() => switchTemplate(t.id)}
                title={t.updated_at ? `Modifié le ${new Date(t.updated_at).toLocaleDateString('fr-FR')}` : undefined}
                style={{
                  width:'100%', textAlign:'left', padding:'7px 30px 7px 8px', borderRadius:7,
                  border:`1px solid ${activeId===t.id ? C.primary+'40' : 'transparent'}`,
                  background: activeId===t.id ? 'rgba(29,158,117,0.10)' : 'transparent',
                  color: activeId===t.id ? C.primary : C.mid,
                  fontWeight: activeId===t.id ? 600 : 400,
                  fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5,
                }}>
                {/* Badge mode */}
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 4px', borderRadius:3, flexShrink:0,
                  background: t.mode==='unique' ? 'rgba(217,119,6,0.15)' : 'rgba(96,165,250,0.12)',
                  color: t.mode==='unique' ? C.gold : '#93C5FD' }}>
                  {t.mode==='unique' ? 'T' : 'S'}
                </span>
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</span>
                {t.is_default && <span style={{ fontSize:9, background:'rgba(29,158,117,0.2)', color:C.primary, padding:'1px 5px', borderRadius:3, flexShrink:0 }}>défaut</span>}
              </button>
              {/* Bouton dupliquer */}
              <button onClick={e => { e.stopPropagation(); duplicateTemplate(t) }}
                title="Dupliquer ce template"
                style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)',
                  padding:'1px 5px', borderRadius:4, border:`1px solid ${C.border}`,
                  background:'rgba(255,255,255,0.04)', color:C.dim, fontSize:12, cursor:'pointer', lineHeight:1.4 }}>
                ⧉
              </button>
            </div>
          ))}
        </nav>

        <div style={{ padding:'10px 10px', borderTop:`1px solid ${C.border}`, flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>
          <button onClick={createTemplate} disabled={creating}
            style={{ width:'100%', padding:'8px', borderRadius:7, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, fontSize:12, cursor:'pointer' }}>
            + Nouveau template
          </button>
          <button onClick={createFromNadege} disabled={creating}
            title="Crée un template pré-rempli avec le modèle Nadège (texte unique avec variables)"
            style={{ width:'100%', padding:'8px', borderRadius:7, border:`1px solid rgba(217,119,6,0.3)`, background:'rgba(217,119,6,0.07)', color:C.gold, fontSize:11, cursor:'pointer' }}>
            ✦ Modèle Nadège
          </button>
        </div>
      </div>

      {/* ── Zone principale ───────────────────────────────────────────── */}
      {!draft ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, color:C.muted }}>
          <div style={{ fontSize:40 }}>📄</div>
          <div>Aucun template. Créez-en un pour commencer.</div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={createTemplate}
              style={{ padding:'10px 24px', borderRadius:8, border:'none', background:C.primary, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
              Créer un template vide
            </button>
            <button onClick={createFromNadege}
              style={{ padding:'10px 24px', borderRadius:8, border:`1px solid rgba(217,119,6,0.4)`, background:'rgba(217,119,6,0.1)', color:C.gold, fontSize:14, fontWeight:600, cursor:'pointer' }}>
              ✦ Démarrer avec le modèle Nadège
            </button>
          </div>
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
            {([['sections','Sections'],['logo','Logo & Enveloppe'],['entete','En-tête / Pied de page'],['preview','Aperçu']] as [Tab,string][]).map(([t,l]) => (
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
              <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

                {/* ── Éditeur sections ─────────────────────────────── */}
                <div style={{ flex:1, minWidth:0 }}>
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

                      {/* ── Image en mode Texte unique ── */}
                      <div style={{ marginTop:16, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                        <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:C.mid }}>
                          <input type="checkbox" checked={!!(draft.unique_image?.data)}
                            onChange={e => {
                              if (!e.target.checked) patchDraft({ unique_image: null })
                            }}
                            style={{ accentColor:C.primary, cursor:'pointer' }} />
                          Inclure une image dans cette lettre
                        </label>

                        {draft.unique_image?.data ? (
                          <div style={{ marginTop:10 }}>
                            {/* Aperçu + actions */}
                            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                              <img src={`data:${draft.unique_image.mime ?? 'image/png'};base64,${draft.unique_image.data}`}
                                style={{ maxWidth:80, maxHeight:60, objectFit:'contain', background:'#fff', borderRadius:4, padding:4 }} alt="Aperçu" />
                              <button onClick={() => patchDraft({ unique_image: null })}
                                style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:`1px solid rgba(239,68,68,0.3)`, background:'rgba(239,68,68,0.05)', color:C.danger, cursor:'pointer' }}>
                                Supprimer
                              </button>
                              <label style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, cursor:'pointer' }}>
                                Changer
                                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  if (file.size > 2_000_000) { alert('Image trop lourde (max 2 Mo)'); return }
                                  const reader = new FileReader()
                                  reader.onload = () => {
                                    const dataUrl = reader.result as string
                                    const img = new Image()
                                    img.onload = () => patchDraft({ unique_image: {
                                      ...draft.unique_image,
                                      data: dataUrl.split(',')[1], mime: file.type,
                                      natural_width: img.naturalWidth, natural_height: img.naturalHeight,
                                    }})
                                    img.src = dataUrl
                                  }
                                  reader.readAsDataURL(file)
                                }} />
                              </label>
                            </div>

                            {/* Position */}
                            <div style={{ marginBottom:8 }}>
                              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Position :</div>
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                {(['left','right','fullwidth'] as const).map(pos => {
                                  const labels: Record<string,string> = { left:'◧ Gauche', right:'◨ Droite', fullwidth:'▬ Pleine largeur' }
                                  const active = (draft.unique_image?.position ?? 'left') === pos
                                  return (
                                    <button key={pos} onClick={() => patchDraft({ unique_image: { ...draft.unique_image!, position: pos } })}
                                      style={{ padding:'3px 9px', borderRadius:4, border:`1px solid ${active ? C.primary : C.border}`,
                                        background: active ? 'rgba(29,158,117,0.1)' : 'transparent',
                                        color: active ? C.primary : C.muted, fontSize:11, cursor:'pointer', fontWeight: active ? 600 : 400 }}>
                                      {labels[pos]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* Alignement vertical + largeur (2 colonnes) */}
                            {(draft.unique_image?.position ?? 'left') !== 'fullwidth' && (
                              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                <div>
                                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Alignement vertical de l'image :</div>
                                  <div style={{ display:'flex', gap:4 }}>
                                    {(['top','middle','bottom'] as const).map(va => {
                                      const vaLabels: Record<string,string> = { top:'↑ Haut', middle:'↕ Centre', bottom:'↓ Bas' }
                                      const active = (draft.unique_image?.valign ?? 'top') === va
                                      return (
                                        <button key={va} onClick={() => patchDraft({ unique_image: { ...draft.unique_image!, valign: va } })}
                                          style={{ padding:'3px 9px', borderRadius:4, border:`1px solid ${active ? C.primary : C.border}`,
                                            background: active ? 'rgba(29,158,117,0.1)' : 'transparent',
                                            color: active ? C.primary : C.muted, fontSize:11, cursor:'pointer', fontWeight: active ? 600 : 400 }}>
                                          {vaLabels[va]}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>
                                    Largeur image : <strong style={{ color:C.text }}>{draft.unique_image?.width_pct ?? 35}%</strong>
                                    <span style={{ color:C.dim }}> · texte : {100 - (draft.unique_image?.width_pct ?? 35)}%</span>
                                  </div>
                                  <input type="range" min={20} max={70} step={5}
                                    value={draft.unique_image?.width_pct ?? 35}
                                    onChange={e => patchDraft({ unique_image: { ...draft.unique_image!, width_pct: Number(e.target.value) } })}
                                    style={{ width:'100%', accentColor:C.primary }} />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <label style={{ display:'inline-block', marginTop:10, padding:'6px 14px', borderRadius:6, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, fontSize:11, cursor:'pointer' }}>
                            Choisir une image
                            <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              if (file.size > 2_000_000) { alert('Image trop lourde (max 2 Mo)'); return }
                              const reader = new FileReader()
                              reader.onload = () => {
                                const dataUrl = reader.result as string
                                const img = new Image()
                                img.onload = () => patchDraft({ unique_image: {
                                  data: dataUrl.split(',')[1], mime: file.type,
                                  position: 'left', width_pct: 35, valign: 'top',
                                  natural_width: img.naturalWidth, natural_height: img.naturalHeight,
                                }})
                                img.src = dataUrl
                              }
                              reader.readAsDataURL(file)
                            }} />
                          </label>
                        )}
                      </div>
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
                          isConflict={conflictIds.has(sec.id)}
                          onToggle={() => setExpandedSec(prev => prev === sec.id ? null : sec.id)}
                          onChange={patch => patchSection(idx, patch)}
                          onDelete={sec.type === 'custom' || sec.fixedId ? () => deleteSection(idx) : undefined}
                          onDuplicate={() => duplicateSection(idx)}
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

                {/* ── Flowchart (mode sections uniquement) ─────────── */}
                {draft.mode === 'sections' && (
                  <div style={{ width:240, flexShrink:0, position:'sticky', top:0, background:C.card2, borderRadius:8, border:`1px solid ${C.border}`, padding:'12px 10px' }}>
                    <SectionFlowchart
                      sections={sections}
                      conflictIds={conflictIds}
                      onFocus={focusSection}
                    />
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
                    Affiché dans vos lettres DOCX. PNG ou JPG recommandé, max 1,5 Mo.
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

                  {/* Position et taille — uniquement si logo chargé */}
                  {draft.logo_data && (
                    <div style={{ marginTop:20, padding:'16px', background:'rgba(255,255,255,0.03)', border:`1px solid ${C.border}`, borderRadius:8 }}>

                      {/* Emplacement */}
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>Emplacement dans le document :</div>
                        <div style={{ display:'flex', borderRadius:7, border:`1px solid ${C.border}`, overflow:'hidden', width:'fit-content' }}>
                          {(['header','footer'] as const).map(pos => (
                            <button key={pos} onClick={() => patchDraft({ logo_position: pos })}
                              style={{
                                padding:'5px 16px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                                background: (draft.logo_position ?? 'header') === pos ? C.primary : 'transparent',
                                color:      (draft.logo_position ?? 'header') === pos ? '#fff'    : C.muted,
                              }}>
                              {pos === 'header' ? 'En-tête' : 'Pied de page'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Taille — slider % */}
                      <div>
                        <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>Taille dans le DOCX :</div>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:11, color:C.dim, minWidth:28 }}>10%</span>
                          <input type="range" min={10} max={200} step={5}
                            value={draft.logo_scale_pct ?? 100}
                            onChange={e => patchDraft({ logo_scale_pct: Number(e.target.value) })}
                            style={{ flex:1, accentColor:C.primary }}
                          />
                          <span style={{ fontSize:13, fontWeight:700, color:C.text, minWidth:40, textAlign:'right' }}>
                            {draft.logo_scale_pct ?? 100}%
                          </span>
                          {/* Mini-aperçu proportionnel */}
                          <div style={{ padding:6, background:'#fff', borderRadius:5, flexShrink:0, minWidth:50, minHeight:30, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <img
                              src={`data:${draft.logo_mime ?? 'image/png'};base64,${draft.logo_data}`}
                              alt="Aperçu"
                              style={{
                                width:  Math.round((draft.logo_width  ?? 60) * ((draft.logo_scale_pct ?? 100) / 100)),
                                height: Math.round((draft.logo_height ?? 40) * ((draft.logo_scale_pct ?? 100) / 100)),
                                objectFit:'contain', display:'block',
                              }}
                            />
                          </div>
                        </div>
                        <div style={{ fontSize:11, color:C.dim, marginTop:6 }}>
                          100 % = taille de référence du logo. Allez dans Aperçu pour voir le rendu complet.
                        </div>
                      </div>
                    </div>
                  )}
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
                      {/* Ligne 1 — destinataire */}
                      <div style={{ marginBottom:8 }}>
                        <label style={{ fontSize:12, color:C.muted, display:'block', marginBottom:4 }}>
                          Ligne 1 — Destinataire :
                        </label>
                        <input
                          value={draft.envelope_line1}
                          onChange={e => patchDraft({ envelope_line1: e.target.value })}
                          style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${C.borderl}`, borderRadius:7, color:C.text, fontSize:13, padding:'8px 12px', boxSizing:'border-box' }}
                          placeholder="Monsieur Madame le Propriétaire"
                        />
                      </div>
                      {/* Ligne 2 — complément (optionnel) */}
                      <div style={{ marginBottom:12 }}>
                        <label style={{ fontSize:12, color:C.muted, display:'block', marginBottom:4 }}>
                          Ligne 2 — Complément d'adresse <span style={{ color:C.dim }}>(optionnel)</span> :
                        </label>
                        <input
                          value={draft.envelope_line2 ?? ''}
                          onChange={e => patchDraft({ envelope_line2: e.target.value })}
                          style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${C.borderl}`, borderRadius:7, color:C.text, fontSize:13, padding:'8px 12px', boxSizing:'border-box' }}
                          placeholder="Apt 3B — Bât A  (laissez vide si inutile)"
                        />
                      </div>
                      {/* Aperçu AFNOR */}
                      <div style={{ fontSize:11, color:C.dim, marginBottom:6 }}>
                        Aperçu — format AFNOR NF Z 10-011 (majuscules, fenêtre DL à droite) :
                      </div>
                      <div style={{ background:'#fff', border:'1px solid #c8c8c8', borderRadius:6, padding:'10px 14px', fontSize:12, lineHeight:1.9, fontFamily:'Arial,sans-serif', display:'inline-block', minWidth:220, letterSpacing:'0.02em', color:'#111' }}>
                        <div>{draft.envelope_line1 || 'Monsieur Madame le Propriétaire'}</div>
                        {draft.envelope_line2 && <div style={{ color:'#555' }}>{(draft.envelope_line2).toUpperCase()}</div>}
                        <div style={{ color:'#555' }}>← ADRESSE (remplie automatiquement)</div>
                        <div style={{ color:'#555' }}>← CODE POSTAL VILLE</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ────────── ONGLET EN-TÊTE / PIED DE PAGE ────────── */}
            {tab === 'entete' && draft && (
              <div style={{ maxWidth:640 }}>

                {/* Variables disponibles */}
                <div style={{ marginBottom:20, padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:`1px solid ${C.border}`, borderRadius:8 }}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>Variables disponibles dans l'en-tête et le pied de page :</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {['{logo}','{agentNom}','{agentTitre}','{agenceNom}','{agenceAdresse}','{agenceTel}','{agenceEmail}'].map(v => (
                      <span key={v} style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'rgba(96,165,250,0.1)', color:'#93C5FD', border:'1px solid rgba(96,165,250,0.2)', fontFamily:'monospace' }}>{v}</span>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:C.dim, marginTop:6 }}>
                    <code style={{ color:'#93C5FD' }}>{'{logo}'}</code> insère votre logo à cet endroit dans le texte.
                  </div>
                </div>

                {/* ── EN-TÊTE ── */}
                <div style={{ marginBottom:32 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                    <div style={{ fontWeight:600, fontSize:14, color:C.text }}>En-tête</div>
                    <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', marginLeft:'auto' }}>
                      <input type="checkbox"
                        checked={draft.header_enabled !== false}
                        onChange={e => patchDraft({ header_enabled: e.target.checked })}
                        style={{ accentColor:C.primary, cursor:'pointer' }} />
                      <span style={{ fontSize:12, color:C.mid }}>Afficher l'en-tête</span>
                    </label>
                  </div>

                  {draft.header_enabled !== false && (
                    <>
                      {/* Hauteur */}
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
                          Hauteur minimale : <strong style={{ color:C.text }}>{draft.header_height_mm ?? 30} mm</strong>
                        </div>
                        <input type="range" min={10} max={80} step={5}
                          value={draft.header_height_mm ?? 30}
                          onChange={e => patchDraft({ header_height_mm: Number(e.target.value) })}
                          style={{ width:'100%', accentColor:C.primary }} />
                      </div>

                      {/* Bouton Défaut / Réinitialiser */}
                      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                        <button onClick={() => patchDraft({ header_html: null })}
                          style={{ fontSize:11, padding:'4px 10px', borderRadius:5, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, cursor:'pointer' }}>
                          ↩ Revenir à l'en-tête automatique
                        </button>
                        <button onClick={() => patchDraft({ header_html: `{logo}<br><strong style="color:#009597;">{agenceNom}</strong><br><span style="color:#5F5E5A;">📞 {agenceTel}</span><br><strong>{agentNom}</strong> — <span style="color:#5F5E5A;">{agentTitre}</span><br><span style="color:#5F5E5A;">✉ {agenceEmail}</span>` })}
                          style={{ fontSize:11, padding:'4px 10px', borderRadius:5, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, cursor:'pointer' }}>
                          ✦ Charger le modèle de départ
                        </button>
                      </div>

                      {draft.header_html == null ? (
                        <div style={{ padding:'14px 16px', background:'rgba(29,158,117,0.06)', border:`1px solid rgba(29,158,117,0.2)`, borderRadius:8, fontSize:12, color:C.muted }}>
                          En-tête <strong style={{ color:C.text }}>automatique</strong> — tableau 3 colonnes (logo · agence · conseiller). Cliquez sur "Charger le modèle de départ" pour le personnaliser.
                        </div>
                      ) : (
                        <RichEditor
                          value={draft.header_html}
                          onChange={html => patchDraft({ header_html: html || null })}
                          placeholder="Rédigez votre en-tête ici… ex : {logo} {agenceNom} {agentNom}"
                          vars={['{logo}','{agentNom}','{agentTitre}','{agenceNom}','{agenceAdresse}','{agenceTel}','{agenceEmail}']}
                        />
                      )}
                    </>
                  )}
                </div>

                <div style={{ borderTop:`1px solid ${C.border}`, marginBottom:32 }} />

                {/* ── PIED DE PAGE ── */}
                <div style={{ marginBottom:32 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                    <div style={{ fontWeight:600, fontSize:14, color:C.text }}>Pied de page / Signature</div>
                    <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', marginLeft:'auto' }}>
                      <input type="checkbox"
                        checked={draft.footer_enabled !== false}
                        onChange={e => patchDraft({ footer_enabled: e.target.checked })}
                        style={{ accentColor:C.primary, cursor:'pointer' }} />
                      <span style={{ fontSize:12, color:C.mid }}>Afficher le pied de page</span>
                    </label>
                  </div>

                  {draft.footer_enabled !== false && (
                    <>
                      {/* Hauteur */}
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
                          Hauteur minimale : <strong style={{ color:C.text }}>{draft.footer_height_mm ?? 20} mm</strong>
                        </div>
                        <input type="range" min={10} max={80} step={5}
                          value={draft.footer_height_mm ?? 20}
                          onChange={e => patchDraft({ footer_height_mm: Number(e.target.value) })}
                          style={{ width:'100%', accentColor:C.primary }} />
                      </div>

                      {/* Bouton Défaut / Réinitialiser */}
                      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                        <button onClick={() => patchDraft({ footer_html: null })}
                          style={{ fontSize:11, padding:'4px 10px', borderRadius:5, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, cursor:'pointer' }}>
                          ↩ Revenir à la signature automatique
                        </button>
                        <button onClick={() => patchDraft({ footer_html: `<strong>{agentNom}</strong><br><span style="color:#5F5E5A;">{agentTitre} — {agenceNom}</span><br><span style="color:#5F5E5A;">📞 {agenceTel}</span><br><span style="color:#5F5E5A;">✉ {agenceEmail}</span>` })}
                          style={{ fontSize:11, padding:'4px 10px', borderRadius:5, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.04)', color:C.mid, cursor:'pointer' }}>
                          ✦ Charger le modèle de départ
                        </button>
                      </div>

                      {draft.footer_html == null ? (
                        <div style={{ padding:'14px 16px', background:'rgba(29,158,117,0.06)', border:`1px solid rgba(29,158,117,0.2)`, borderRadius:8, fontSize:12, color:C.muted }}>
                          Signature <strong style={{ color:C.text }}>automatique</strong> — nom, titre, agence, téléphone, email. Cliquez sur "Charger le modèle de départ" pour la personnaliser.
                        </div>
                      ) : (
                        <RichEditor
                          value={draft.footer_html}
                          onChange={html => patchDraft({ footer_html: html || null })}
                          placeholder="Rédigez votre signature ici… ex : {agentNom} {agentTitre} {agenceNom}"
                          vars={['{logo}','{agentNom}','{agentTitre}','{agenceNom}','{agenceAdresse}','{agenceTel}','{agenceEmail}']}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ────────── ONGLET APERÇU ────────── */}
            {tab === 'preview' && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
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
                  {/* Toggle type de bien */}
                  <span style={{ fontSize:12, color:C.dim, marginLeft:8 }}>|</span>
                  {(['appartement','maison'] as const).map(t => (
                    <button key={t} onClick={() => setPreviewType(t)}
                      style={{ padding:'3px 10px', borderRadius:5, border:'none', fontSize:12, cursor:'pointer',
                        background: previewType===t ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                        color: previewType===t ? C.text : C.dim, fontWeight: previewType===t ? 600 : 400 }}>
                      {t === 'appartement' ? 'Appt' : 'Maison'}
                    </button>
                  ))}
                  {/* Checkbox audit */}
                  <label style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4, cursor:'pointer', userSelect:'none' }}>
                    <input
                      type="checkbox"
                      checked={previewWithAudit}
                      onChange={e => setPreviewWithAudit(e.target.checked)}
                      style={{ accentColor: C.primary, width:14, height:14, cursor:'pointer' }}
                    />
                    <span style={{ fontSize:12, color: previewWithAudit ? C.text : C.muted }}>
                      Avec audit réalisé
                    </span>
                    {previewWithAudit && !['E','F','G'].includes(previewDpe) && (
                      <span style={{ fontSize:11, color:C.gold }}>
                        ⚠ visible uniquement pour DPE E, F ou G
                      </span>
                    )}
                  </label>
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
