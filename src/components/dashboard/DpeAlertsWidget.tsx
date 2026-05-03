'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

const DPE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#d1fae5', text: '#065f46' }, B: { bg: '#d1fae5', text: '#065f46' },
  C: { bg: '#d1fae5', text: '#065f46' }, D: { bg: '#fef3c7', text: '#92400e' },
  E: { bg: '#fef3c7', text: '#92400e' }, F: { bg: '#fee2e2', text: '#991b1b' },
  G: { bg: '#fee2e2', text: '#991b1b' },
}

function typeBienLabel(t: string | null): string {
  if (!t) return ''
  return ({ maison: 'Maison', appartement: 'Appt', immeuble: 'Immeuble' } as any)[t.toLowerCase()] ?? t
}

interface DpeEntry { adresse: string; classe: string; type_bien: string | null; date: string }
interface CommuneAVerifier { code_insee: string; nom: string; code_postal: string; force_full: boolean }

export default function DpeAlertsWidget() {
  const [data, setData]             = useState<Record<string, DpeEntry[]>>({})
  const [total, setTotal]           = useState(0)
  const [since, setSince]           = useState('')
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState(false)
  const [nbNouveaux, setNbNouveaux] = useState(0)

  // Progression mise à jour
  const [majEnCours, setMajEnCours]   = useState(false)
  const [majProgress, setMajProgress] = useState({ done: 0, total: 0, commune: '' })

  const loadAlerts = useCallback(async () => {
    const r = await fetch('/api/alerts/dpe')
    const d = await r.json()
    setData(d.dpe ?? {}); setTotal(d.total ?? 0); setSince(d.since ?? '')
    setLoading(false)
  }, [])

  // Ingestion progressive commune par commune
  const runIngestions = useCallback(async (communes: CommuneAVerifier[]) => {
    if (!communes.length) return
    setMajEnCours(true)
    setMajProgress({ done: 0, total: communes.length, commune: communes[0]?.nom ?? '' })

    for (let i = 0; i < communes.length; i++) {
      const c = communes[i]
      setMajProgress({ done: i, total: communes.length, commune: c.nom })
      try {
        await fetch('/api/dpe/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code_postal: c.code_postal, code_insee: c.code_insee, force_full: c.force_full }),
        })
      } catch (_) {}
    }

    setMajProgress(p => ({ ...p, done: communes.length, commune: '' }))
    setMajEnCours(false)
    // Rafraîchir le widget après toutes les ingestions
    await loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    // 1. Charger les alertes immédiatement
    loadAlerts()

    // 2. Vérifier le secteur — récupérer les communes à mettre à jour
    fetch('/api/dpe/check-secteur')
      .then(r => r.json())
      .then(d => {
        setNbNouveaux(d.nb_nouveaux ?? 0)
        if (d.communes_a_verifier?.length > 0) {
          runIngestions(d.communes_a_verifier)
        }
      })
      .catch(() => {})
  }, [loadAlerts, runIngestions])

  const hasData  = total > 0
  const communes = Object.entries(data)

  return (
    <div style={{ background:'#fff', borderRadius:12, border: hasData ? '1px solid #d1fae5' : '1px solid #E8E6DF', marginBottom:16, overflow:'hidden' }}>

      {/* Bandeau mise à jour en cours */}
      {majEnCours && (
        <div style={{ background:'#fffbeb', borderBottom:'1px solid #fde68a', padding:'8px 20px', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid #f59e0b', borderTopColor:'transparent',
            animation:'spin 0.8s linear infinite', flexShrink:0 }} />
          <div style={{ fontSize:12, color:'#92400e' }}>
            Mise à jour DPE en cours
            {majProgress.commune && <> — <strong>{majProgress.commune}</strong></>}
            {' '}({majProgress.done}/{majProgress.total} communes)
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #F0EDE6', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>&#128203;</span>
            Nouveaux DPE — 30 derniers jours
            {hasData && (
              <span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#d1fae5', color:'#065f46' }}>
                {total} DPE
              </span>
            )}
            {nbNouveaux > 0 && (
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:'#fef3c7', color:'#92400e' }}>
                {nbNouveaux} depuis dernière connexion
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>
            {since ? `Du ${new Date(since).toLocaleDateString('fr-FR')} à aujourd'hui` : 'Dernier mois'}
          </div>
        </div>
        {hasData && (
          <Link href="/courriers"
            style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, background:'#1D9E75', color:'#fff', textDecoration:'none', flexShrink:0 }}>
            Générer courriers &#8594;
          </Link>
        )}
      </div>

      {/* Contenu */}
      {loading ? (
        <div style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>Chargement...</div>
      ) : !hasData ? (
        <div style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
          Aucun nouveau DPE ces 30 derniers jours sur votre secteur
        </div>
      ) : (
        <div>
          {(expanded ? communes : communes.slice(0, 4)).map(([ville, adrs]) => (
            <div key={ville} style={{ borderBottom:'1px solid #F0EDE6' }}>
              <div style={{ padding:'8px 20px', background:'#F8F7F4', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#374151' }}>{ville}</span>
                <span style={{ fontSize:11, padding:'1px 6px', borderRadius:20, background:'#d1fae5', color:'#065f46', fontWeight:600 }}>
                  {adrs.length}
                </span>
              </div>
              {(expanded ? adrs : adrs.slice(0, 4)).map((a, i) => {
                const colors = DPE_COLORS[a.classe] ?? { bg:'#F3F4F6', text:'#374151' }
                return (
                  <div key={i} style={{ padding:'7px 20px 7px 28px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #F8F7F4' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4, background:colors.bg, color:colors.text, flexShrink:0 }}>
                      {a.classe ?? '?'}
                    </span>
                    <span style={{ fontSize:12, color:'#374151', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {a.adresse}
                    </span>
                    {typeBienLabel(a.type_bien) && (
                      <span style={{ fontSize:11, color:'#6b7280', background:'#F3F4F6', padding:'1px 6px', borderRadius:4, flexShrink:0 }}>
                        {typeBienLabel(a.type_bien)}
                      </span>
                    )}
                    <span style={{ fontSize:11, color:'#9ca3af', flexShrink:0 }}>
                      {new Date(a.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )
              })}
              {!expanded && adrs.length > 4 && (
                <div style={{ padding:'4px 28px', fontSize:11, color:'#9ca3af' }}>+{adrs.length - 4} autres...</div>
              )}
            </div>
          ))}
          <button onClick={() => setExpanded(!expanded)}
            style={{ width:'100%', padding:'10px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#1D9E75', fontWeight:600 }}>
            {expanded ? 'Voir moins ▲' : `Voir tout (${total} DPE) ▼`}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
