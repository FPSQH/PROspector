'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface DpeEntry {
  adresse: string; code_postal: string; commune: string; classe: string; date: string
}

export default function DpeAlertsWidget() {
  const [data, setData]     = useState<Record<string, DpeEntry[]>>({})
  const [total, setTotal]   = useState(0)
  const [since, setSince]   = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/alerts/dpe')
      .then(r => r.json())
      .then(d => { setData(d.dpe ?? {}); setTotal(d.total ?? 0); setSince(d.since ?? ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const sinceLabel = since ? new Date(since).toLocaleDateString('fr-FR') : ''
  const communes = Object.entries(data)
  const hasData = total > 0

  if (loading) return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6DF', padding:'16px 20px', marginBottom:16 }}>
      <div style={{ fontSize:13, color:'#9ca3af' }}>Chargement des DPE recents...</div>
    </div>
  )

  return (
    <div style={{ background:'#fff', borderRadius:12, border: hasData ? '1px solid #d1fae5' : '1px solid #E8E6DF', marginBottom:16, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #F0EDE6', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>&#128203;</span>
            Nouveaux DPE sur votre secteur
            {hasData && <span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#d1fae5', color:'#065f46' }}>{total} DPE</span>}
          </div>
          {sinceLabel && <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Depuis le {sinceLabel}</div>}
        </div>
        {hasData && (
          <Link href="/zones?filter=dpe_recent"
            style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, background:'#1D9E75', color:'#fff', textDecoration:'none', flexShrink:0 }}>
            Voir sur la carte &#8594;
          </Link>
        )}
      </div>

      {/* Contenu */}
      {!hasData ? (
        <div style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
          Aucun nouveau DPE depuis votre derniere alerte
        </div>
      ) : (
        <div>
          {(expanded ? communes : communes.slice(0, 3)).map(([ville, adrs]) => (
            <div key={ville} style={{ borderBottom:'1px solid #F0EDE6' }}>
              <div style={{ padding:'8px 20px', background:'#F8F7F4', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#374151' }}>{ville}</span>
                <span style={{ fontSize:11, padding:'1px 6px', borderRadius:20, background:'#d1fae5', color:'#065f46', fontWeight:600 }}>{adrs.length}</span>
              </div>
              {adrs.slice(0, expanded ? 999 : 3).map((a, i) => (
                <div key={i} style={{ padding:'6px 20px 6px 32px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #F8F7F4' }}>
                  <span style={{ fontSize:13, color:'#374151', flex:1 }}>{a.adresse}</span>
                  <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:4,
                    background: a.classe <= 'C' ? '#d1fae5' : a.classe <= 'E' ? '#fef3c7' : '#fee2e2',
                    color: a.classe <= 'C' ? '#065f46' : a.classe <= 'E' ? '#92400e' : '#991b1b' }}>
                    {a.classe ?? '?'}
                  </span>
                  <span style={{ fontSize:11, color:'#9ca3af' }}>{new Date(a.date).toLocaleDateString('fr-FR')}</span>
                </div>
              ))}
              {!expanded && adrs.length > 3 && (
                <div style={{ padding:'4px 32px', fontSize:12, color:'#9ca3af' }}>+{adrs.length - 3} autres...</div>
              )}
            </div>
          ))}
          {(communes.length > 3 || !expanded) && (
            <button onClick={() => setExpanded(!expanded)}
              style={{ width:'100%', padding:'10px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#1D9E75', fontWeight:600 }}>
              {expanded ? 'Voir moins' : 'Voir tout (' + total + ' DPE)'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
