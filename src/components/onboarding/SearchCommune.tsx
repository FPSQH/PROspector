'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface CommuneResult {
  code_insee:  string
  nom:         string
  code_postal: string
  departement: string
  population:  number
}

interface Props {
  onAdd: (communes: CommuneResult[]) => Promise<void>
  communesExistantes: string[]
}

const C = {
  card:    '#141416',
  border:  'rgba(255,255,255,0.08)',
  borderl: 'rgba(255,255,255,0.12)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  primary: '#1D9E75',
  success: '#22C55E',
}

export function SearchCommune({ onAdd, communesExistantes }: Props) {
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<CommuneResult[]>([])
  const [isCodePostal, setIsCodePostal] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [open, setOpen]                 = useState(false)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [adding, setAdding]             = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false); setSelected(new Set())
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/communes/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.communes ?? [])
      setIsCodePostal(data.is_code_postal ?? false)
      setSelected(new Set())
      setOpen(true)
    } finally { setLoading(false) }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; setQuery(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(v), 300)
  }

  const toggleSelect = (code: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
  }

  const handleAddSelected = async () => {
    const toAdd = results.filter(c => selected.has(c.code_insee) && !communesExistantes.includes(c.code_insee))
    if (!toAdd.length) return
    setAdding(true)
    try { await onAdd(toAdd); setQuery(''); setResults([]); setOpen(false); setSelected(new Set()) }
    finally { setAdding(false) }
  }

  const handleAddSingle = async (commune: CommuneResult) => {
    if (communesExistantes.includes(commune.code_insee)) return
    setAdding(true)
    try { await onAdd([commune]); setQuery(''); setResults([]); setOpen(false); setSelected(new Set()) }
    finally { setAdding(false) }
  }

  const disponibles = results.filter(c => !communesExistantes.includes(c.code_insee))
  const nbSelected  = [...selected].filter(code => !communesExistantes.includes(code)).length

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, border:`1.5px solid ${C.borderl}`, borderRadius:10, background:'rgba(255,255,255,0.05)', padding:'0 12px' }}>
        {loading
          ? <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${C.primary}`, borderTopColor:'transparent', animation:'spin 0.7s linear infinite', flexShrink:0 }}/>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
        }
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Nom de commune ou code postal…"
          style={{ flex:1, border:'none', outline:'none', padding:'10px 0', fontSize:'0.9rem', background:'transparent', color: C.text }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            style={{ background:'none', border:'none', cursor:'pointer', color: C.muted, padding:0, fontSize:'1rem' }}>✕</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background: C.card, borderRadius:10, border:`1.5px solid ${C.borderl}`, boxShadow:'0 8px 30px rgba(0,0,0,0.4)', zIndex:100, overflow:'hidden' }}>
          {isCodePostal && disponibles.length > 1 && (
            <div style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}`, background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'0.78rem', color: C.mid }}>
                <strong style={{ color: C.text }}>{disponibles.length} communes</strong> pour ce code postal
                {nbSelected > 0 && <span style={{ color: C.primary, marginLeft:8 }}>· {nbSelected} sélectionnée{nbSelected > 1 ? 's' : ''}</span>}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {nbSelected < disponibles.length && (
                  <button onClick={() => setSelected(new Set(disponibles.map(c => c.code_insee)))}
                    style={{ fontSize:'0.72rem', padding:'3px 8px', borderRadius:6, border:`1px solid rgba(29,158,117,0.4)`, background:'rgba(29,158,117,0.1)', color: C.primary, cursor:'pointer', fontWeight:500 }}>
                    Tout sélectionner
                  </button>
                )}
                {nbSelected > 0 && (
                  <button onClick={() => setSelected(new Set())}
                    style={{ fontSize:'0.72rem', padding:'3px 8px', borderRadius:6, border:`1px solid ${C.border}`, background:'rgba(255,255,255,0.04)', color: C.mid, cursor:'pointer' }}>
                    Désélectionner
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ maxHeight:280, overflowY:'auto' }}>
            {results.map(commune => {
              const existe  = communesExistantes.includes(commune.code_insee)
              const checked = selected.has(commune.code_insee)
              return (
                <div key={commune.code_insee}
                  onClick={() => {
                    if (existe) return
                    if (isCodePostal && disponibles.length > 1) toggleSelect(commune.code_insee)
                    else handleAddSingle(commune)
                  }}
                  style={{ padding:'9px 14px', borderBottom:`1px solid ${C.border}`, cursor:existe?'default':'pointer', background: checked ? 'rgba(29,158,117,0.1)' : existe ? 'rgba(255,255,255,0.02)' : 'transparent', opacity: existe ? 0.5 : 1, display:'flex', alignItems:'center', gap:10 }}
                  onMouseEnter={e => { if (!existe && !checked) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLDivElement).style.background = existe ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                >
                  {isCodePostal && disponibles.length > 1 && (
                    <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, border: checked ? `2px solid ${C.primary}` : `2px solid ${C.borderl}`, background: checked ? C.primary : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {checked && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:500, fontSize:'0.875rem', color: C.text, display:'flex', alignItems:'center', gap:6 }}>
                      {commune.nom}
                      {existe && <span style={{ fontSize:'0.65rem', background:'rgba(34,197,94,0.1)', color:'#4ADE80', padding:'1px 5px', borderRadius:4, fontWeight:600 }}>Déjà ajoutée</span>}
                    </div>
                    <div style={{ fontSize:'0.75rem', color: C.mid, marginTop:1 }}>
                      {commune.code_postal} · Dép. {commune.departement}
                      {commune.population > 0 && <> · {commune.population.toLocaleString('fr-FR')} hab.</>}
                    </div>
                  </div>
                  {(!isCodePostal || disponibles.length === 1) && !existe && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  )}
                </div>
              )
            })}
          </div>

          {isCodePostal && disponibles.length > 1 && nbSelected > 0 && (
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}`, background:'rgba(255,255,255,0.02)' }}>
              <button onClick={handleAddSelected} disabled={adding}
                style={{ width:'100%', padding:'9px', borderRadius:8, border:'none', background: adding ? '#4A4A58' : C.primary, color:'#fff', fontWeight:600, fontSize:'0.875rem', cursor: adding ? 'not-allowed' : 'pointer' }}>
                {adding ? 'Ajout en cours…' : `Ajouter ${nbSelected} commune${nbSelected > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {disponibles.length === 0 && (
            <div style={{ padding:'14px', fontSize:'0.8rem', color: C.muted, textAlign:'center' }}>
              Toutes les communes trouvées sont déjà dans votre secteur
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
