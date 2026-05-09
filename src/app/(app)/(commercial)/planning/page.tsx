'use client'

import { useEffect, useState, useCallback } from 'react'

const STATUT = {
  planifiee:    { label: 'Planifiée',    color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  realisee:     { label: 'Réalisée',     color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  annulee:      { label: 'Annulée',      color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb' },
  non_realisee: { label: 'Non réalisée', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
} as const

const MOIS       = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_COURTS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const JOURS_LONGS  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function addMin(t: string|undefined, m: number): string {
  if (!t) return ''
  const [h, mn] = t.split(':').map(Number)
  const tot = h*60+mn+m
  return `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`
}
function fmtDate(s: string|undefined): string {
  if (!s) return ''
  return new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})
}

interface Zone { id:string; nom:string; couleur:string; numero:number }
interface Session {
  id:string; date_prevue:string; heure_debut:string; heure_fin:string
  statut:string; zone_id:string; notes?:string
  nb_adresses_total:number; nb_adresses_visitees:number; nb_contacts:number
  nb_maisons_qualifiees:number; nb_immeubles_qualifies:number
  nb_syndics_qualifies:number; nb_adresses_supprimees:number
  zones_prospection?: Zone
}
interface Cfg {
  jours_semaine:number[]; heure_debut:string; duree_minutes:number
  date_debut:string; nb_sessions_par_jour:number
}
interface Kpis { nbPlanifiees:number; nbRealisees:number; nbAnnulees:number; totalAdresses:number; visitees:number; totalContacts:number; pctRealise:number }

export default function PlanningPage() {
  const now   = new Date()
  const today = now.toISOString().split('T')[0]

  const [mois,       setMois]       = useState(now.getMonth()+1)
  const [annee,      setAnnee]      = useState(now.getFullYear())
  const [sessions,   setSessions]   = useState<Session[]>([])
  const [zones,      setZones]      = useState<Zone[]>([])
  const [kpis,       setKpis]       = useState<Kpis|null>(null)
  const [cfg,        setCfg]        = useState<Cfg>({ jours_semaine:[2,3,5], heure_debut:'10:00', duree_minutes:120, date_debut:'', nb_sessions_par_jour:1 })
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showCfg,    setShowCfg]    = useState(false)
  const [savingCfg,  setSavingCfg]  = useState(false)
  const [selId,      setSelId]      = useState<string|null>(null)
  const [zoneMenu,   setZoneMenu]   = useState(false)
  // Suivi
  const [editV,    setEditV]    = useState('')
  const [editC,    setEditC]    = useState('')
  const [editN,    setEditN]    = useState('')
  const [editM,    setEditM]    = useState('')  // maisons
  const [editI,    setEditI]    = useState('')  // immeubles
  const [editSy,   setEditSy]   = useState('')  // syndics
  const [editSup,  setEditSup]  = useState('')  // adresses supprimées
  // Reporter
  const [reporterOpen,  setReporterOpen]  = useState(false)
  const [reporterJours, setReporterJours] = useState(7)
  const [reporting,     setReporting]     = useState(false)

  const sel = sessions.find(s=>s.id===selId)??null

  const load = useCallback(async(m:number,a:number)=>{
    setLoading(true)
    const [pd,zd] = await Promise.all([
      fetch(`/api/planning?mois=${m}&annee=${a}`).then(r=>r.json()),
      fetch('/api/zones').then(r=>r.json()),
    ])
    setSessions(pd.planning??[])
    setKpis(pd.kpis??null)
    if (pd.config) setCfg({
      jours_semaine:      pd.config.jours    ?? [2,3,5],
      heure_debut:        pd.config.debut    ?? '10:00',
      duree_minutes:      pd.config.duree    ?? 120,
      date_debut:         pd.config.date_debut ?? '',
      nb_sessions_par_jour: pd.config.nb_sessions_par_jour ?? 1,
    })
    setZones(zd.zones??[])
    setLoading(false)
  },[])

  useEffect(()=>{load(mois,annee)},[mois,annee,load])

  useEffect(()=>{
    if (sel) {
      setEditV(String(sel.nb_adresses_visitees??0))
      setEditC(String(sel.nb_contacts??0))
      setEditN(sel.notes??'')
      setEditM(String(sel.nb_maisons_qualifiees??0))
      setEditI(String(sel.nb_immeubles_qualifies??0))
      setEditSy(String(sel.nb_syndics_qualifies??0))
      setEditSup(String(sel.nb_adresses_supprimees??0))
      setReporterOpen(false)
    }
  },[selId]) // eslint-disable-line

  const patch = async(id:string,body:object)=>{
    const r = await fetch(`/api/planning/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const d = await r.json()
    if (d.session) setSessions(s=>s.map(x=>x.id===id?{...x,...d.session}:x))
  }

  const generate = async()=>{
    setGenerating(true)
    const r = await fetch('/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mois,annee})})
    const d = await r.json()
    setGenerating(false)
    if (d.planning){setSessions(d.planning);setKpis(d.kpis??null)}
    else if (d.error) alert(d.error)
  }

  const resetMois = async()=>{
    if (!confirm(`Supprimer les sessions planifiées de ${MOIS[mois]} ${annee} ?`)) return
    await fetch(`/api/planning?mois=${mois}&annee=${annee}`,{method:'DELETE'})
    setSessions(s=>s.filter(x=>x.statut!=='planifiee'))
  }

  const saveCfg = async()=>{
    setSavingCfg(true)
    await fetch('/api/planning/config',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        jours_semaine:      cfg.jours_semaine,
        heure_debut:        cfg.heure_debut,
        duree_minutes:      cfg.duree_minutes,
        date_debut:         cfg.date_debut || null,
        nb_sessions_par_jour: cfg.nb_sessions_par_jour,
      })
    })
    setSavingCfg(false); setShowCfg(false)
  }

  const saveTracking = async()=>{
    if (!sel) return
    await patch(sel.id,{
      nb_adresses_visitees:   parseInt(editV)||0,
      nb_contacts:            parseInt(editC)||0,
      notes:                  editN,
      nb_maisons_qualifiees:  parseInt(editM)||0,
      nb_immeubles_qualifies: parseInt(editI)||0,
      nb_syndics_qualifies:   parseInt(editSy)||0,
      nb_adresses_supprimees: parseInt(editSup)||0,
    })
  }

  const reporter = async()=>{
    if (!sel || !reporterJours) return
    setReporting(true)
    const r = await fetch('/api/planning',{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date_reference:sel.date_prevue,nb_jours:reporterJours})})
    const d = await r.json()
    setReporting(false)
    setReporterOpen(false)
    if (d.nb > 0) {
      alert(`${d.nb} session${d.nb>1?'s':''} reportée${d.nb>1?'s':''} de ${reporterJours} jour${reporterJours>1?'s':''}`)
      load(mois,annee)
    }
  }

  const navMois=(delta:number)=>{
    let m=mois+delta,a=annee
    if(m>12){m=1;a++} if(m<1){m=12;a--}
    setMois(m);setAnnee(a);setSelId(null)
  }

  const daysInMonth = new Date(annee,mois,0).getDate()
  const firstDay    = new Date(annee,mois-1,1).getDay()
  const byDate      = new Map<string,Session[]>()
  for (const s of sessions) {
    const arr = byDate.get(s.date_prevue) ?? []
    arr.push(s)
    byDate.set(s.date_prevue, arr)
  }
  const heureFin = cfg?.heure_debut ? addMin(cfg.heure_debut, cfg.duree_minutes) : ''

  // Calcul intervalle de passage
  const seancesParSemaine = (cfg.jours_semaine?.length??0) * (cfg.nb_sessions_par_jour??1)
  const intervalSemaines  = zones.length > 0 && seancesParSemaine > 0
    ? Math.ceil(zones.length / seancesParSemaine)
    : null

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#F8F7F4',fontFamily:'-apple-system,sans-serif'}}>

      {/* Colonne gauche */}
      <div style={{width:sel?400:520,flexShrink:0,display:'flex',flexDirection:'column',borderRight:'1px solid #E8E6DF',background:'#fff',overflow:'hidden'}}>

        {/* Header */}
        <div style={{padding:'13px 14px',borderBottom:'1px solid #E8E6DF',display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>navMois(-1)} style={{background:'none',border:'1px solid #E8E6DF',borderRadius:6,padding:'3px 9px',cursor:'pointer'}}>←</button>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontWeight:700,fontSize:15}}>{MOIS[mois]} {annee}</div>
            <div style={{fontSize:11,color:'#9ca3af'}}>{sessions.length} session{sessions.length>1?'s':''} · {kpis?.nbRealisees??0} réalisée{(kpis?.nbRealisees??0)>1?'s':''}</div>
          </div>
          <button onClick={()=>navMois(1)}  style={{background:'none',border:'1px solid #E8E6DF',borderRadius:6,padding:'3px 9px',cursor:'pointer'}}>→</button>
          <button onClick={()=>setShowCfg(!showCfg)} style={{background:showCfg?'#f0fdf4':'none',border:'1px solid #E8E6DF',borderRadius:6,padding:'3px 9px',cursor:'pointer',color:showCfg?'#1D9E75':'#6b7280',fontSize:16}}>⚙</button>
        </div>

        {/* Panneau config */}
        {showCfg && (
          <div style={{padding:'13px 14px',borderBottom:'1px solid #E8E6DF',background:'#f8fffe',overflowY:'auto',maxHeight:420}}>
            <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:10}}>Paramètres du planning</div>

            {/* Jours */}
            <div style={{fontSize:11,color:'#9ca3af',marginBottom:5}}>JOURS DE PROSPECTION</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12}}>
              {[1,2,3,4,5,6,0].map(j=>(
                <button key={j} onClick={()=>setCfg(c=>({...c,jours_semaine:c.jours_semaine.includes(j)?c.jours_semaine.filter(x=>x!==j):[...c.jours_semaine,j].sort()}))}
                  style={{padding:'3px 9px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
                    background:cfg.jours_semaine.includes(j)?'#d1fae5':'#f3f4f6',
                    color:cfg.jours_semaine.includes(j)?'#065f46':'#6b7280',
                    border:'1.5px solid '+(cfg.jours_semaine.includes(j)?'#6ee7b7':'#e5e7eb')}}>
                  {JOURS_LONGS[j].slice(0,3)}
                </button>
              ))}
            </div>

            {/* Heure + durée */}
            <div style={{display:'flex',gap:10,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:'#9ca3af',marginBottom:3}}>HEURE DÉBUT</div>
                <input type="time" value={cfg.heure_debut} onChange={e=>setCfg(c=>({...c,heure_debut:e.target.value}))}
                  style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:13}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:'#9ca3af',marginBottom:3}}>DURÉE (min)</div>
                <input type="number" value={cfg.duree_minutes} min={30} max={480} step={30}
                  onChange={e=>setCfg(c=>({...c,duree_minutes:parseInt(e.target.value)||120}))}
                  style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:13}}/>
              </div>
            </div>
            <div style={{fontSize:11,color:'#9ca3af',marginBottom:12}}>{cfg.heure_debut} – {heureFin}</div>

            {/* Date de début */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:'#9ca3af',marginBottom:3}}>DATE DE DÉBUT (optionnel)</div>
              <input type="date" value={cfg.date_debut} onChange={e=>setCfg(c=>({...c,date_debut:e.target.value}))}
                style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:13}}/>
              <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>Laissez vide pour partir du 1er du mois</div>
            </div>

            {/* Séances par jour */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:'#9ca3af',marginBottom:5}}>SÉANCES PAR JOUR</div>
              <div style={{display:'flex',gap:6}}>
                {[1,2,3].map(n=>(
                  <button key={n} onClick={()=>setCfg(c=>({...c,nb_sessions_par_jour:n}))}
                    style={{flex:1,padding:'5px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',
                      background:cfg.nb_sessions_par_jour===n?'#1D9E75':'#f3f4f6',
                      color:cfg.nb_sessions_par_jour===n?'#fff':'#374151',
                      border:'1.5px solid '+(cfg.nb_sessions_par_jour===n?'#1D9E75':'#e5e7eb')}}>
                    {n}
                  </button>
                ))}
              </div>
              {cfg.nb_sessions_par_jour > 1 && (
                <div style={{fontSize:10,color:'#6b7280',marginTop:4}}>
                  {cfg.nb_sessions_par_jour} séances/jour · ex: {cfg.heure_debut}–{heureFin}
                  {cfg.nb_sessions_par_jour >= 2 && ` puis ${addMin(cfg.heure_debut, cfg.duree_minutes+60)}–${addMin(cfg.heure_debut, cfg.duree_minutes*2+60)}`}
                </div>
              )}
            </div>

            {/* Intervalle calculé */}
            {intervalSemaines !== null && (
              <div style={{marginBottom:10,padding:'8px 10px',borderRadius:8,background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
                <div style={{fontSize:11,fontWeight:600,color:'#065f46'}}>
                  🔄 {zones.length} zones · {seancesParSemaine} séance{seancesParSemaine>1?'s':''}/semaine
                </div>
                <div style={{fontSize:11,color:'#065f46',marginTop:2}}>
                  → 1 passage complet toutes les <strong>{intervalSemaines} semaine{intervalSemaines>1?'s':''}</strong>
                </div>
              </div>
            )}

            <button onClick={saveCfg} disabled={savingCfg}
              style={{width:'100%',padding:'7px',borderRadius:8,fontSize:12,fontWeight:600,background:savingCfg?'#E8E6DF':'#1D9E75',color:'#fff',border:'none',cursor:savingCfg?'not-allowed':'pointer'}}>
              {savingCfg?'Sauvegarde...':'✓ Sauvegarder'}
            </button>
          </div>
        )}

        {/* KPIs */}
        {kpis && sessions.length>0 && (
          <div style={{padding:'8px 14px',borderBottom:'1px solid #E8E6DF',display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
            {([['Planif.',kpis.nbPlanifiees,'#0369a1','#e0f2fe'],['Réal.',kpis.nbRealisees,'#065f46','#d1fae5'],['Annul.',kpis.nbAnnulees,'#9ca3af','#f3f4f6']] as [string,number,string,string][]).map(([l,n,c,b])=>(
              <span key={l} style={{fontSize:11,fontWeight:600,padding:'2px 6px',borderRadius:20,background:b,color:c}}>{n} {l}</span>
            ))}
            {kpis.totalAdresses>0 && <span style={{fontSize:11,padding:'2px 6px',borderRadius:20,background:'#f3f4f6',color:'#374151',fontWeight:600}}>{kpis.visitees}/{kpis.totalAdresses} ({kpis.pctRealise}%)</span>}
            {kpis.totalContacts>0 && <span style={{fontSize:11,padding:'2px 6px',borderRadius:20,background:'#fef3c7',color:'#92400e',fontWeight:600}}>{kpis.totalContacts} contacts</span>}
            <div style={{flex:1}}/>
            <button onClick={resetMois} style={{padding:'4px 10px',borderRadius:8,fontSize:11,background:'#fff',color:'#9ca3af',border:'1px solid #E8E6DF',cursor:'pointer'}}>🗑 Reset</button>
          </div>
        )}

        {/* Calendrier */}
        <div style={{padding:'10px 12px',flexShrink:0}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:3}}>
            {JOURS_COURTS.map(j=><div key={j} style={{textAlign:'center',fontSize:10,color:'#9ca3af',fontWeight:600}}>{j}</div>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
            {Array(firstDay).fill(null).map((_,i)=><div key={'e'+i}/>)}
            {Array(daysInMonth).fill(null).map((_,i)=>{
              const day=i+1
              const ds=`${annee}-${String(mois).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const daySessions = byDate.get(ds) ?? []
              const s = daySessions[0]
              const isTod=ds===today, isSel=daySessions.some(x=>x.id===selId)
              return (
                <div key={day} onClick={()=>s&&setSelId(isSel?null:s.id)}
                  style={{borderRadius:5,padding:'3px 2px',minHeight:32,textAlign:'center',
                    background:isSel?(s?.zones_prospection?.couleur+'22'):isTod?'#f0fdf4':'transparent',
                    border:isSel?'2px solid '+(s?.zones_prospection?.couleur??'#1D9E75'):isTod?'1px solid #bbf7d0':'1px solid transparent',
                    cursor:s?'pointer':'default'}}>
                  <div style={{fontSize:11,fontWeight:isTod?700:400,color:isTod?'#1D9E75':'#374151'}}>{day}</div>
                  <div style={{display:'flex',justifyContent:'center',gap:2,marginTop:1}}>
                    {daySessions.slice(0,3).map(ss=>(
                      <div key={ss.id} style={{width:5,height:5,borderRadius:'50%',background:ss.zones_prospection?.couleur??'#9ca3af',opacity:['annulee','non_realisee'].includes(ss.statut)?0.3:1}}/>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bouton générer */}
        {sessions.length===0&&!loading&&(
          <div style={{padding:'10px 14px',borderTop:'1px solid #E8E6DF',textAlign:'center'}}>
            <button onClick={generate} disabled={generating}
              style={{padding:'7px 18px',borderRadius:8,fontSize:13,fontWeight:600,background:generating?'#E8E6DF':'#1D9E75',color:'#fff',border:'none',cursor:generating?'not-allowed':'pointer'}}>
              {generating?'Génération...':`✦ Générer ${MOIS[mois]}`}
            </button>
          </div>
        )}

        {/* Liste sessions */}
        <div style={{flex:1,overflowY:'auto',borderTop:'1px solid #E8E6DF'}}>
          {loading
            ? <div style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:13}}>Chargement...</div>
            : sessions.length===0
              ? <div style={{padding:32,textAlign:'center',color:'#9ca3af'}}><div style={{fontSize:28,marginBottom:8}}>📅</div><div style={{fontWeight:600,fontSize:13}}>Aucune session ce mois</div></div>
              : sessions.map(s=>{
                  const st=STATUT[s.statut as keyof typeof STATUT]??STATUT.planifiee
                  const z=s.zones_prospection
                  const isS=s.id===selId
                  const pct=s.nb_adresses_total>0?Math.round(s.nb_adresses_visitees/s.nb_adresses_total*100):null
                  return (
                    <div key={s.id} onClick={()=>setSelId(s.id===selId?null:s.id)}
                      style={{padding:'8px 13px',cursor:'pointer',borderBottom:'1px solid #F0EDE6',
                        background:isS?'#f8fffe':'transparent',
                        borderLeft:isS?'3px solid '+(z?.couleur??'#1D9E75'):'3px solid transparent',
                        opacity:['annulee','non_realisee'].includes(s.statut)?0.6:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        {z&&<div style={{width:8,height:8,borderRadius:'50%',background:z.couleur,flexShrink:0}}/>}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:12,textTransform:'capitalize'}}>{fmtDate(s.date_prevue)}</div>
                          <div style={{fontSize:11,color:'#6b7280'}}>
                            {z?`Zone ${z.numero} — ${z.nom}`:'Zone non assignée'} · {s.heure_debut}–{s.heure_fin}
                            {pct!==null&&s.statut==='realisee'&&<span style={{marginLeft:5,color:'#1D9E75',fontWeight:600}}>{pct}%</span>}
                            {s.nb_contacts>0&&<span style={{marginLeft:5,color:'#92400e'}}>{s.nb_contacts} contact{s.nb_contacts>1?'s':''}</span>}
                          </div>
                        </div>
                        <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:20,background:st.bg,color:st.color,flexShrink:0}}>{st.label}</span>
                        {s.statut==='planifiee'&&s.date_prevue>=today&&(
                          <a href={`/terrain?zone_id=${s.zone_id}`} onClick={e=>e.stopPropagation()}
                            style={{fontSize:10,padding:'2px 6px',borderRadius:20,background:'#1D9E75',color:'#fff',textDecoration:'none',flexShrink:0}}>Go→</a>
                        )}
                      </div>
                    </div>
                  )
                })
          }
        </div>
      </div>

      {/* Colonne droite — détail session */}
      {sel!==null && (
        <div style={{flex:1,background:'#fff',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'13px 16px',borderBottom:'1px solid #E8E6DF',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <button onClick={()=>setSelId(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#9ca3af',padding:0}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,textTransform:'capitalize'}}>{fmtDate(sel.date_prevue)}</div>
              <div style={{fontSize:12,color:'#6b7280'}}>{sel.heure_debut} – {sel.heure_fin}</div>
            </div>
            {sel.statut==='planifiee'&&sel.date_prevue>=today&&(
              <a href={`/terrain?zone_id=${sel.zone_id}`} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'#1D9E75',color:'#fff',textDecoration:'none'}}>Démarrer →</a>
            )}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>

            {/* Zone */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:5}}>ZONE ASSIGNÉE</div>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',borderRadius:8,border:'1.5px solid #E8E6DF',background:'#F8F7F4'}}>
                {sel.zones_prospection&&<div style={{width:11,height:11,borderRadius:'50%',background:sel.zones_prospection.couleur,flexShrink:0}}/>}
                <div style={{flex:1,fontWeight:600,fontSize:13}}>{sel.zones_prospection?`Zone ${sel.zones_prospection.numero} — ${sel.zones_prospection.nom}`:'Non assignée'}</div>
                {sel.statut==='planifiee'&&(
                  <button onClick={()=>setZoneMenu(!zoneMenu)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #E8E6DF',background:'#fff',cursor:'pointer'}}>Changer</button>
                )}
              </div>
              {zoneMenu&&(
                <div style={{marginTop:4,border:'1px solid #E8E6DF',borderRadius:8,overflow:'hidden',background:'#fff',boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
                  {zones.map(z=>(
                    <div key={z.id} onClick={async()=>{setZoneMenu(false);await patch(sel.id,{zone_id:z.id})}}
                      style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #F0EDE6',background:z.id===sel.zone_id?'#f0fdf4':'transparent'}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:z.couleur}}/>
                      <span style={{fontSize:12}}>Zone {z.numero} — {z.nom}</span>
                      {z.id===sel.zone_id&&<span style={{marginLeft:'auto',color:'#1D9E75'}}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Statut */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:5}}>STATUT</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {(Object.entries(STATUT) as [string,{label:string;color:string;bg:string;border:string}][]).map(([k,v])=>(
                  <button key={k} onClick={()=>patch(sel.id,{statut:k})}
                    style={{padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                      background:sel.statut===k?v.bg:'#fff',color:sel.statut===k?v.color:'#6b7280',
                      border:'1.5px solid '+(sel.statut===k?v.border:'#E8E6DF')}}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reporter sessions suivantes */}
            {['annulee','non_realisee'].includes(sel.statut) && (
              <div style={{marginBottom:14}}>
                <button onClick={()=>setReporterOpen(!reporterOpen)}
                  style={{fontSize:12,fontWeight:600,color:'#b45309',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:8,padding:'6px 12px',cursor:'pointer',width:'100%',textAlign:'left'}}>
                  📅 Reporter les sessions suivantes {reporterOpen?'▲':'▼'}
                </button>
                {reporterOpen&&(
                  <div style={{marginTop:6,padding:'10px 12px',borderRadius:8,border:'1px solid #fde68a',background:'#fffbeb'}}>
                    <div style={{fontSize:11,color:'#92400e',marginBottom:8}}>Décaler toutes les sessions planifiées après le {fmtDate(sel.date_prevue)} de :</div>
                    <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8}}>
                      {[1,3,7,14].map(n=>(
                        <button key={n} onClick={()=>setReporterJours(n)}
                          style={{padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
                            background:reporterJours===n?'#b45309':'#fff',color:reporterJours===n?'#fff':'#92400e',
                            border:'1.5px solid '+(reporterJours===n?'#b45309':'#fde68a')}}>
                          {n}j
                        </button>
                      ))}
                      <input type="number" value={reporterJours} min={1} max={90}
                        onChange={e=>setReporterJours(parseInt(e.target.value)||1)}
                        style={{width:60,padding:'4px 6px',borderRadius:6,border:'1px solid #fde68a',fontSize:12}}/>
                      <span style={{fontSize:11,color:'#92400e'}}>jour{reporterJours>1?'s':''}</span>
                    </div>
                    <button onClick={reporter} disabled={reporting}
                      style={{width:'100%',padding:'7px',borderRadius:8,fontSize:12,fontWeight:600,
                        background:reporting?'#E8E6DF':'#b45309',color:'#fff',border:'none',cursor:reporting?'not-allowed':'pointer'}}>
                      {reporting?'Report en cours...':'✓ Confirmer le report'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Suivi */}
            {(sel.statut==='realisee'||sel.date_prevue<today)&&(
              <div style={{marginBottom:14,padding:'11px 13px',borderRadius:8,border:'1.5px solid #E8E6DF',background:'#f8fffe'}}>
                <div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:8}}>SUIVI DE SESSION</div>

                {/* Adresses + contacts */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>
                      Adresses visitées{sel.nb_adresses_total>0&&<span style={{color:'#9ca3af'}}> / {sel.nb_adresses_total}</span>}
                    </div>
                    <input type="number" value={editV} min={0} onChange={e=>setEditV(e.target.value)}
                      style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:14,fontWeight:600,boxSizing:'border-box'}}/>
                    {sel.nb_adresses_total>0&&<div style={{fontSize:11,color:'#1D9E75',marginTop:2,fontWeight:600}}>{Math.round((parseInt(editV)||0)/sel.nb_adresses_total*100)}%</div>}
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Contacts établis</div>
                    <input type="number" value={editC} min={0} onChange={e=>setEditC(e.target.value)}
                      style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:14,fontWeight:600,boxSizing:'border-box'}}/>
                  </div>
                </div>

                {/* Qualifications */}
                <div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:6}}>QUALIFICATIONS</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  {[
                    {label:'🏠 Maisons qualifiées', val:editM, set:setEditM},
                    {label:'🏢 Immeubles qualifiés', val:editI, set:setEditI},
                    {label:'🏛 Syndics identifiés', val:editSy, set:setEditSy},
                    {label:'🗑 Adresses supprimées', val:editSup, set:setEditSup},
                  ].map(({label,val,set})=>(
                    <div key={label}>
                      <div style={{fontSize:10,color:'#6b7280',marginBottom:3}}>{label}</div>
                      <input type="number" value={val} min={0} onChange={e=>set(e.target.value)}
                        style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:13,fontWeight:600,boxSizing:'border-box'}}/>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>Notes</div>
                  <textarea value={editN} onChange={e=>setEditN(e.target.value)} rows={2}
                    placeholder="Observations, difficultés..."
                    style={{width:'100%',padding:'5px 7px',borderRadius:6,border:'1px solid #E8E6DF',fontSize:12,resize:'none',boxSizing:'border-box'}}/>
                </div>

                <button onClick={saveTracking}
                  style={{width:'100%',padding:'6px',borderRadius:8,fontSize:12,fontWeight:600,background:'#1D9E75',color:'#fff',border:'none',cursor:'pointer'}}>
                  ✓ Sauvegarder le suivi
                </button>
              </div>
            )}

            {/* ICS export */}
            <div>
              <div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:5}}>CALENDRIER</div>
              <button onClick={()=>{
                const z=sel.zones_prospection
                const dt=sel.date_prevue.replace(/-/g,'')
                const start=dt+'T'+sel.heure_debut.replace(':','')+'00'
                const end=dt+'T'+sel.heure_fin.replace(':','')+'00'
                const stamp=new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'
                const title='Prospection – '+(z?`Zone ${z.numero} ${z.nom}`:'Zone')
                const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PROspector//FR','BEGIN:VEVENT',
                  'UID:session-'+sel.id+'@prospector','DTSTAMP:'+stamp,'DTSTART:'+start,'DTEND:'+end,
                  'SUMMARY:'+title,'DESCRIPTION:Session de prospection terrain','END:VEVENT','END:VCALENDAR'].join('\r\n')
                const a=document.createElement('a')
                a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}))
                a.download='session.ics';a.click()
              }} style={{padding:'6px 12px',borderRadius:8,fontSize:12,background:'#F0FDF4',color:'#15803d',border:'1px solid #bbf7d0',cursor:'pointer'}}>
                📅 Exporter .ics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
