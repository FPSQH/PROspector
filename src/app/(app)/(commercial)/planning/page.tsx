'use client'

import { useEffect, useState } from 'react'

interface Zone { id: string; nom: string; couleur: string; numero: number }
interface Session {
  id: string; date_prevue: string; heure_debut: string; heure_fin: string
  statut: 'planifiee' | 'realisee' | 'annulee' | 'non_realisee'
  zone_id: string; zones_prospection?: Zone
}

const STATUT_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  planifiee:     { label: 'Planifiee',     color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  realisee:      { label: 'Realisee',      color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  annulee:       { label: 'Annulee',       color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb' },
  non_realisee:  { label: 'Non realisee',  color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
}

const MOIS_LABELS = ['','Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre']
const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
}

export default function PlanningPage() {
  const now = new Date()
  const [mois,  setMois]  = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [sessions, setSessions] = useState<Session[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [loading,  setLoading]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoneMenu, setZoneMenu] = useState<string | null>(null) // session id en cours de changement de zone

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch('/api/planning?mois=' + mois + '&annee=' + annee).then(r => r.json()),
      fetch('/api/zones').then(r => r.json()),
    ]).then(([pd, zd]) => {
      if (!cancelled) {
        setSessions(pd.planning ?? [])
        setZones(zd.zones ?? [])
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mois, annee])

  const generate = async () => {
    setGenerating(true)
    const r = await fetch('/api/planning', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mois, annee })
    })
    const d = await r.json()
    setGenerating(false)
    if (d.planning) setSessions(d.planning)
    else if (d.error) alert(d.error)
  }

  const resetMois = async () => {
    if (!confirm('Supprimer les sessions planifiees de ' + MOIS_LABELS[mois] + ' ' + annee + ' ?')) return
    await fetch('/api/planning?mois=' + mois + '&annee=' + annee, { method: 'DELETE' })
    setSessions(s => s.filter(x => x.statut !== 'planifiee'))
  }

  const updateStatut = async (id: string, statut: string) => {
    const r = await fetch('/api/planning/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut })
    })
    const d = await r.json()
    if (d.session) setSessions(s => s.map(x => x.id === id ? { ...x, ...d.session } : x))
  }

  const changeZone = async (sessionId: string, zoneId: string) => {
    setZoneMenu(null)
    const r = await fetch('/api/planning/' + sessionId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone_id: zoneId })
    })
    const d = await r.json()
    if (d.session) setSessions(s => s.map(x => x.id === sessionId ? { ...x, ...d.session } : x))
  }

  // ── Calendrier ──────────────────────────────────────────────────────
  const daysInMonth = new Date(annee, mois, 0).getDate()
  const firstDay    = new Date(annee, mois - 1, 1).getDay()
  const sessionsByDate = new Map<string, Session>()
  sessions.forEach(s => sessionsByDate.set(s.date_prevue, s))

  const navMois = (delta: number) => {
    let m = mois + delta, a = annee
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMois(m); setAnnee(a); setSelectedId(null)
  }

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const today = now.toISOString().split('T')[0]

  const nbPlanifiees   = sessions.filter(s => s.statut === 'planifiee').length
  const nbRealisees    = sessions.filter(s => s.statut === 'realisee').length
  const nbAnnulees     = sessions.filter(s => s.statut === 'annulee' || s.statut === 'non_realisee').length

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#F8F7F4', fontFamily:'-apple-system,sans-serif' }}>

      {/* ── Colonne gauche : calendrier + stats ── */}
      <div style={{ width: selected ? 420 : 560, flexShrink:0, display:'flex', flexDirection:'column', borderRight:'1px solid #E8E6DF', background:'#fff', overflow:'hidden' }}>

        {/* Header mois */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #E8E6DF', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>navMois(-1)} style={{ background:'none', border:'1px solid #E8E6DF', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:16 }}>&#8592;</button>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontWeight:700, fontSize:16 }}>{MOIS_LABELS[mois]} {annee}</div>
            <div style={{ fontSize:11, color:'#9ca3af' }}>{sessions.length} session{sessions.length>1?'s':''} &nbsp;·&nbsp; {nbRealisees} realisee{nbRealisees>1?'s':''}</div>
          </div>
          <button onClick={()=>navMois(1)} style={{ background:'none', border:'1px solid #E8E6DF', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:16 }}>&#8594;</button>
        </div>

        {/* Grille calendrier */}
        <div style={{ padding:'12px 16px', flex:'none' }}>
          {/* Jours de la semaine */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
            {JOURS.map(j => <div key={j} style={{ textAlign:'center', fontSize:11, color:'#9ca3af', fontWeight:600 }}>{j}</div>)}
          </div>
          {/* Cases du calendrier */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day = i + 1
              const dateStr = annee + '-' + String(mois).padStart(2,'0') + '-' + String(day).padStart(2,'0')
              const session = sessionsByDate.get(dateStr)
              const isToday = dateStr === today
              const isSelected = session?.id === selectedId
              return (
                <div key={day}
                  onClick={() => session && setSelectedId(session.id === selectedId ? null : session.id)}
                  style={{
                    borderRadius:6, padding:'4px 2px', minHeight:36, textAlign:'center', position:'relative',
                    background: isSelected ? (session?.zones_prospection?.couleur + '33') : isToday ? '#f0fdf4' : 'transparent',
                    border: isSelected ? '2px solid ' + (session?.zones_prospection?.couleur ?? '#1D9E75') : isToday ? '1px solid #bbf7d0' : '1px solid transparent',
                    cursor: session ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontSize:12, fontWeight: isToday ? 700 : 400, color: isToday ? '#1D9E75' : '#374151' }}>{day}</div>
                  {session && (
                    <div style={{
                      width:8, height:8, borderRadius:'50%', margin:'2px auto 0',
                      background: session.zones_prospection?.couleur ?? '#9ca3af',
                      opacity: session.statut === 'annulee' || session.statut === 'non_realisee' ? 0.3 : 1,
                    }}/>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Stats + bouton génération */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid #E8E6DF', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {[
            { label:'Planifiees', nb: nbPlanifiees, color:'#0369a1', bg:'#e0f2fe' },
            { label:'Realisees',  nb: nbRealisees,  color:'#065f46', bg:'#d1fae5' },
            { label:'Annulees',   nb: nbAnnulees,   color:'#9ca3af', bg:'#f3f4f6' },
          ].map(s => (
            <span key={s.label} style={{ fontSize:12, fontWeight:600, padding:'3px 8px', borderRadius:20, background:s.bg, color:s.color }}>
              {s.nb} {s.label.toLowerCase()}
            </span>
          ))}
          <div style={{ flex:1 }}/>
          {sessions.length === 0 ? (
            <button onClick={generate} disabled={generating} style={{
              padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:600,
              background: generating ? '#E8E6DF' : '#1D9E75', color:'#fff', border:'none', cursor: generating ? 'not-allowed' : 'pointer'
            }}>{generating ? 'Generation...' : '✦ Generer ' + MOIS_LABELS[mois]}</button>
          ) : (
            <button onClick={resetMois} style={{
              padding:'7px 14px', borderRadius:8, fontSize:12,
              background:'#fff', color:'#9ca3af', border:'1px solid #E8E6DF', cursor:'pointer'
            }}>&#128465; Reset</button>
          )}
        </div>

        {/* Liste sessions */}
        <div style={{ flex:1, overflowY:'auto', borderTop:'1px solid #E8E6DF' }}>
          {loading ? (
            <div style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chargement...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>&#128197;</div>
              <div style={{ fontWeight:600 }}>Aucune session ce mois</div>
              <div style={{ fontSize:12, marginTop:4 }}>Cliquez sur "Generer" pour creer automatiquement les sessions</div>
            </div>
          ) : (
            sessions.map(s => {
              const st = STATUT_STYLE[s.statut] ?? STATUT_STYLE.planifiee
              const z  = s.zones_prospection
              const isS = s.id === selectedId
              const isPast = s.date_prevue < today
              return (
                <div key={s.id} onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                  style={{
                    padding:'10px 16px', cursor:'pointer', borderBottom:'1px solid #F0EDE6',
                    background: isS ? '#f8fffe' : 'transparent',
                    borderLeft: isS ? '3px solid ' + (z?.couleur ?? '#1D9E75') : '3px solid transparent',
                    opacity: (s.statut === 'annulee' || s.statut === 'non_realisee') ? 0.6 : 1,
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {z && <div style={{ width:10, height:10, borderRadius:'50%', background:z.couleur, flexShrink:0 }}/>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, textTransform:'capitalize' }}>{fmtDate(s.date_prevue)}</div>
                      <div style={{ fontSize:12, color:'#6b7280' }}>{z ? 'Zone ' + z.numero + ' — ' + z.nom : 'Zone non assignee'} · {s.heure_debut}–{s.heure_fin}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:st.bg, color:st.color, flexShrink:0 }}>{st.label}</span>
                    {!isPast && s.statut === 'planifiee' && (
                      <a href="/terrain" style={{ fontSize:11, padding:'2px 7px', borderRadius:20, background:'#1D9E75', color:'#fff', textDecoration:'none', flexShrink:0 }}>Go &#8594;</a>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Colonne droite : détail session ── */}
      {selected && (
        <div style={{ flex:1, background:'#fff', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Header */}
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #E8E6DF', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <button onClick={() => setSelectedId(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#9ca3af', padding:0 }}>&#8592;</button>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15, textTransform:'capitalize' }}>{fmtDate(selected.date_prevue)}</div>
              <div style={{ fontSize:12, color:'#6b7280' }}>{selected.heure_debut} – {selected.heure_fin}</div>
            </div>
            {selected.statut === 'planifiee' && selected.date_prevue >= today && (
              <a href="/terrain" style={{ padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:600, background:'#1D9E75', color:'#fff', textDecoration:'none' }}>
                Demarrer &#8594;
              </a>
            )}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
            {/* Zone assignée */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:8 }}>ZONE ASSIGNEE</div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:10, border:'1.5px solid #E8E6DF', background:'#F8F7F4' }}>
                {selected.zones_prospection && (
                  <div style={{ width:14, height:14, borderRadius:'50%', background:selected.zones_prospection.couleur, flexShrink:0 }}/>
                )}
                <div style={{ flex:1, fontWeight:600, fontSize:14 }}>
                  {selected.zones_prospection ? 'Zone ' + selected.zones_prospection.numero + ' — ' + selected.zones_prospection.nom : 'Non assignee'}
                </div>
                {selected.statut === 'planifiee' && (
                  <button onClick={() => setZoneMenu(zoneMenu === selected.id ? null : selected.id)}
                    style={{ fontSize:12, padding:'4px 10px', borderRadius:6, border:'1px solid #E8E6DF', background:'#fff', cursor:'pointer', color:'#5F5E5A' }}>
                    Changer
                  </button>
                )}
              </div>

              {/* Menu changement zone */}
              {zoneMenu === selected.id && (
                <div style={{ marginTop:6, border:'1px solid #E8E6DF', borderRadius:8, overflow:'hidden', background:'#fff', boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
                  {zones.map(z => (
                    <div key={z.id} onClick={() => changeZone(selected.id, z.id)}
                      style={{
                        display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                        cursor:'pointer', borderBottom:'1px solid #F0EDE6',
                        background: z.id === selected.zone_id ? '#f0fdf4' : 'transparent',
                      }}
                    >
                      <div style={{ width:10, height:10, borderRadius:'50%', background:z.couleur, flexShrink:0 }}/>
                      <span style={{ fontSize:13 }}>Zone {z.numero} — {z.nom}</span>
                      {z.id === selected.zone_id && <span style={{ marginLeft:'auto', color:'#1D9E75', fontSize:14 }}>&#10003;</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Statut */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:8 }}>STATUT</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {Object.entries(STATUT_STYLE).map(([k,v]) => (
                  <button key={k} onClick={() => updateStatut(selected.id, k)}
                    style={{
                      padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: selected.statut === k ? v.bg : '#fff',
                      color: selected.statut === k ? v.color : '#6b7280',
                      border: '1.5px solid ' + (selected.statut === k ? v.border : '#E8E6DF'),
                    }}
                  >{v.label}</button>
                ))}
              </div>
            </div>

            {/* ICS */}
            <div>
              <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:8 }}>CALENDRIER</div>
              <button onClick={() => {
                const z = selected.zones_prospection
                const date = selected.date_prevue.replace(/-/g,'')
                const start = date + 'T' + selected.heure_debut.replace(':','') + '00'
                const end   = date + 'T' + selected.heure_fin.replace(':','') + '00'
                const now2  = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'
                const title = 'Prospection – ' + (z ? 'Zone ' + z.numero + ' ' + z.nom : 'Zone')
                const ics = [
                  'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PROspector//FR','BEGIN:VEVENT',
                  'UID:session-' + selected.id + '@prospector',
                  'DTSTAMP:' + now2,
                  'DTSTART:' + start,
                  'DTEND:' + end,
                  'SUMMARY:' + title,
                  'DESCRIPTION:Session de prospection terrain\n' + selected.heure_debut + ' – ' + selected.heure_fin,
                  'END:VEVENT','END:VCALENDAR',
                ].join('\r\n')
                const blob = new Blob([ics], { type:'text/calendar' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = 'session-prospection.ics'
                a.click()
              }} style={{ padding:'8px 14px', borderRadius:8, fontSize:13, background:'#F0FDF4', color:'#15803d', border:'1px solid #bbf7d0', cursor:'pointer' }}>
                &#128197; Exporter vers calendrier (.ics)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
