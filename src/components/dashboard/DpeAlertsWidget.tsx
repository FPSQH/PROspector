'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const DPE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#d1fae5', text: '#065f46' },
  B: { bg: '#d1fae5', text: '#065f46' },
  C: { bg: '#d1fae5', text: '#065f46' },
  D: { bg: '#fef3c7', text: '#92400e' },
  E: { bg: '#fef3c7', text: '#92400e' },
  F: { bg: '#fee2e2', text: '#991b1b' },
  G: { bg: '#fee2e2', text: '#991b1b' },
}

function typeBienLabel(t: string | null): string {
  if (!t) return ''
  const map: Record<string, string> = {
    maison: 'Maison', appartement: 'Appt', immeuble: 'Immeuble',
  }
  return map[t.toLowerCase()] ?? t
}

interface DpeEntry {
  adresse: string; classe: string; type_bien: string | null; date: string
}

export default function DpeAlertsWidget() {
  const [data, setData]         = useState<Record<string, DpeEntry[]>>({})
  const [total, setTotal]       = useState(0)
  const [since, setSince]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // Vérification DPE secteur à la connexion (fire & forget)
    fetch('/api/dpe/check-secteur').catch(() => {})
    // Charger les DPE du mois
    fetch('/api/alerts/dpe')
      .then(r => r.json())
      .then(d => { setData(d.dpe ?? {}); setTotal(d.total ?? 0); setSince(d.since ?? ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const hasData  = total > 0
  const communes = Object.entries(data)

  if (loading) return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6DF', padding:'16px 20px', marginBottom:16 }}>
      <div style={{ fontSize:13, color:'#9ca3af' }}>Chargement des DPE récents...</div>
    </div>
  )

  return (
    <div style={{ background:'#fff', borderRadius:12, border: hasData ? '1px solid #d1fae5' : '1px solid #E8E6DF', marginBottom:16, overflow:'hidden' }}>

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
      {!hasData ? (
        <div style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
          Aucun nouveau DPE ces 30 derniers jours sur votre secteur
        </div>
      ) : (
        <div>
          {(expanded ? communes : communes.slice(0, 4)).map(([ville, adrs]) => (
            <div key={ville} style={{ borderBottom:'1px solid #F0EDE6' }}>
              {/* Titre ville */}
              <div style={{ padding:'8px 20px', background:'#F8F7F4', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#374151' }}>{ville}</span>
                <span style={{ fontSize:11, padding:'1px 6px', borderRadius:20, background:'#d1fae5', color:'#065f46', fontWeight:600 }}>
                  {adrs.length}
                </span>
              </div>
              {/* Lignes DPE */}
              {(expanded ? adrs : adrs.slice(0, 4)).map((a, i) => {
                const colors = DPE_COLORS[a.classe] ?? { bg: '#F3F4F6', text: '#374151' }
                const typeLbl = typeBienLabel(a.type_bien)
                return (
                  <div key={i} style={{ padding:'7px 20px 7px 28px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #F8F7F4' }}>
                    {/* Badge DPE */}
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4, background:colors.bg, color:colors.text, flexShrink:0 }}>
                      {a.classe ?? '?'}
                    </span>
                    {/* Adresse */}
                    <span style={{ fontSize:12, color:'#374151', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {a.adresse}
                    </span>
                    {/* Type logement */}
                    {typeLbl && (
                      <span style={{ fontSize:11, color:'#6b7280', background:'#F3F4F6', padding:'1px 6px', borderRadius:4, flexShrink:0 }}>
                        {typeLbl}
                      </span>
                    )}
                    {/* Date */}
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

          <button
            onClick={() => setExpanded(!expanded)}
            style={{ width:'100%', padding:'10px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#1D9E75', fontWeight:600 }}>
            {expanded ? 'Voir moins ▲' : `Voir tout (${total} DPE) ▼`}
          </button>
        </div>
      )}
    </div>
  )
}
