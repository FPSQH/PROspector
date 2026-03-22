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
  communesExistantes: string[] // code_insee déjà ajoutés
}

export function SearchCommune({ onAdd, communesExistantes }: Props) {
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<CommuneResult[]>([])
  const [isCodePostal, setIsCodePostal] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [open, setOpen]               = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set()) // code_insee sélectionnés
  const [adding, setAdding]           = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const dropRef   = useRef<HTMLDivElement>(null)
  const timerRef  = useRef<NodeJS.Timeout>()

  // Fermer si clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelected(new Set())
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/communes/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.communes ?? [])
      setIsCodePostal(data.is_code_postal ?? false)
      setSelected(new Set()) // reset sélection à chaque nouvelle recherche
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(v), 300)
  }

  const toggleSelect = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const handleAddSelected = async () => {
    const toAdd = results.filter(
      (c) => selected.has(c.code_insee) && !communesExistantes.includes(c.code_insee)
    )
    if (toAdd.length === 0) return
    setAdding(true)
    try {
      await onAdd(toAdd)
      setQuery('')
      setResults([])
      setOpen(false)
      setSelected(new Set())
    } finally {
      setAdding(false)
    }
  }

  const handleAddSingle = async (commune: CommuneResult) => {
    if (communesExistantes.includes(commune.code_insee)) return
    setAdding(true)
    try {
      await onAdd([commune])
      setQuery('')
      setResults([])
      setOpen(false)
      setSelected(new Set())
    } finally {
      setAdding(false)
    }
  }

  // Communes disponibles (pas encore ajoutées)
  const disponibles = results.filter((c) => !communesExistantes.includes(c.code_insee))
  const nbSelected  = [...selected].filter(
    (code) => !communesExistantes.includes(code)
  ).length

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      {/* Champ de recherche */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        border: '1.5px solid #e8e7e0', borderRadius: 10,
        background: '#fff', padding: '0 12px',
        transition: 'border-color 0.15s',
      }}
        onFocus={() => {}}
      >
        {loading
          ? <div style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid #1D9E75', borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite', flexShrink: 0,
            }}/>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#9b9b96" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
        }
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Nom de commune ou code postal…"
          style={{
            flex: 1, border: 'none', outline: 'none',
            padding: '10px 0', fontSize: '0.9rem',
            background: 'transparent', color: '#1a1a18',
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#9b9b96', padding: 0, fontSize: '1rem' }}>
            ✕
          </button>
        )}
      </div>

      {/* Dropdown résultats */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: '#fff', borderRadius: 10,
          border: '1.5px solid #e8e7e0',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {/* Header mode code postal */}
          {isCodePostal && disponibles.length > 1 && (
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid #f0efeb',
              background: '#f8f7f4',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: '0.78rem', color: '#5F5E5A' }}>
                <strong>{disponibles.length} communes</strong> pour ce code postal
                {nbSelected > 0 && (
                  <span style={{ color: '#1D9E75', marginLeft: 8 }}>
                    · {nbSelected} sélectionnée{nbSelected > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {nbSelected < disponibles.length && (
                  <button
                    onClick={() => setSelected(new Set(disponibles.map((c) => c.code_insee)))}
                    style={{
                      fontSize: '0.72rem', padding: '3px 8px',
                      borderRadius: 6, border: '1px solid #1D9E75',
                      background: '#f0fdf4', color: '#1D9E75',
                      cursor: 'pointer', fontWeight: 500,
                    }}>
                    Tout sélectionner
                  </button>
                )}
                {nbSelected > 0 && (
                  <button
                    onClick={() => setSelected(new Set())}
                    style={{
                      fontSize: '0.72rem', padding: '3px 8px',
                      borderRadius: 6, border: '1px solid #e8e7e0',
                      background: '#fff', color: '#9b9b96',
                      cursor: 'pointer',
                    }}>
                    Désélectionner
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Liste scrollable */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {results.map((commune) => {
              const existe  = communesExistantes.includes(commune.code_insee)
              const checked = selected.has(commune.code_insee)

              return (
                <div
                  key={commune.code_insee}
                  onClick={() => {
                    if (existe) return
                    if (isCodePostal && disponibles.length > 1) {
                      toggleSelect(commune.code_insee)
                    } else {
                      handleAddSingle(commune)
                    }
                  }}
                  style={{
                    padding: '9px 14px',
                    borderBottom: '1px solid #f8f7f4',
                    cursor: existe ? 'default' : 'pointer',
                    background: checked ? '#f0fdf4' : existe ? '#fafaf8' : 'transparent',
                    opacity: existe ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!existe && !checked)
                      (e.currentTarget as HTMLDivElement).style.background = '#f8f7f4'
                  }}
                  onMouseLeave={(e) => {
                    if (!checked)
                      (e.currentTarget as HTMLDivElement).style.background =
                        existe ? '#fafaf8' : 'transparent'
                  }}
                >
                  {/* Checkbox en mode multi-select */}
                  {isCodePostal && disponibles.length > 1 && (
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: checked ? '2px solid #1D9E75' : '2px solid #d0cfc9',
                      background: checked ? '#1D9E75' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 500, fontSize: '0.875rem', color: '#1a1a18',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {commune.nom}
                      {existe && (
                        <span style={{
                          fontSize: '0.65rem', background: '#f0fdf4',
                          color: '#16a34a', padding: '1px 5px',
                          borderRadius: 4, fontWeight: 600,
                        }}>
                          Déjà ajoutée
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 1 }}>
                      {commune.code_postal} · Dép. {commune.departement}
                      {commune.population > 0 && (
                        <> · {commune.population.toLocaleString('fr-FR')} hab.</>
                      )}
                    </div>
                  </div>

                  {/* Flèche en mode simple */}
                  {(!isCodePostal || disponibles.length === 1) && !existe && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="#9b9b96" strokeWidth="2" strokeLinecap="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  )}
                </div>
              )
            })}
          </div>

          {/* Bouton "Ajouter X communes" en mode multi-select */}
          {isCodePostal && disponibles.length > 1 && nbSelected > 0 && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid #f0efeb',
              background: '#fff',
            }}>
              <button
                onClick={handleAddSelected}
                disabled={adding}
                style={{
                  width: '100%', padding: '9px',
                  borderRadius: 8, border: 'none',
                  background: adding ? '#9b9b96' : '#1D9E75',
                  color: '#fff', fontWeight: 600,
                  fontSize: '0.875rem', cursor: adding ? 'not-allowed' : 'pointer',
                }}>
                {adding
                  ? 'Ajout en cours…'
                  : `Ajouter ${nbSelected} commune${nbSelected > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Aucun résultat dispo */}
          {disponibles.length === 0 && (
            <div style={{ padding: '14px', fontSize: '0.8rem', color: '#9b9b96', textAlign: 'center' }}>
              Toutes les communes trouvées sont déjà dans votre secteur
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
