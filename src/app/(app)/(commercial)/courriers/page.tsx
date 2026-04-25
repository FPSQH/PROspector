'use client'

import { useState, useEffect, useCallback } from 'react'
import { generateLetterHTML, generateLetterText, getLetterStrategy } from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'

const DPE_COLORS: Record<string, string> = {
  A:'#319834', B:'#51A351', C:'#B0CC30', D:'#F0D30A',
  E:'#F0A500', F:'#E06029', G:'#CC1016',
}

const DPE_OPTIONS = ['A','B','C','D','E','F','G']

export default function CourriersPage() {
  const [adresses, setAdresses]       = useState<DpeAdresseData[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<DpeAdresseData | null>(null)
  const [letterHTML, setLetterHTML]   = useState('')
  const [filterDpe, setFilterDpe]     = useState<string[]>(['E','F','G'])
  const [search, setSearch]           = useState('')
  const [printing, setPrinting]       = useState(false)
  const [copied, setCopied]           = useState(false)

  const loadAdresses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dpe: filterDpe.join(','), limit: '200' })
      const r = await fetch('/api/courriers?' + params)
      const d = await r.json()
      setAdresses(d.adresses ?? [])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [filterDpe])

  useEffect(() => { loadAdresses() }, [loadAdresses])

  useEffect(() => {
    if (selected) setLetterHTML(generateLetterHTML(selected))
  }, [selected])

  const filtered = adresses.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return (a.adresse_brute ?? '').toLowerCase().includes(q)
      || (a.nom_commune ?? '').toLowerCase().includes(q)
  })

  function handlePrint() {
    if (!letterHTML || !selected) return
    setPrinting(true)
    const win = window.open('', '_blank')
    if (!win) { setPrinting(false); return }
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>Courrier DPE — ${selected.adresse_brute}</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; padding: 0 30px; color: #1a1a18; }
  h4   { color: #1D9E75; }
  @media print { body { margin: 20px; } }
</style>
</head><body>${letterHTML}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); setPrinting(false) }, 300)
  }

  function handleCopy() {
    if (!selected) return
    navigator.clipboard.writeText(generateLetterText(selected)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const badgeDpe = (dpe: string) => (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: DPE_COLORS[dpe] ?? '#999', color: '#fff',
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
    }}>{dpe}</span>
  )

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: '#f8f7f4' }}>

      {/* ── Sidebar liste ─────────────────────────────────────────── */}
      <div style={{
        width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #E8E6DF', background: '#fff',
        height: '100%', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #E8E6DF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '1.1rem' }}>✉️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1a1a18' }}>Courriers DPE</div>
              <div style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{filtered.length} adresse{filtered.length > 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Filtre DPE */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {DPE_OPTIONS.map(d => (
              <button key={d} onClick={() => setFilterDpe(prev =>
                prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
              )} style={{
                padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700,
                border: '2px solid ' + (filterDpe.includes(d) ? DPE_COLORS[d] : '#E8E6DF'),
                background: filterDpe.includes(d) ? DPE_COLORS[d] : '#fff',
                color: filterDpe.includes(d) ? '#fff' : '#9b9b96',
                cursor: 'pointer',
              }}>{d}</button>
            ))}
          </div>

          {/* Recherche */}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une adresse..."
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              border: '1px solid #E8E6DF', fontSize: '0.8125rem',
              background: '#F8F7F4', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: '#9b9b96', fontSize: '0.85rem' }}>Chargement...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#9b9b96', fontSize: '0.85rem' }}>
              Aucune adresse avec DPE {filterDpe.join(', ')}
            </div>
          )}
          {filtered.map(a => (
            <div key={a.id} onClick={() => setSelected(a)} style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
              background: selected?.id === a.id ? '#F0FDF4' : 'transparent',
              border: '1px solid ' + (selected?.id === a.id ? '#BBF7D0' : 'transparent'),
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {badgeDpe(a.dpe_etiquette ?? '?')}
                <span style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{a.type_bien ?? 'inconnu'}</span>
                {a.audit && <span style={{ fontSize: '0.7rem', background: '#E8F7F2', color: '#0F6E56', borderRadius: 10, padding: '1px 6px' }}>Audit</span>}
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#1a1a18', lineHeight: 1.3 }}>
                {a.adresse_brute}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>
                {a.code_postal} {a.nom_commune}
              </div>
              {a.dpe_etiquette && (
                <div style={{ fontSize: '0.7rem', color: '#5F5E5A', marginTop: 4, fontStyle: 'italic' }}>
                  {getLetterStrategy(a.dpe_etiquette)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Zone lettre ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: '3rem' }}>✉️</div>
            <div style={{ fontWeight: 600, color: '#2C2C2A', fontSize: '1rem' }}>Sélectionnez une adresse</div>
            <div style={{ fontSize: '0.85rem', color: '#9b9b96', textAlign: 'center', maxWidth: 280 }}>
              Choisissez une adresse dans la liste pour générer le courrier personnalisé.
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{
              padding: '12px 24px', borderBottom: '1px solid #E8E6DF', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {badgeDpe(selected.dpe_etiquette ?? '?')}
                  {selected.adresse_brute}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>
                  {selected.code_postal} {selected.nom_commune}
                  {selected.surface_habitable ? ` · ${selected.surface_habitable} m²` : ''}
                  {selected.audit ? ' · Audit disponible' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCopy} style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #E8E6DF',
                  background: copied ? '#E8F7F2' : '#fff', color: copied ? '#0F6E56' : '#5F5E5A',
                  cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500,
                }}>
                  {copied ? '✓ Copié' : '📋 Copier'}
                </button>
                <button onClick={handlePrint} disabled={printing} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#1D9E75', color: '#fff', cursor: 'pointer',
                  fontSize: '0.8125rem', fontWeight: 600,
                }}>
                  {printing ? 'Ouverture...' : '🖨️ Imprimer'}
                </button>
              </div>
            </div>

            {/* Prévisualisation */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px', background: '#f8f7f4' }}>
              <div style={{
                maxWidth: 720, margin: '0 auto', background: '#fff',
                borderRadius: 12, padding: '48px 56px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                fontFamily: 'Georgia, serif',
              }}
                dangerouslySetInnerHTML={{ __html: letterHTML }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
