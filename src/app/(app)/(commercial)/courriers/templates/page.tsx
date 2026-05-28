'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { LetterTemplate } from '@/lib/lettres/generator'
import {
  getDpeTexts, getIntroCtx, getVenteText,
  getGLText, getEstimationText, getPolitesse1, getPolitesse2,
  getRenovationCaText, generateLetterHTML,
} from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'

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
  gold:    '#D97706',
  danger:  '#EF4444',
  success: '#22C55E',
}

// ── Sections de template ───────────────────────────────────────────────────────

interface Section {
  id:     string
  label:  string
  group:  string
  fields: Field[]
}

interface Field {
  key:     keyof LetterTemplate
  label:   string
  hint:    string
  vars:    string[]
  rows:    number
  getDefault: (dpe?: string, typeBien?: string) => string
}

const SECTIONS: Section[] = [
  {
    id: 'intro', label: 'Introduction', group: 'Accroche',
    fields: [
      {
        key: 'intro_ab', label: 'Intro DPE A/B (bons performers)', hint: 'Paragraphe d\'accroche pour les biens bien classés.',
        vars: ['{ctx}', '{typeBien}'], rows: 4,
        getDefault: () => getIntroCtx('AB', 'sur le secteur de Bordeaux', 'votre bien'),
      },
      {
        key: 'intro_other', label: 'Intro DPE C à G (contraintes réglementaires)', hint: 'Paragraphe d\'accroche pour les biens avec contraintes.',
        vars: ['{ctx}', '{typeBien}'], rows: 4,
        getDefault: () => getIntroCtx('FG', 'sur le secteur de Bordeaux', 'votre bien'),
      },
    ],
  },
  {
    id: 'dpe_g', label: 'DPE G', group: 'Situation énergétique',
    fields: [
      {
        key: 'dpe_g_intro', label: 'Phrase d\'intro DPE G', hint: 'Première phrase du paragraphe, en gras dans la lettre.',
        vars: ['{typeBien}'], rows: 2,
        getDefault: () => getDpeTexts('G', 'votre bien').intro,
      },
      {
        key: 'dpe_g_detail', label: 'Détail réglementaire DPE G', hint: 'Paragraphe de contexte légal (loyers gelés, location interdite…).',
        vars: [], rows: 5,
        getDefault: () => getDpeTexts('G', 'votre bien').detail,
      },
    ],
  },
  {
    id: 'dpe_f', label: 'DPE F', group: 'Situation énergétique',
    fields: [
      {
        key: 'dpe_f_intro', label: 'Phrase d\'intro DPE F', hint: 'Première phrase en gras.',
        vars: ['{typeBien}'], rows: 2,
        getDefault: () => getDpeTexts('F', 'votre bien').intro,
      },
      {
        key: 'dpe_f_detail', label: 'Détail réglementaire DPE F', hint: 'Contexte loyers gelés + interdiction 2028.',
        vars: [], rows: 5,
        getDefault: () => getDpeTexts('F', 'votre bien').detail,
      },
    ],
  },
  {
    id: 'dpe_e', label: 'DPE E', group: 'Situation énergétique',
    fields: [
      {
        key: 'dpe_e_intro', label: 'Phrase d\'intro DPE E', hint: 'Première phrase en gras.',
        vars: [], rows: 2,
        getDefault: () => getDpeTexts('E', 'votre bien').intro,
      },
      {
        key: 'dpe_e_detail', label: 'Détail réglementaire DPE E', hint: 'Contexte gel loyers + restrictions 2034.',
        vars: [], rows: 5,
        getDefault: () => getDpeTexts('E', 'votre bien').detail,
      },
    ],
  },
  {
    id: 'dpe_cd', label: 'DPE C/D', group: 'Situation énergétique',
    fields: [
      {
        key: 'dpe_cd_intro', label: 'Phrase d\'intro DPE C/D', hint: 'Première phrase en gras.',
        vars: ['{dpe}'], rows: 2,
        getDefault: () => getDpeTexts('C', 'votre bien').intro,
      },
      {
        key: 'dpe_cd_detail', label: 'Paragraphe DPE C/D', hint: 'Contexte marché dynamique.',
        vars: [], rows: 4,
        getDefault: () => getDpeTexts('C', 'votre bien').detail,
      },
    ],
  },
  {
    id: 'dpe_ab', label: 'DPE A/B', group: 'Situation énergétique',
    fields: [
      {
        key: 'dpe_ab_intro', label: 'Phrase d\'intro DPE A/B', hint: 'Première phrase en gras.',
        vars: ['{dpe}'], rows: 2,
        getDefault: () => getDpeTexts('A', 'votre bien').intro,
      },
      {
        key: 'dpe_ab_detail', label: 'Paragraphe DPE A/B', hint: 'Valorisation de l\'atout DPE.',
        vars: ['{typeBien}'], rows: 3,
        getDefault: () => getDpeTexts('A', 'votre bien').detail,
      },
    ],
  },
  {
    id: 'estimation', label: 'Estimation', group: 'Offres de service',
    fields: [
      {
        key: 'estimation', label: 'Texte estimation gratuite', hint: 'Section "Estimation gratuite de votre bien".',
        vars: ['{typeBien}'], rows: 4,
        getDefault: () => getEstimationText('votre bien'),
      },
    ],
  },
  {
    id: 'vente', label: 'Vente', group: 'Offres de service',
    fields: [
      {
        key: 'vente_fg', label: 'Texte vente DPE F/G/E', hint: 'Rassure sur la vendabilité malgré le mauvais DPE.',
        vars: ['{dpe}', '{typeBien}'], rows: 4,
        getDefault: () => getVenteText('FG', 'G', 'votre bien'),
      },
      {
        key: 'vente_cd', label: 'Texte vente DPE C/D', hint: 'Valorise le DPE comme atout de vente.',
        vars: ['{typeBien}', '{dpe}'], rows: 3,
        getDefault: () => getVenteText('CD', 'C', 'votre bien'),
      },
      {
        key: 'vente_ab', label: 'Texte vente DPE A/B', hint: 'Excellent DPE = argument de vente premium.',
        vars: ['{typeBien}', '{dpe}'], rows: 3,
        getDefault: () => getVenteText('AB', 'A', 'votre bien'),
      },
    ],
  },
  {
    id: 'gl', label: 'Gestion locative', group: 'Offres de service',
    fields: [
      {
        key: 'gl_appt', label: 'GL pour les appartements (DPE A/B/CD appt)', hint: 'Affiché uniquement pour les appartements bien classés.',
        vars: [], rows: 3,
        getDefault: () => getGLText(true),
      },
      {
        key: 'gl_maison', label: 'GL pour les maisons (DPE A/B maison)', hint: 'Affiché pour les maisons bien classées.',
        vars: [], rows: 3,
        getDefault: () => getGLText(false),
      },
    ],
  },
  {
    id: 'renovation', label: 'Rénovation CA', group: 'Offres de service',
    fields: [
      {
        key: 'renovation_ca', label: 'Bloc rénovation Crédit Agricole', hint: 'Affiché pour DPE E/F/G (non-GL). Mention J\'écorénove.',
        vars: [], rows: 4,
        getDefault: () => getRenovationCaText(),
      },
    ],
  },
  {
    id: 'politesse', label: 'Formules finales', group: 'Politesse',
    fields: [
      {
        key: 'politesse1', label: 'Première formule de politesse', hint: 'Disponibilité et invitation à un RDV.',
        vars: [], rows: 2,
        getDefault: () => getPolitesse1(),
      },
      {
        key: 'politesse2', label: 'Formule de clôture', hint: 'Formule de salutation finale.',
        vars: [], rows: 2,
        getDefault: () => getPolitesse2(),
      },
    ],
  },
]

// ── Preview DPE test ───────────────────────────────────────────────────────────
const PREVIEW_DPE: DpeAdresseData = {
  id: 'preview',
  adresse_brute: '12 Rue de la Paix',
  nom_commune: 'Bordeaux',
  type_bien: 'appartement',
  dpe_etiquette: 'F',
  conso_ep_m2: 320,
  cout_annuel: 2800,
  energie_principale: 'Électricité',
  ges_m2: 62,
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [template,    setTemplate]    = useState<LetterTemplate>({})
  const [draft,       setDraft]       = useState<LetterTemplate>({})
  const [activeSec,   setActiveSec]   = useState('intro')
  const [saving,      setSaving]      = useState(false)
  const [saveOk,      setSaveOk]      = useState(false)
  const [saveErr,     setSaveErr]     = useState('')
  const [loading,     setLoading]     = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [previewDpe,  setPreviewDpe]  = useState('F')
  const [resetting,   setResetting]   = useState<string | null>(null)

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/courriers/template')
      .then(r => r.json())
      .then(d => {
        const t = d.template ?? {}
        setTemplate(t)
        setDraft(t)
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Mise à jour d'un champ ────────────────────────────────────────────────
  const setField = useCallback((key: keyof LetterTemplate, value: string) => {
    setDraft(d => ({ ...d, [key]: value }))
  }, [])

  // ── Reset d'un champ ──────────────────────────────────────────────────────
  const resetField = (key: keyof LetterTemplate) => {
    setResetting(key as string)
    setTimeout(() => {
      setDraft(d => ({ ...d, [key]: null }))
      setResetting(null)
    }, 300)
  }

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true); setSaveOk(false); setSaveErr('')
    try {
      const r = await fetch('/api/courriers/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error ?? 'Erreur'); return }
      setTemplate(d.template)
      setDraft(d.template)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e: any) { setSaveErr(e.message ?? 'Erreur réseau') }
    finally { setSaving(false) }
  }

  // ── Reset total ───────────────────────────────────────────────────────────
  const resetAll = async () => {
    if (!confirm('Remettre tous les textes aux valeurs par défaut ? Cette action est irréversible.')) return
    setSaving(true)
    try {
      await fetch('/api/courriers/template', { method: 'DELETE' })
      setTemplate({}); setDraft({})
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch { setSaveErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  // ── Modifications non sauvegardées ────────────────────────────────────────
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(template)

  const activeSection = SECTIONS.find(s => s.id === activeSec)!

  // ── Preview lettre ────────────────────────────────────────────────────────
  const previewData: DpeAdresseData = { ...PREVIEW_DPE, dpe_etiquette: previewDpe }
  const letterHTML = generateLetterHTML(previewData, draft)

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 8,
    color: C.text, fontSize: 13, padding: '10px 12px',
    boxSizing: 'border-box', outline: 'none', resize: 'vertical' as const,
    fontFamily: 'inherit', lineHeight: 1.65,
  }

  // ── Groupes de sections ───────────────────────────────────────────────────
  const groups: Record<string, Section[]> = {}
  for (const s of SECTIONS) {
    ;(groups[s.group] ??= []).push(s)
  }

  // ── Indicateur de personnalisation ────────────────────────────────────────
  const isCustomized = (s: Section) =>
    s.fields.some(f => draft[f.key] !== null && draft[f.key] !== undefined && draft[f.key] !== '')

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: C.bg, color: C.muted, fontSize: 14 }}>
        Chargement du template…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', background: C.bg, color: C.text, overflow: 'hidden' }}>

      {/* ── Sidebar gauche ───────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.card, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <Link href="/courriers" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: C.muted, fontSize: 12 }}>
            ← Retour courriers
          </Link>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Templates courriers</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Personnalisation des textes</div>
        </div>

        {/* Navigation sections */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {Object.entries(groups).map(([group, sections]) => (
            <div key={group} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: 4 }}>
                {group}
              </div>
              {sections.map(s => (
                <button key={s.id} onClick={() => setActiveSec(s.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 7, border: 'none', textAlign: 'left', cursor: 'pointer',
                    background: activeSec === s.id ? 'rgba(29,158,117,0.12)' : 'transparent',
                    color: activeSec === s.id ? C.primary : C.mid,
                    fontWeight: activeSec === s.id ? 600 : 400, fontSize: 13,
                    marginBottom: 1,
                  }}>
                  <span>{s.label}</span>
                  {isCustomized(s) && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer actions */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={resetAll} disabled={saving}
            style={{ width: '100%', padding: '8px', borderRadius: 7, border: `1px solid rgba(239,68,68,0.25)`, background: 'rgba(239,68,68,0.06)', color: C.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 6 }}>
            Tout réinitialiser
          </button>
          <div style={{ fontSize: 11, color: C.dim, textAlign: 'center' }}>
            Les points verts indiquent les sections personnalisées
          </div>
        </div>
      </div>

      {/* ── Zone centrale : éditeur ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Barre du haut */}
        <div style={{ padding: '12px 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{activeSection.label}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Laissez vide pour utiliser le texte par défaut</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saveErr && <span style={{ fontSize: 12, color: C.danger }}>{saveErr}</span>}
            {saveOk  && <span style={{ fontSize: 12, color: C.success }}>✓ Sauvegardé</span>}
            <button onClick={() => setShowPreview(p => !p)}
              style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.borderl}`, background: showPreview ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.05)', color: showPreview ? C.primary : C.mid, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {showPreview ? 'Masquer aperçu' : 'Aperçu lettre'}
            </button>
            {hasChanges && (
              <button onClick={save} disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: saving ? C.dim : C.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>

        {/* Contenu scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 0 }}>

          {/* Champs éditables */}
          <div style={{ flex: showPreview ? '0 0 480px' : 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto', borderRight: showPreview ? `1px solid ${C.border}` : 'none' }}>
            {activeSection.fields.map(field => {
              const value = (draft[field.key] as string | null | undefined) ?? ''
              const isModified = value !== null && value !== '' && value !== undefined
              const defaultText = field.getDefault()

              return (
                <div key={field.key as string} style={{ marginBottom: 32 }}>
                  {/* Label */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>
                        {field.label}
                        {isModified && <span style={{ marginLeft: 8, fontSize: 11, color: C.primary, background: 'rgba(29,158,117,0.12)', padding: '1px 6px', borderRadius: 4 }}>personnalisé</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>{field.hint}</div>
                    </div>
                    {isModified && (
                      <button onClick={() => resetField(field.key)}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(255,255,255,0.04)', color: C.mid, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                        Réinitialiser
                      </button>
                    )}
                  </div>

                  {/* Variables disponibles */}
                  {field.vars.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {field.vars.map(v => (
                        <span key={v} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', color: '#93C5FD', border: '1px solid rgba(96,165,250,0.2)', fontFamily: 'monospace', cursor: 'pointer' }}
                          title="Cliquez pour insérer"
                          onClick={() => {
                            const el = document.getElementById(`field-${field.key}`) as HTMLTextAreaElement
                            if (!el) return
                            const start = el.selectionStart ?? value.length
                            const end   = el.selectionEnd   ?? value.length
                            const before = (value || defaultText).slice(0, start)
                            const after  = (value || defaultText).slice(end)
                            setField(field.key, before + v + after)
                          }}>
                          {v}
                        </span>
                      ))}
                      <span style={{ fontSize: 11, color: C.dim }}>← variables cliquables</span>
                    </div>
                  )}

                  {/* Textarea */}
                  <textarea
                    id={`field-${field.key as string}`}
                    rows={field.rows}
                    value={resetting === field.key as string ? '' : (value || '')}
                    placeholder={defaultText}
                    onChange={e => setField(field.key, e.target.value)}
                    style={{
                      ...inp,
                      borderColor: isModified ? 'rgba(29,158,117,0.35)' : 'rgba(255,255,255,0.08)',
                    }}
                  />

                  {/* Texte par défaut (collapsible) */}
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 11, color: C.dim, cursor: 'pointer', userSelect: 'none' }}>
                      Voir le texte par défaut
                    </summary>
                    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
                      {defaultText}
                    </div>
                  </details>
                </div>
              )
            })}
          </div>

          {/* Aperçu lettre */}
          {showPreview && (
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 28px', background: C.bg }}>
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Aperçu avec DPE</span>
                {['A','B','C','D','E','F','G'].map(l => (
                  <button key={l} onClick={() => setPreviewDpe(l)}
                    style={{
                      padding: '3px 10px', borderRadius: 5, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: previewDpe === l ? ({'A':'#319834','B':'#51A351','C':'#B0CC30','D':'#F0D30A','E':'#F0A500','F':'#E06029','G':'#CC1016'} as Record<string,string>)[l] : 'rgba(255,255,255,0.08)',
                      color: previewDpe === l ? '#fff' : C.mid,
                    }}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ background: '#fff', borderRadius: 10, padding: '32px 40px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: letterHTML }}
              />
            </div>
          )}
        </div>

        {/* Barre du bas avec sauvegarde */}
        {hasChanges && (
          <div style={{ padding: '12px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(29,158,117,0.05)' }}>
            <span style={{ fontSize: 12, color: C.primary }}>Modifications non sauvegardées</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDraft(template)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.borderl}`, background: 'rgba(255,255,255,0.05)', color: C.mid, fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? C.dim : C.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
