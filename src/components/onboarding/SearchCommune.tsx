'use client'

import { useState, useEffect, useRef } from 'react'

interface CommuneResult {
  code_insee: string
  nom: string
  code_postal: string
  departement: string
  population?: number
  label: string
}

interface Props {
  onSelect: (commune: CommuneResult) => void
  communesActives: string[]  // codes INSEE déjà ajoutés
}

export function SearchCommune({ onSelect, communesActives }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CommuneResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (query.length < 2) { setResults([]); setOpen(false); return }

    setLoading(true)
    timerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/communes/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data)
      setOpen(data.length > 0)
      setLoading(false)
    }, 300)
  }, [query])

  function handleSelect(c: CommuneResult) {
    onSelect(c)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: '1.5px solid #d1d0c8',
        borderRadius: 10,
        padding: '0 12px',
        background: '#fff',
        transition: 'border-color 0.15s',
      }}>
        {/* Icône loupe */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9b9b96" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nom de commune ou code postal…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '12px 0',
            fontSize: '0.9375rem',
            background: 'transparent',
            color: '#1a1a18',
          }}
          autoComplete="off"
        />
        {loading && (
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid #d1d0c8', borderTopColor: '#1D9E75',
            animation: 'spin 0.6s linear infinite',
          }}/>
        )}
      </div>

      {/* Dropdown résultats */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0, right: 0,
          background: '#fff',
          border: '1.5px solid #d1d0c8',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {results.map(c => {
            const dejaDans = communesActives.includes(c.code_insee)
            return (
              <button
                key={c.code_insee}
                onClick={() => !dejaDans && handleSelect(c)}
                disabled={dejaDans}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  border: 'none',
                  background: dejaDans ? '#f8f7f4' : '#fff',
                  cursor: dejaDans ? 'default' : 'pointer',
                  textAlign: 'left',
                  borderBottom: '1px solid #f1efe8',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!dejaDans) (e.currentTarget as HTMLButtonElement).style.background = '#f1f8f5' }}
                onMouseLeave={e => { if (!dejaDans) (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}
              >
                <div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: dejaDans ? '#9b9b96' : '#1a1a18' }}>
                    {c.nom}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#9b9b96' }}>
                    {c.code_postal} · Dép. {c.departement}
                    {c.population ? ` · ${c.population.toLocaleString('fr-FR')} hab.` : ''}
                  </div>
                </div>
                {dejaDans
                  ? <span style={{ fontSize: '0.75rem', color: '#1D9E75', fontWeight: 500 }}>Ajoutée</span>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                }
              </button>
            )
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
