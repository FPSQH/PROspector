'use client'

import { useEffect, useState, useCallback } from 'react'

interface Zone { id: string; nom: string; couleur: string; numero: number }
interface Session {
  id: string; date_prevue: string; heure_debut: string; heure_fin: string
  statut: 'planifiee' | 'realisee' | 'annulee' | 'non_realisee'
  zone_id: string; notes?: string
  nb_adresses_total: number; nb_adresses_visitees: number; nb_contacts: number
  zones_prospection?: Zone
}
interface Config { jours_semaine: number[]; heure_debut: string; duree_minutes: number }
interface Kpis { nbPlanifiees: number; nbRealisees: number; nbAnnulees: number; totalAdresses: number; visitees: number; totalContacts: number; pctRealise: number }

const STATUT_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  planifiee:    { label: 'Planifiée',    color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  realisee:     { label: 'Réalisée',     color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  annulee:      { label: 'Annulée',      color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb' },
  non_realisee: { label: 'Non réalisée', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
}
const MOIS_LABELS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_LABELS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const JOURS_COMPLETS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
}
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return String(Math.floor(total / 60)).padStart(2,'0') + ':' + String(total % 60).padStart(2,'0')
}

export default function PlanningPage() {
  const now = new Date()
  const [mois,  setMois]  = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [sessions,   setSessions]   = useState<Session[]>([])
  const [zones,      setZones]      = useState<Zone[]>([])
  const [kpis,       setKpis]       = useState<Kpis | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoneMenu,   setZoneMenu]   = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  // Config locale (pour le panneau)
  const [cfg, setCfg] = useState<Config>({ jours_semaine: [2,3,5], heure_debut: '10:00', duree_minutes: 120 })

  // Suivi saisie (pour session sélectionnée)
  const [editVisitees, setEditVisitees] = useState('')
  const [editContacts, setEditContacts] = useState('')
  const [editNotes,    setEditNotes]    = useState('')

  const load = useCallback(async (m: number, a: number) => {
    setLoading(true)
    const [pd, zd] = await Promise.all([
      fetch(`/api/planning?mois=${m}&annee=${a}`).then(r => r.json()),
      fetch('/api/zones').then(r => r.json()),
    ])
    setSessions(pd.planning ?? [])
    setKpis(pd.kpis ?? null)
    setCfg(pd.config ?? { jours_semaine:[2,3,5], heure_debut:'10:00', duree_minutes:120 })
    setZones(zd.zones ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load(mois, annee) }, [mois, annee, load])

  // Sync champs édition quand session sélectionnée change
  useEffect(() => {
    const s = sessions.find(x => x.id === selectedId)
    if (s) {
      setEditVisitees(String(s.nb_adresses_visitees ?? 0))
      setEditContacts(String(s.nb_contacts ?? 0))
      setEditNotes(s.notes ?? '')
    }
  }, [selectedId, sessions])

  const generate = async () => {
    setGenerating(true)
    const r = await fetch('/api/planning', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mois, annee })
    })
    const d = await r.json()
    setGenerating(false)
    if (d.planning) { setSessions(d.planning); setKpis(d.kpis ?? null) }
    else if (d.error) alert(d.error)
  }

  const resetMois = async () => {
    if (!confirm(`Supprimer les sessions planifiées de ${MOIS_LABELS[mois]} ${annee} ?`)) return
    await fetch(`/api/planning?mois=${mois}&annee=${annee}`, { method:'DELETE' })
    setSessions(s => s.filter(x => x.statut !== 'planifiee'))
  }

  const patch = async (id: string, body: object) => {
    const r = await fetch(`/api/planning/${id}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    })
    const d = await r.json()
    if (d.session) setSessions(s => s.map(x => x.id === id ? { ...x, ...d.session } : x))
    return d
  }

  const saveConfig = async () => {
    setSavingConfig(true)
    await fetch('/api/planning/config', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg)
    })
    setSavingConfig(false)
    setShowConfig(false)
  }

  const saveTracking = async (id: string) => {
    await patch(id, {
      nb_adresses_visitees: parseInt(editVisitees) || 0,
      nb_contacts:          parseInt(editContacts) || 0,
      notes:                editNotes,
    })
  }

  // Calendrier
  const today         = now.toISOString().split('T')[0]
  const daysInMonth   = new Date(annee, mois, 0).getDate()
  const firstDay      = new Date(annee, mois - 1, 1).getDay()
  const sessionsByDate = new Map<string, Session>()
  sessions.forEach(s => sessionsByDate.set(s.date_prevue, s))
  const selected = sessions.find(s => s.id === selectedId) ?? null

  const navMois = (delta: number) => {
    let m = mois + delta, a = annee
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMois(m); setAnnee(a); setSelectedId(null)
  }

  const heureFin = addMinutes(cfg.heure_debut, cfg.duree_minutes)

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#F8F7F4', fontFamily:'-apple-system,sans-serif' }}>

      {/* ── Colonne gauche ── */}
      <div style={{ width: selected ? 400 : 520, flexShrink:0, display:'flex', flexDirection:'column', borderRight:'1px solid #E8E6DF', background:'#fff', overflow:'hidden' }}>

        {/* Header mois */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6DF', display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={()=>navMois(-1)} style={{ background:'none', border:'1px solid #E8E6DF', borderRadius:6, padding:'3px 9px', cursor:'pointer' }}>←</button>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontWeight:700, fontSize:15 }}>{MOIS_LABELS[mois]} {annee}</div>
            <div style={{ fontSize:11, color:'#9ca3af' }}>{sessions.length} session{sessions.length>1?'s':''} · {kpis?.nbRealisees ?? 0} réalisée{(kpis?.nbRealisees??0)>1?'s':''}</div>
          </div>
          <button onClick={()=>navMois(1)}  style={{ background:'none', border:'1px solid #E8E6DF', borderRadius:6, padding:'3px 9px', cursor:'pointer' }}>→</button>
          <button onClick={()=>setShowConfig(!showConfig)} title="Paramètres"
            style={{ background: showConfig ? '#f0fdf4' : 'none', border:'1px solid #E8E6DF', borderRadius:6, padding:'3px 9px', cursor:'pointer', color: showConfig ? '#1D9E75' : '#6b7280', fontSize:16 }}>⚙</button>
        </div>

        {/* Panneau config */}
        {showConfig && (
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6DF', background:'#f8fffe' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:10 }}>Paramètres de prospection</div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#9ca3af', marginBottom:6 }}>JOURS DE PROSPECTION</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {[1,2,3,4,5,6,0].map(j => (
                  <button key={j} onClick={() => setCfg(c => ({
                    ...c,
                    jours_semaine: c.jours_semaine.includes(j)
                      ? c.jours_semaine.filter(x => x !== j)
                      : [...c.jours_semaine, j].sort()
                  }))}
                    style={{
                      padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: cfg.jours_semaine.includes(j) ? '#d1fae5' : '#f3f4f6',
                      color:      cfg.jours_semaine.includes(j) ? '#065f46' : '#6b7280',
                      border:     cfg.jours_semaine.includes(j) ? '1.5px solid #6ee7b7' : '1.5px solid #e5e7eb',
                    }}>{JOURS_COMPLETS[j].slice(0,3)}</button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:12, marginBottom:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>HEURE DÉBUT</div>
                <input type="time" value={cfg.heure_debut}
                  onChange={e => setCfg(c => ({...c, heure_debut: e.target.value}))}
                  style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #E8E6DF', fontSize:13 }}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>DURÉE (min)</div>
                <input type="number" value={cfg.duree_minutes} min={30} max={480} step={30}
                  onChange={e => setCfg(c => ({...c, duree_minutes: parseInt(e.target.value) || 120}))}
                  style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #E8E6DF', fontSize:13 }}/>
              </div>
            </div>
            <div style={{ fontSize:11, color:'#9ca3af', marginBottom:10 }}>
              Créneau : {cfg.heure_debut} – {heureFin}
            </div>
            <button onClick={saveConfig} disabled={savingConfig}
              style={{ width:'100%', padding:'8px', borderRadius:8, fontWeight:600, fontSize:13, background: savingConfig ? '#E8E6DF' : '#1D9E75', color:'#fff', border:'none', cursor: savingConfig ? 'not-allowed' : 'pointer' }}>
              {savingConfig ? 'Sauvegarde...' : '✓ Sauvegarder les paramètres'}
            </button>
          </div>
        )}

        {/* KPIs mois */}
        {kpis && sessions.length > 0 && (
          <div style={{ padding:'10px 16px', borderBottom:'1px solid #E8E6DF', display:'flex', gap:6, flexWrap:'wrap' }}>
            {[
              { label:'Planif.', nb: kpis.nbPlanifiees, color:'#0369a1', bg:'#e0f2fe' },
              { label:'Réal.',   nb: kpis.nbRealisees,  color:'#065f46', bg:'#d1fae5' },
              { label:'Annul.',  nb: kpis.nbAnnulees,   color:'#9ca3af', bg:'#f3f4f6' },
            ].map(s => (
              <span key={s.label} style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:s.bg, color:s.color }}>
                {s.nb} {s.label}
              </span>
            ))}
            {kpis.totalAdresses > 0 && (
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:'#f3f4f6', color:'#374151' }}>
                {kpis.visitees}/{kpis.totalAdresses} adresses ({kpis.pctRealise}%)
              </span>
            )}
            {kpis.totalContacts > 0 && (
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:'#fef3c7', color:'#92400e' }}>
                {kpis.totalContacts} contacts
              </span>
            )}
            <div style={{ flex:1 }}/>
            {sessions.length === 0 ? (
              <button onClick={generate} disabled={generating} style={{ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600, background: generating ? '#E8E6DF' : '#1D9E75', color:'#fff', border:'none', cursor: generating ? 'not-allowed' : 'pointer' }}>
                {generating ? 'Génération...' : '✦ Générer'}
              </button>
            ) : (
              <button onClick={resetMois} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, background:'#fff', color:'#9ca3af', border:'1px solid #E8E6DF', cursor:'pointer' }}>🗑 Reset</button>
            )}
          </div>
        )}

        {/* Calendrier */}
        <div style={{ padding:'10px 12px', flexShrink:0 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
            {JOURS_LABELS.map(j => <div key={j} style={{ textAlign:'center', fontSize:10, color:'#9ca3af', fontWeight:600 }}>{j}</div>)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day     = i + 1
              const dateStr = annee + '-' + String(mois).padStart(2,'0') + '-' + String(day).padStart(2,'0')
              const session = sessionsByDate.get(dateStr)
              const isToday = dateStr === today
              const isSel   = session?.id === selectedId
              return (
                <div key={day} onClick={() => session && setSelectedId(session.id === selectedId ? null : session.id)}
                  style={{ borderRadius:5, padding:'3px 2px', minHeight:32, textAlign:'center',
                    background: isSel ? (session?.zones_prospection?.couleur + '22') : isToday ? '#f0fdf4' : 'transparent',
                    border: isSel ? '2px solid '+(session?.zones_prospection?.couleur??'#1D9E75') : isToday ? '1px solid #bbf7d0' : '1px solid transparent',
                    cursor: session ? 'pointer' : 'default' }}>
                  <div style={{ fontSize:11, fontWeight: isToday?700:400, color: isToday?'#1D9E75':'#374151' }}>{day}</div>
                  {session && <div style={{ width:6, height:6, borderRadius:'50%', margin:'2px auto 0', background: session.zones_prospection?.couleur??'#9ca3af', opacity: ['annulee','non_realisee'].includes(session.statut)?0.3:1 }}/>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bouton génération (si pas de sessions) */}
        {sessions.length === 0 && !loading && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid #E8E6DF', textAlign:'center' }}>
            <button onClick={generate} disabled={generating} style={{ padding:'8px 20px', borderRadius:8, fontSize:13, fontWeight:600, background: generating?'#E8E6DF':'#1D9E75', color:'#fff', border:'none', cursor: generating?'not-allowed':'pointer' }}>
              {generating ? 'Génération...' : `✦ Générer ${MOIS_LABELS[mois]}`}
            </button>
          </div>
        )}

        {/* Liste sessions */}
        <div style={{ flex:1, overflowY:'auto', borderTop:'1px solid #E8E6DF' }}>
          {loading ? (
            <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:13 }}>Chargement...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📅</div>
              <div style={{ fontWeight:600, fontSize:14 }}>Aucune session ce mois</div>
              <div style={{ fontSize:12, marginTop:4 }}>Cliquez sur "Générer" pour créer le planning automatiquement</div>
            </div>
          ) : sessions.map(s => {
            const st  = STATUT_STYLE[s.statut] ?? STATUT_STYLE.planifiee
            const z   = s.zones_prospection
            const isS = s.id === selectedId
            const pct = s.nb_adresses_total > 0 ? Math.round(s.nb_adresses_visitees / s.nb_adresses_total * 100) : null
            return (
              <div key={s.id} onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                style={{ padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid #F0EDE6',
                  background: isS ? '#f8fffe' : 'transparent',
                  borderLeft: isS ? '3px solid '+(z?.couleur??'#1D9E75') : '3px solid transparent',
                  opacity: ['annulee','non_realisee'].includes(s.statut) ? 0.6 : 1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {z && <div style={{ width:9, height:9, borderRadius:'50%', background:z.couleur, flexShrink:0 }}/>}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:12, textTransform:'capitalize' }}>{fmtDate(s.date_prevue)}</div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>
                      {z ? `Zone ${z.numero} — ${z.nom}` : 'Zone non assignée'} · {s.heure_debut}–{s.heure_fin}
                      {pct !== null && s.statut === 'realisee' && <span style={{ marginLeft:6, color:'#1D9E75', fontWeight:600 }}>{pct}% visité</span>}
                      {s.nb_contacts > 0 && <span style={{ marginLeft:6, color:'#92400e' }}>{s.nb_contacts} contact{s.nb_contacts>1?'s':''}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:20, background:st.bg, color:st.color, flexShrink:0 }}>{st.label}</span>
                  {s.statut === 'planifiee' && s.date_prevue >= today && (
                    <a href="/terrain" onClick={e=>e.stopPropagation()} style={{ fontSize:10, padding:'2px 6px', borderRadius:20, background:'#1D9E75', color:'#fff', textDecoration:'none', flexShrink:0 }}>Go→</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Colonne droite : détail session ── */}
      {selected && <SelectedDetail
        selected={selected} zones={zones} zoneMenu={zoneMenu} setZoneMenu={setZoneMenu}
        today={today} editVisitees={editVisitees} setEditVisitees={setEditVisitees}
        editContacts={editContacts} setEditContacts={setEditContacts}
        editNotes={editNotes} setEditNotes={setEditNotes}
        onPatch={patch} onSave={saveTracking} onClose={() => setSelectedId(null)}
      />}
    </div>
  )
}

// Composant détail session extrait pour éviter le IIFE JSX
function SelectedDetail({ selected, zones, zoneMenu, setZoneMenu, today, editVisitees, setEditVisitees, editContacts, setEditContacts, editNotes, setEditNotes, onPatch, onSave, onClose }: any) {
  const st  = STATUT_STYLE[selected.statut] ?? STATUT_STYLE.planifiee
  const z   = selected.zones_prospection
  const pct = selected.nb_adresses_total > 0 ? Math.round(selected.nb_adresses_visitees / selected.nb_adresses_total * 100) : null
  return (
          <div style={{ flex:1, background:'#fff', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #E8E6DF', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              <button onClick={() => setSelectedId(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#9ca3af', padding:0 }}>←</button>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, textTransform:'capitalize' }}>{fmtDate(selected.date_prevue)}</div>
                <div style={{ fontSize:12, color:'#6b7280' }}>{selected.heure_debut} – {selected.heure_fin}</div>
              </div>
              {selected.statut === 'planifiee' && selected.date_prevue >= today && (
                <a href="/terrain" style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:600, background:'#1D9E75', color:'#fff', textDecoration:'none' }}>Démarrer →</a>
              )}
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>

              {/* Zone */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:6 }}>ZONE ASSIGNÉE</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, border:'1.5px solid #E8E6DF', background:'#F8F7F4' }}>
                  {z && <div style={{ width:12, height:12, borderRadius:'50%', background:z.couleur, flexShrink:0 }}/>}
                  <div style={{ flex:1, fontWeight:600, fontSize:13 }}>
                    {z ? `Zone ${z.numero} — ${z.nom}` : 'Non assignée'}
                  </div>
                  {selected.statut === 'planifiee' && (
                    <button onClick={() => setZoneMenu(zoneMenu === selected.id ? null : selected.id)}
                      style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #E8E6DF', background:'#fff', cursor:'pointer' }}>Changer</button>
                  )}
                </div>
                {zoneMenu === selected.id && (
                  <div style={{ marginTop:4, border:'1px solid #E8E6DF', borderRadius:8, overflow:'hidden', background:'#fff', boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
                    {zones.map(zo => (
                      <div key={zo.id} onClick={async () => { setZoneMenu(null); await patch(selected.id, {zone_id: zo.id}) }}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F0EDE6', background: zo.id===selected.zone_id?'#f0fdf4':'transparent' }}>
                        <div style={{ width:9, height:9, borderRadius:'50%', background:zo.couleur }}/>
                        <span style={{ fontSize:12 }}>Zone {zo.numero} — {zo.nom}</span>
                        {zo.id===selected.zone_id && <span style={{ marginLeft:'auto', color:'#1D9E75' }}>✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Statut */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:6 }}>STATUT</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {Object.entries(STATUT_STYLE).map(([k,v]) => (
                    <button key={k} onClick={() => patch(selected.id, {statut:k})}
                      style={{ padding:'5px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
                        background: selected.statut===k ? v.bg : '#fff',
                        color:      selected.statut===k ? v.color : '#6b7280',
                        border:     '1.5px solid '+(selected.statut===k ? v.border : '#E8E6DF') }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suivi (si réalisée ou passée) */}
              {(selected.statut === 'realisee' || selected.date_prevue < today) && (
                <div style={{ marginBottom:16, padding:'12px 14px', borderRadius:8, border:'1.5px solid #E8E6DF', background:'#f8fffe' }}>
                  <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:10 }}>SUIVI DE SESSION</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>
                        Adresses visitées {selected.nb_adresses_total > 0 && <span style={{ color:'#9ca3af' }}>/ {selected.nb_adresses_total}</span>}
                      </div>
                      <input type="number" value={editVisitees} min={0} max={999}
                        onChange={e => setEditVisitees(e.target.value)}
                        style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #E8E6DF', fontSize:14, fontWeight:600 }}/>
                      {pct !== null && <div style={{ fontSize:11, color:'#1D9E75', marginTop:3, fontWeight:600 }}>{pct}% de la zone</div>}
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Contacts établis</div>
                      <input type="number" value={editContacts} min={0} max={999}
                        onChange={e => setEditContacts(e.target.value)}
                        style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #E8E6DF', fontSize:14, fontWeight:600 }}/>
                    </div>
                  </div>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Notes</div>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                      placeholder="Observations, difficultés, points à noter..."
                      style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #E8E6DF', fontSize:12, resize:'none', boxSizing:'border-box' }}/>
                  </div>
                  <button onClick={() => saveTracking(selected.id)}
                    style={{ width:'100%', padding:'7px', borderRadius:8, fontSize:12, fontWeight:600, background:'#1D9E75', color:'#fff', border:'none', cursor:'pointer' }}>
                    ✓ Sauvegarder le suivi
                  </button>
                </div>
              )}

              {/* Export ICS */}
              <div>
                <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:6 }}>CALENDRIER</div>
                <button onClick={() => {
                  const date = selected.date_prevue.replace(/-/g,'')
                  const start = date + 'T' + selected.heure_debut.replace(':','') + '00'
                  const end   = date + 'T' + selected.heure_fin.replace(':','') + '00'
                  const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'
                  const title = `Prospection – ${z ? 'Zone '+z.numero+' '+z.nom : 'Zone'}`
                  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PROspector//FR','BEGIN:VEVENT',
                    'UID:session-'+selected.id+'@prospector','DTSTAMP:'+stamp,'DTSTART:'+start,'DTEND:'+end,
                    'SUMMARY:'+title,'DESCRIPTION:Session de prospection terrain','END:VEVENT','END:VCALENDAR'].join('
')
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(new Blob([ics], {type:'text/calendar'}))
                  a.download = 'session-prospection.ics'; a.click()
                }} style={{ padding:'7px 12px', borderRadius:8, fontSize:12, background:'#F0FDF4', color:'#15803d', border:'1px solid #bbf7d0', cursor:'pointer' }}>
                  📅 Exporter vers calendrier (.ics)
                </button>
              </div>

            </div>
          </div>
  )
}
