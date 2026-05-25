'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SearchCommune } from '@/components/onboarding/SearchCommune'
import { SecteurMap } from '@/components/map/SecteurMap'

const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.10)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  success: '#22C55E',
  gold:    '#D97706',
}

interface Commune {
  id:          string
  code_insee:  string
  nom:         string
  code_postal: string
  departement: string
  chargee_at:  string | null
  nb_adresses?: number
}

interface CommuneResult {
  code_insee:  string
  nom:         string
  code_postal: string
  departement: string
  population:  number
}

export default function OnboardingPage() {
  const router = useRouter()
  const [communes, setCommunes]     = useState<Commune[]>([])
  const [loading, setLoading]       = useState(true)
  const [navigating, setNavigating] = useState(false)
  const pollingRef   = useRef<NodeJS.Timeout | null>(null)
  const attemptsRef  = useRef(0)
  const MAX_ATTEMPTS = 22

  const loadCommunes = useCallback(async () => {
    const res  = await fetch('/api/communes')
    const data = await res.json()
    setCommunes(data.communes ?? [])
    setLoading(false)
    return data.communes ?? []
  }, [])

  useEffect(() => { loadCommunes() }, [loadCommunes])

  useEffect(() => {
    const enCours = communes.filter(c => !c.chargee_at)
    if (enCours.length === 0) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; attemptsRef.current = 0 }
      return
    }
    if (pollingRef.current) return
    attemptsRef.current = 0
    pollingRef.current = setInterval(async () => {
      attemptsRef.current++
      try {
        const res  = await fetch('/api/communes/statut')
        const data = await res.json()
        if (data.statuts) {
          setCommunes(prev => prev.map(c => {
            const s = data.statuts.find((s: any) => s.code_insee === c.code_insee)
            if (!s) return c
            const effectivementChargee = !!s.chargee_at || s.nb_adresses > 0
            return { ...c, chargee_at: effectivementChargee ? (s.chargee_at ?? new Date().toISOString()) : c.chargee_at, nb_adresses: s.nb_adresses }
          }))
        }
      } catch { /* Erreur réseau — on continue */ }
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setCommunes(prev => prev.map(c => c.chargee_at ? c : { ...c, chargee_at: new Date().toISOString() }))
        clearInterval(pollingRef.current!); pollingRef.current = null; attemptsRef.current = 0
      }
    }, 4000)
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communes.map(c => c.code_insee).join(',')])

  const handleAdd = async (results: CommuneResult[]) => {
    for (const commune of results) {
      const res = await fetch('/api/communes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_insee: commune.code_insee, nom: commune.nom, code_postal: commune.code_postal, departement: commune.departement }),
      })
      const d = await res.json()
      const communeId = d.commune?.id
      if (communeId) {
        fetch('/api/ingestion/ban', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code_insee: commune.code_insee, commune_id: communeId }),
        }).catch(e => console.error('[BAN] ingest error:', e))
      }
    }
    await loadCommunes()
  }

  const handleRemove = async (codeInsee: string) => {
    await fetch(`/api/communes/${codeInsee}`, { method: 'DELETE' })
    await loadCommunes()
  }

  const communesInsee    = communes.filter(c => !!c.chargee_at || (c.nb_adresses ?? 0) > 0).map(c => c.code_insee)
  const nbEnCours        = communes.filter(c => !c.chargee_at).length
  const canGoToDashboard = communes.length > 0

  const handleDashboard = () => { setNavigating(true); router.push('/dashboard') }

  return (
    <div style={{ minHeight:'100dvh', background: C.bg }}>
      {/* Header */}
      <header style={{ background: C.card, borderBottom:`1px solid ${C.border}`, padding:'0 24px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8, background: C.primary, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
              <path d="M12 22V12M2 7l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontWeight:600, fontSize:'0.9375rem', color: C.text }}>PROspector</span>
        </div>
        {canGoToDashboard && (
          <button onClick={handleDashboard} disabled={navigating} style={{ padding:'7px 18px', borderRadius:8, background: navigating ? C.dim : C.primary, color:'#fff', border:'none', fontSize:'0.875rem', fontWeight:600, cursor: navigating ? 'not-allowed' : 'pointer' }}>
            {navigating ? 'Chargement…' : 'Accéder au Dashboard →'}
          </button>
        )}
      </header>

      <main style={{ display:'grid', gridTemplateColumns:'380px 1fr', height:'calc(100dvh - 56px)' }}>
        {/* Sidebar */}
        <aside style={{ borderRight:`1px solid ${C.border}`, background: C.card, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'24px 24px 16px', borderBottom:`1px solid ${C.border}` }}>
            <h1 style={{ fontSize:'1.125rem', fontWeight:700, color: C.text, margin:'0 0 4px' }}>Mon secteur</h1>
            <p style={{ fontSize:'0.8rem', color: C.muted, margin:0, lineHeight:1.4 }}>
              Ajoutez les communes de votre zone de prospection.
            </p>
          </div>

          <div style={{ padding:'16px 24px', borderBottom:`1px solid ${C.border}` }}>
            <SearchCommune onAdd={handleAdd} communesExistantes={communes.map(c => c.code_insee)} />
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:24, color: C.muted, fontSize:'0.875rem' }}>Chargement…</div>
            ) : communes.length === 0 ? (
              <div style={{ padding:'32px 24px', textAlign:'center' }}>
                <div style={{ fontSize:'2rem', marginBottom:12 }}>🏘️</div>
                <p style={{ fontSize:'0.875rem', color: C.mid, lineHeight:1.5 }}>Aucune commune dans votre secteur.</p>
                <p style={{ fontSize:'0.8rem', color: C.muted }}>Recherchez par nom ou code postal.</p>
              </div>
            ) : (
              <>
                <div style={{ padding:'10px 24px 6px', fontSize:'0.75rem', color: C.muted }}>
                  {communes.length} commune{communes.length > 1 ? 's' : ''} dans le secteur
                  {nbEnCours > 0 && <span style={{ color:'#FBBF24', marginLeft:6 }}>· {nbEnCours} en chargement BAN…</span>}
                </div>
                {communes.map(commune => {
                  const chargee = !!commune.chargee_at
                  return (
                    <div key={commune.code_insee} style={{ padding:'12px 24px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background: chargee ? '#22c55e' : '#f59e0b', boxShadow: chargee ? '0 0 0 3px rgba(34,197,94,0.15)' : '0 0 0 3px rgba(245,158,11,0.15)' }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:500, fontSize:'0.9rem', color: C.text }}>{commune.nom}</div>
                        <div style={{ fontSize:'0.75rem', color: C.muted, marginTop:2 }}>
                          {commune.code_postal} · Dép. {commune.departement}
                          {chargee && commune.nb_adresses != null && (
                            <> · <strong style={{ color: C.mid }}>{commune.nb_adresses.toLocaleString('fr-FR')} adresses</strong></>
                          )}
                        </div>
                      </div>
                      {!chargee && (
                        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.72rem', color:'#FBBF24', fontWeight:500 }}>
                          <div style={{ width:11, height:11, borderRadius:'50%', border:'2px solid #f59e0b', borderTopColor:'transparent', animation:'spin 0.7s linear infinite' }}/>
                          BAN…
                        </div>
                      )}
                      <button
                        onClick={() => handleRemove(commune.code_insee)}
                        style={{ width:28, height:28, borderRadius:6, border:`1px solid ${C.border}`, background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color: C.muted, flexShrink:0 }}
                        onMouseEnter={e => {
                          const b = e.currentTarget as HTMLButtonElement
                          b.style.background = 'rgba(239,68,68,0.1)'; b.style.borderColor = 'rgba(239,68,68,0.3)'; b.style.color = '#EF4444'
                        }}
                        onMouseLeave={e => {
                          const b = e.currentTarget as HTMLButtonElement
                          b.style.background = 'transparent'; b.style.borderColor = C.border; b.style.color = C.muted
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          <div style={{ padding:'16px 24px', borderTop:`1px solid ${C.border}` }}>
            {communes.length === 0 ? (
              <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}`, fontSize:'0.8rem', color: C.muted, textAlign:'center' }}>
                Ajoutez au moins une commune pour continuer
              </div>
            ) : (
              <button onClick={handleDashboard} disabled={navigating} style={{ width:'100%', padding:'10px', borderRadius:9, border:'none', background: navigating ? C.dim : C.primary, color:'#fff', fontWeight:600, fontSize:'0.9rem', cursor: navigating ? 'not-allowed' : 'pointer' }}>
                {navigating ? 'Chargement…' : nbEnCours > 0
                  ? `Dashboard (${nbEnCours} BAN en cours…)`
                  : 'Accéder au Dashboard →'
                }
              </button>
            )}
          </div>
        </aside>

        <div style={{ overflow:'hidden' }}>
          <SecteurMap communesInsee={communesInsee} height="100%" />
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
