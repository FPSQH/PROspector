'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const MOIS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_COURTS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const JOURS_NOMS   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

interface Zone { id:string; nom:string; couleur:string; numero:number }
interface Rapport { nb_visites:number; nb_contacts:number; nb_flyers:number; nb_maisons:number; nb_immeubles:number; nb_syndics:number; nb_qualifications:number; contacts:any[] }
interface PlanningSession {
  id:string; date_prevue:string; heure_debut:string; heure_fin:string; statut:string
  zone_id:string; notes:string|null; nb_adresses_total:number; session_id:string|null
  zones_prospection?:Zone; rapport:Rapport
}
interface SessionLibre {
  id:string; date_session:string; type_session:string; commune_nom:string|null; statut:string
  heure_debut_reel:string|null; heure_fin_reel:string|null
  rapport_json:any; nb_portes:number|null; nb_contacts_saisis:number|null
  zones_prospection?:Zone
}
interface Kpis { nbPlanifiees:number; nbRealisees:number; nbAnnulees:number; totalAdresses:number; totalVisites:number; totalContacts:number; pctRealise:number }
interface Config { jours_semaine:number[]; heure_debut:string; duree_minutes:number }

const DEFAULT_CFG:Config = { jours_semaine:[2,3,5], heure_debut:'10:00', duree_minutes:120 }

function addMinutes(time:string, minutes:number):string {
  const [h,m]=time.split(':').map(Number); const t=h*60+m+minutes
  return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')
}

function rapportFromLibre(s:SessionLibre):Rapport {
  const r = s.rapport_json ?? {}
  return {
    nb_visites:      r.nb_visites      ?? s.nb_portes            ?? 0,
    nb_contacts:     r.nb_contacts     ?? s.nb_contacts_saisis   ?? 0,
    nb_flyers:       r.nb_flyers       ?? 0,
    nb_maisons:      r.nb_maisons      ?? 0,
    nb_immeubles:    r.nb_immeubles     ?? 0,
    nb_syndics:      r.nb_syndics       ?? 0,
    nb_qualifications: r.nb_qualifications ?? 0,
    contacts:        r.contacts         ?? [],
  }
}

const STATUT_STYLE: Record<string,(txt:string)=>React.ReactNode> = {
  planifiee:    (t)=><span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:10,background:'#eff6ff',color:'#1d4ed8'}}>{t}</span>,
  realisee:     (t)=><span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:10,background:'#f0fdf4',color:'#166534'}}>{t}</span>,
  annulee:      (t)=><span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:10,background:'#fef2f2',color:'#dc2626'}}>{t}</span>,
  non_realisee: (t)=><span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:10,background:'#fafafa',color:'#9b9b96'}}>{t}</span>,
}

export default function PlanningPage() {
  const now = new Date()
  const [mois,  setMois]  = useState(now.getMonth()+1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [sessions, setSessions] = useState<PlanningSession[]>([])
  const [libres,   setLibres]   = useState<SessionLibre[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [kpis,     setKpis]     = useState<Kpis|null>(null)
  const [cfg,      setCfg]      = useState<Config>(DEFAULT_CFG)
  const [loading,  setLoading]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selDate,  setSelDate]  = useState<string|null>(null)
  const [showCfg,  setShowCfg]  = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [editCfg,  setEditCfg]  = useState<Config>(DEFAULT_CFG)
  // Prolongation
  const [showProlonger, setShowProlonger] = useState(false)
  const [prolongCfg,    setProlongCfg]   = useState<Config>(DEFAULT_CFG)
  const [prolonging,    setProlonging]   = useState(false)
  const today = now.toISOString().split('T')[0]

  const load = useCallback(async(m:number,a:number)=>{
    setLoading(true)
    const [pd,zd] = await Promise.all([
      fetch(`/api/planning?mois=${m}&annee=${a}`).then(r=>r.json()),
      fetch('/api/zones').then(r=>r.json()),
    ])
    setSessions(pd.planning??[])
    setLibres(pd.libres??[])
    setKpis(pd.kpis??null)
    if(pd.config){ setCfg({jours_semaine:pd.config.jours??[2,3,5],heure_debut:pd.config.debut??'10:00',duree_minutes:pd.config.duree??120}); setEditCfg({jours_semaine:pd.config.jours??[2,3,5],heure_debut:pd.config.debut??'10:00',duree_minutes:pd.config.duree??120}) }
    setZones(zd.zones??[])
    setLoading(false)
  },[])

  useEffect(()=>{load(mois,annee);setSelDate(null)},[mois,annee,load])

  const generate = async(opts?:{prolonger?:boolean;from_mois?:number;from_annee?:number;cfg_override?:Config})=>{
    setGenerating(true)
    const body:any = {mois,annee}
    if(opts?.prolonger){body.prolonger=true;body.from_mois=opts.from_mois;body.from_annee=opts.from_annee}
    if(opts?.cfg_override){body.jours_semaine=opts.cfg_override.jours_semaine;body.heure_debut=opts.cfg_override.heure_debut;body.duree_minutes=opts.cfg_override.duree_minutes}
    const r = await fetch('/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const d = await r.json()
    setGenerating(false)
    setShowProlonger(false)
    if(d.planning) load(mois,annee)
    else if(d.error) alert(d.error)
  }

  const resetMois = async()=>{
    if(!confirm(`Supprimer les sessions planifiées de ${MOIS[mois]} ${annee} ?\nLes sessions réalisées seront conservées.`)) return
    await fetch(`/api/planning?mois=${mois}&annee=${annee}`,{method:'DELETE'})
    load(mois,annee)
  }

  const saveCfg = async()=>{
    setSavingCfg(true)
    await fetch('/api/planning/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editCfg)})
    setSavingCfg(false); setShowCfg(false); setCfg(editCfg)
  }

  const navMois=(delta:number)=>{ let m=mois+delta,a=annee; if(m>12){m=1;a++} if(m<1){m=12;a--}; setMois(m);setAnnee(a) }

  const daysInMonth = new Date(annee,mois,0).getDate()
  const firstDay    = new Date(annee,mois-1,1).getDay()

  // Index par date
  const planByDate  = new Map(sessions.map(s=>[s.date_prevue,s]))
  const libresByDate = new Map<string,SessionLibre[]>()
  for(const s of libres){ const k=s.date_session; libresByDate.set(k,[...(libresByDate.get(k)??[]),s]) }

  // Sessions du jour sélectionné
  const selPlan   = selDate?planByDate.get(selDate):undefined
  const selLibres = selDate?(libresByDate.get(selDate)??[]):[]
  const hasSelData = selPlan||selLibres.length>0

  // Est-ce que le mois actuel n'a pas encore de sessions planifiées ?
  const hasPlanifiees = sessions.some(s=>s.statut==='planifiee')
  const hasRealisees  = sessions.some(s=>s.statut==='realisee')
  const isEmpty = sessions.length===0 && !loading
  // Mois précédent pour prolongation
  const prevMois  = mois===1?12:mois-1
  const prevAnnee = mois===1?annee-1:annee

  // Peut-on prolonger ? (si mois précédent a des sessions et mois courant est vide)
  const canProlonger = isEmpty && (mois > now.getMonth()+1 || annee > now.getFullYear())

  return(
    <div style={{display:'flex',height:'100dvh',background:'#f8f7f4',overflow:'hidden'}}>

      {/* ── Sidebar gauche ── */}
      <div style={{width:320,flexShrink:0,background:'#fff',borderRight:'1px solid #e8e7e0',display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* Header */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #e8e7e0',display:'flex',alignItems:'center',gap:10}}>
          <Link href="/dashboard" style={{color:'#9b9b96',textDecoration:'none',fontSize:'0.8rem'}}>←</Link>
          <span style={{fontWeight:700,fontSize:'0.9375rem',color:'#1a1a18'}}>Planning</span>
          <div style={{marginLeft:'auto',display:'flex',gap:6}}>
            <button onClick={()=>{setEditCfg(cfg);setShowCfg(true)}} style={{padding:'4px 10px',borderRadius:8,fontSize:11,background:'#f8f7f4',color:'#5F5E5A',border:'1px solid #e8e7e0',cursor:'pointer'}}>⚙ Config</button>
            {hasPlanifiees&&<button onClick={resetMois} style={{padding:'4px 10px',borderRadius:8,fontSize:11,background:'#fff',color:'#9ca3af',border:'1px solid #E8E6DF',cursor:'pointer'}}>🗑 Reset</button>}
          </div>
        </div>

        {/* Navigation mois */}
        <div style={{padding:'10px 16px',borderBottom:'1px solid #e8e7e0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <button onClick={()=>navMois(-1)} style={{padding:'4px 10px',borderRadius:8,fontSize:13,background:'#f8f7f4',border:'1px solid #e8e7e0',cursor:'pointer'}}>‹</button>
          <span style={{fontWeight:600,fontSize:'0.9rem',color:'#1a1a18'}}>{MOIS[mois]} {annee}</span>
          <button onClick={()=>navMois(1)} style={{padding:'4px 10px',borderRadius:8,fontSize:13,background:'#f8f7f4',border:'1px solid #e8e7e0',cursor:'pointer'}}>›</button>
        </div>

        {/* KPIs */}
        {kpis&&(
          <div style={{padding:'10px 16px',borderBottom:'1px solid #e8e7e0',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            {[
              {label:'Planifiées',value:kpis.nbPlanifiees,color:'#1d4ed8',bg:'#eff6ff'},
              {label:'Réalisées', value:kpis.nbRealisees, color:'#166534',bg:'#f0fdf4'},
              {label:'Annulées',  value:kpis.nbAnnulees,  color:'#9b9b96',bg:'#f8f7f4'},
            ].map(k=>(
              <div key={k.label} style={{background:k.bg,borderRadius:8,padding:'6px 8px',textAlign:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:700,color:k.color}}>{k.value}</div>
                <div style={{fontSize:'0.65rem',color:k.color,opacity:0.8}}>{k.label}</div>
              </div>
            ))}
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
              const s=planByDate.get(ds)
              const ls=libresByDate.get(ds)??[]
              const isTod=ds===today, isSel=ds===selDate
              const hasAny=!!s||ls.length>0
              return(
                <div key={day} onClick={()=>hasAny?setSelDate(ds===selDate?null:ds):undefined}
                  style={{borderRadius:5,padding:'3px 2px',minHeight:30,textAlign:'center',
                    background:isSel?(s?.zones_prospection?.couleur+'22'):isTod?'#f0fdf4':'transparent',
                    border:isSel?'2px solid '+(s?.zones_prospection?.couleur??'#1D9E75'):isTod?'1px solid #bbf7d0':'1px solid transparent',
                    cursor:hasAny?'pointer':'default'}}>
                  <div style={{fontSize:11,fontWeight:isTod?700:400,color:isTod?'#1D9E75':'#374151'}}>{day}</div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:2,marginTop:1}}>
                    {s&&<div style={{width:6,height:6,borderRadius:'50%',background:s.zones_prospection?.couleur??'#9ca3af',opacity:['annulee','non_realisee'].includes(s.statut)?0.3:1}}/>}
                    {ls.map((l,li)=><div key={li} style={{width:5,height:5,borderRadius:'50%',background:'#9b9b96'}}/>)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Légende */}
        <div style={{padding:'4px 16px 8px',display:'flex',gap:12,fontSize:10,color:'#9b9b96'}}>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:7,height:7,borderRadius:'50%',background:'#1D9E75',display:'inline-block'}}/> Zone</span>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:7,height:7,borderRadius:'50%',background:'#9b9b96',display:'inline-block'}}/> Session libre</span>
        </div>

        {/* Bouton générer / prolonger */}
        {isEmpty&&!loading&&(
          <div style={{padding:'10px 14px',borderTop:'1px solid #E8E6DF',display:'flex',flexDirection:'column',gap:8}}>
            {canProlonger?(
              <button onClick={()=>{setProlongCfg(cfg);setShowProlonger(true)}}
                style={{padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:600,background:'#1D9E75',color:'#fff',border:'none',cursor:'pointer'}}>
                ↪ Prolonger le planning sur {MOIS[mois]}
              </button>
            ):(
              <button onClick={()=>generate()} disabled={generating}
                style={{padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:600,background:generating?'#E8E6DF':'#1D9E75',color:'#fff',border:'none',cursor:generating?'not-allowed':'pointer'}}>
                {generating?'Génération...':(`✦ Générer ${MOIS[mois]}`)}
              </button>
            )}
          </div>
        )}

        {/* Liste sessions */}
        <div style={{flex:1,overflowY:'auto',borderTop:'1px solid #E8E6DF'}}>
          {loading
            ?<div style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:13}}>Chargement...</div>
            :sessions.length===0&&libres.length===0
              ?<div style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:13}}>Aucune session ce mois</div>
              :[...sessions].map(s=>{
                const z=s.zones_prospection
                const statut=s.statut
                const sLabel = statut==='planifiee'?'Planifiée':statut==='realisee'?'Réalisée':statut==='annulee'?'Annulée':'Non réalisée'
                return(
                  <div key={s.id} onClick={()=>setSelDate(s.date_prevue===selDate?null:s.date_prevue)}
                    style={{padding:'10px 14px',borderBottom:'1px solid #f8f7f4',cursor:'pointer',background:selDate===s.date_prevue?'#f0fdf4':'transparent',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:z?.couleur??'#9b9b96',flexShrink:0,opacity:['annulee','non_realisee'].includes(statut)?0.3:1}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'0.82rem',fontWeight:600,color:'#1a1a18'}}>{z?.nom??'—'}</div>
                      <div style={{fontSize:'0.72rem',color:'#9b9b96'}}>{new Date(s.date_prevue+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} · {s.heure_debut}</div>
                    </div>
                    {STATUT_STYLE[statut]?.(sLabel)}
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* ── Panneau détail journée ── */}
      <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
        {!hasSelData?(
          <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#9b9b96',fontSize:'0.875rem'}}>
            Sélectionnez une date dans le calendrier
          </div>
        ):(
          <div style={{maxWidth:680}}>
            {/* Titre journée */}
            <div style={{marginBottom:16}}>
              <h2 style={{fontSize:'1rem',fontWeight:700,color:'#1a1a18',margin:'0 0 2px'}}>
                {selDate?new Date(selDate+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):''}
              </h2>
              <div style={{fontSize:'0.78rem',color:'#9b9b96'}}>
                {(selPlan?1:0)+selLibres.length} session{((selPlan?1:0)+selLibres.length)>1?'s':''} ce jour
              </div>
            </div>

            {/* Ligne par session */}
            <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:16}}>

              {/* Session planifiée */}
              {selPlan&&(()=>{
                const z=selPlan.zones_prospection
                const r=selPlan.rapport
                const isReal=selPlan.statut==='realisee'
                const sLabel=selPlan.statut==='planifiee'?'Planifiée':selPlan.statut==='realisee'?'Réalisée':selPlan.statut==='annulee'?'Annulée':'Non réalisée'
                return(
                  <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8e7e0',padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:isReal?12:0}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:z?.couleur??'#9b9b96',flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:'0.875rem',color:'#1a1a18'}}>{z?.nom??'Zone'}</div>
                        <div style={{fontSize:'0.72rem',color:'#9b9b96'}}>{selPlan.heure_debut} – {selPlan.heure_fin} · {selPlan.nb_adresses_total} adresses</div>
                      </div>
                      {STATUT_STYLE[selPlan.statut]?.(sLabel)}
                    </div>
                    {isReal&&(
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:r.contacts.length?12:0}}>
                        {[
                          {label:'Visites',    value:r.nb_visites,    color:'#1D9E75',bg:'#f0fdf4'},
                          {label:'Contacts',   value:r.nb_contacts,   color:'#ea580c',bg:'#fff7ed'},
                          {label:'Flyers',     value:r.nb_flyers,     color:'#7c3aed',bg:'#f5f3ff'},
                          {label:'Qualifiées', value:r.nb_qualifications,color:'#1d4ed8',bg:'#eff6ff'},
                        ].map(k=>(
                          <div key={k.label} style={{background:k.bg,borderRadius:8,padding:'8px 6px',textAlign:'center'}}>
                            <div style={{fontSize:'1rem',fontWeight:700,color:k.color}}>{k.value}</div>
                            <div style={{fontSize:'0.62rem',color:k.color,opacity:0.8}}>{k.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isReal&&(r.nb_maisons>0||r.nb_immeubles>0||r.nb_syndics>0)&&(
                      <div style={{fontSize:'0.75rem',color:'#6b7280',display:'flex',gap:12,marginBottom:r.contacts.length?10:0}}>
                        {r.nb_maisons>0&&<span>🏠 {r.nb_maisons} maison{r.nb_maisons>1?'s':''}</span>}
                        {r.nb_immeubles>0&&<span>🏢 {r.nb_immeubles} immeuble{r.nb_immeubles>1?'s':''}</span>}
                        {r.nb_syndics>0&&<span>🏛 {r.nb_syndics} syndic{r.nb_syndics>1?'s':''}</span>}
                      </div>
                    )}
                    {isReal&&r.contacts.length>0&&(
                      <div style={{borderTop:'1px solid #f0efeb',paddingTop:10}}>
                        <div style={{fontSize:'0.68rem',fontWeight:700,color:'#9b9b96',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.04em'}}>Contacts ({r.contacts.length})</div>
                        {r.contacts.slice(0,4).map((c:any)=>(
                          <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0'}}>
                            <div style={{width:22,height:22,borderRadius:'50%',background:'#1D9E75',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              <span style={{fontSize:'0.6rem',color:'#fff',fontWeight:700}}>{(c.prenom?.[0]??c.nom?.[0]??'?').toUpperCase()}</span>
                            </div>
                            <span style={{fontSize:'0.78rem',color:'#1a1a18'}}>{[c.prenom,c.nom].filter(Boolean).join(' ')||'Contact'}</span>
                            {c.tel1&&<span style={{fontSize:'0.7rem',color:'#9b9b96'}}>{c.tel1}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {!isReal&&selPlan.statut==='planifiee'&&(
                      <div style={{marginTop:12}}>
                        <Link href={`/terrain?zone_id=${selPlan.zone_id}`}
                          style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,background:'#1D9E75',color:'#fff',fontWeight:600,fontSize:'0.82rem',textDecoration:'none'}}>
                          Démarrer →
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Sessions libres */}
              {selLibres.map((s,idx)=>{
                const r=rapportFromLibre(s)
                const z=s.zones_prospection
                const isHz=s.type_session==='hors_zone'
                const label=isHz?`🌐 ${s.commune_nom??'Hors Zone'}`:(z?.nom??'Session libre')
                return(
                  <div key={s.id} style={{background:'#fff',borderRadius:12,border:'1px solid #e8e7e0',padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                      {isHz
                        ?<div style={{width:10,height:10,borderRadius:'50%',background:'#9b9b96',flexShrink:0}}/>
                        :<div style={{width:10,height:10,borderRadius:'50%',background:z?.couleur??'#9b9b96',flexShrink:0}}/>
                      }
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:'0.875rem',color:'#1a1a18'}}>{label}</div>
                        {s.heure_debut_reel&&<div style={{fontSize:'0.72rem',color:'#9b9b96'}}>{new Date(s.heure_debut_reel).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}{s.heure_fin_reel?' – '+new Date(s.heure_fin_reel).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>}
                      </div>
                      <span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:10,background:'#fff7ed',color:'#ea580c'}}>Libre</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:(r.nb_maisons>0||r.nb_immeubles>0||r.nb_syndics>0)?8:0}}>
                      {[
                        {label:'Visites',    value:r.nb_visites,    color:'#1D9E75',bg:'#f0fdf4'},
                        {label:'Contacts',   value:r.nb_contacts,   color:'#ea580c',bg:'#fff7ed'},
                        {label:'Flyers',     value:r.nb_flyers,     color:'#7c3aed',bg:'#f5f3ff'},
                        {label:'Qualifiées', value:r.nb_qualifications,color:'#1d4ed8',bg:'#eff6ff'},
                      ].map(k=>(
                        <div key={k.label} style={{background:k.bg,borderRadius:8,padding:'8px 6px',textAlign:'center'}}>
                          <div style={{fontSize:'1rem',fontWeight:700,color:k.color}}>{k.value}</div>
                          <div style={{fontSize:'0.62rem',color:k.color,opacity:0.8}}>{k.label}</div>
                        </div>
                      ))}
                    </div>
                    {(r.nb_maisons>0||r.nb_immeubles>0||r.nb_syndics>0)&&(
                      <div style={{fontSize:'0.75rem',color:'#6b7280',display:'flex',gap:12}}>
                        {r.nb_maisons>0&&<span>🏠 {r.nb_maisons} maison{r.nb_maisons>1?'s':''}</span>}
                        {r.nb_immeubles>0&&<span>🏢 {r.nb_immeubles} immeuble{r.nb_immeubles>1?'s':''}</span>}
                        {r.nb_syndics>0&&<span>🏛 {r.nb_syndics} syndic{r.nb_syndics>1?'s':''}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Total journée (si plusieurs sessions) */}
            {((selPlan&&selPlan.statut==='realisee'?1:0)+selLibres.length)>1&&(()=>{
              const allRapports:Rapport[] = [
                ...(selPlan&&selPlan.statut==='realisee'?[selPlan.rapport]:[]),
                ...selLibres.map(rapportFromLibre),
              ]
              const total = {
                nb_visites: allRapports.reduce((s,r)=>s+r.nb_visites,0),
                nb_contacts: allRapports.reduce((s,r)=>s+r.nb_contacts,0),
                nb_flyers: allRapports.reduce((s,r)=>s+r.nb_flyers,0),
                nb_qualifications: allRapports.reduce((s,r)=>s+r.nb_qualifications,0),
                nb_maisons: allRapports.reduce((s,r)=>s+r.nb_maisons,0),
                nb_immeubles: allRapports.reduce((s,r)=>s+r.nb_immeubles,0),
                nb_syndics: allRapports.reduce((s,r)=>s+r.nb_syndics,0),
              }
              return(
                <div style={{background:'#1a1a18',borderRadius:12,padding:'14px 16px'}}>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'#9b9b96',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.04em'}}>Total de la journée</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:total.nb_maisons>0||total.nb_immeubles>0||total.nb_syndics>0?10:0}}>
                    {[
                      {label:'Visites',    value:total.nb_visites,    color:'#4ade80'},
                      {label:'Contacts',   value:total.nb_contacts,   color:'#fb923c'},
                      {label:'Flyers',     value:total.nb_flyers,     color:'#c084fc'},
                      {label:'Qualifiées', value:total.nb_qualifications,color:'#60a5fa'},
                    ].map(k=>(
                      <div key={k.label} style={{textAlign:'center'}}>
                        <div style={{fontSize:'1.3rem',fontWeight:700,color:k.color}}>{k.value}</div>
                        <div style={{fontSize:'0.62rem',color:'#9b9b96'}}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {(total.nb_maisons>0||total.nb_immeubles>0||total.nb_syndics>0)&&(
                    <div style={{fontSize:'0.75rem',color:'#9b9b96',display:'flex',gap:12}}>
                      {total.nb_maisons>0&&<span>🏠 {total.nb_maisons}</span>}
                      {total.nb_immeubles>0&&<span>🏢 {total.nb_immeubles}</span>}
                      {total.nb_syndics>0&&<span>🏛 {total.nb_syndics}</span>}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Modal config ── */}
      {showCfg&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>setShowCfg(false)}>
          <div style={{background:'#fff',borderRadius:16,padding:28,width:340}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:'0 0 18px',fontSize:'1rem',fontWeight:700}}>⚙ Configuration du planning</h3>
            <label style={{fontSize:'0.8rem',fontWeight:600,color:'#5F5E5A',display:'block',marginBottom:6}}>Jours de prospection</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
              {JOURS_NOMS.map((j,i)=>(
                <button key={i} onClick={()=>setEditCfg(c=>({...c,jours_semaine:c.jours_semaine.includes(i)?c.jours_semaine.filter(x=>x!==i):[...c.jours_semaine,i].sort()}))}
                  style={{padding:'5px 10px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',background:editCfg.jours_semaine.includes(i)?'#1D9E75':'#f3f4f6',color:editCfg.jours_semaine.includes(i)?'#fff':'#374151',border:'none'}}>
                  {j.slice(0,3)}
                </button>
              ))}
            </div>
            <label style={{fontSize:'0.8rem',fontWeight:600,color:'#5F5E5A',display:'block',marginBottom:6}}>Heure de début</label>
            <input type="time" value={editCfg.heure_debut} onChange={e=>setEditCfg(c=>({...c,heure_debut:e.target.value}))}
              style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1.5px solid #e8e7e0',fontSize:'0.9rem',marginBottom:14,boxSizing:'border-box'}}/>
            <label style={{fontSize:'0.8rem',fontWeight:600,color:'#5F5E5A',display:'block',marginBottom:6}}>Durée (minutes)</label>
            <input type="number" value={editCfg.duree_minutes} onChange={e=>setEditCfg(c=>({...c,duree_minutes:parseInt(e.target.value)||120}))}
              style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1.5px solid #e8e7e0',fontSize:'0.9rem',marginBottom:18,boxSizing:'border-box'}}/>
            <div style={{fontSize:'0.75rem',color:'#9b9b96',marginBottom:14}}>
              Fin : {addMinutes(editCfg.heure_debut,editCfg.duree_minutes)} · Interval : avec {zones.length} zones → ~{zones.length>0?Math.ceil(zones.length/Math.max(1,editCfg.jours_semaine.length)):0} semaines/tour
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setShowCfg(false)} style={{padding:'9px 16px',borderRadius:10,background:'#f8f7f4',border:'1px solid #e8e7e0',cursor:'pointer',fontSize:'0.875rem'}}>Annuler</button>
              <button onClick={saveCfg} disabled={savingCfg} style={{flex:1,padding:'9px',borderRadius:10,background:savingCfg?'#E8E6DF':'#1D9E75',color:'#fff',border:'none',cursor:savingCfg?'not-allowed':'pointer',fontSize:'0.875rem',fontWeight:600}}>
                {savingCfg?'Sauvegarde...':'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal prolongation ── */}
      {showProlonger&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>setShowProlonger(false)}>
          <div style={{background:'#fff',borderRadius:16,padding:28,width:360}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:'0 0 4px',fontSize:'1rem',fontWeight:700}}>↪ Prolonger sur {MOIS[mois]} {annee}</h3>
            <p style={{fontSize:'0.78rem',color:'#9b9b96',margin:'0 0 18px'}}>
              La rotation reprend après la dernière zone de {MOIS[prevMois]}. Modifiez les paramètres si besoin.
            </p>
            <label style={{fontSize:'0.8rem',fontWeight:600,color:'#5F5E5A',display:'block',marginBottom:6}}>Jours de prospection</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
              {JOURS_NOMS.map((j,i)=>(
                <button key={i} onClick={()=>setProlongCfg(c=>({...c,jours_semaine:c.jours_semaine.includes(i)?c.jours_semaine.filter(x=>x!==i):[...c.jours_semaine,i].sort()}))}
                  style={{padding:'5px 10px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',background:prolongCfg.jours_semaine.includes(i)?'#1D9E75':'#f3f4f6',color:prolongCfg.jours_semaine.includes(i)?'#fff':'#374151',border:'none'}}>
                  {j.slice(0,3)}
                </button>
              ))}
            </div>
            <label style={{fontSize:'0.8rem',fontWeight:600,color:'#5F5E5A',display:'block',marginBottom:6}}>Heure de début</label>
            <input type="time" value={prolongCfg.heure_debut} onChange={e=>setProlongCfg(c=>({...c,heure_debut:e.target.value}))}
              style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1.5px solid #e8e7e0',fontSize:'0.9rem',marginBottom:14,boxSizing:'border-box'}}/>
            <label style={{fontSize:'0.8rem',fontWeight:600,color:'#5F5E5A',display:'block',marginBottom:6}}>Durée (minutes)</label>
            <input type="number" value={prolongCfg.duree_minutes} onChange={e=>setProlongCfg(c=>({...c,duree_minutes:parseInt(e.target.value)||120}))}
              style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1.5px solid #e8e7e0',fontSize:'0.9rem',marginBottom:18,boxSizing:'border-box'}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setShowProlonger(false)} style={{padding:'9px 16px',borderRadius:10,background:'#f8f7f4',border:'1px solid #e8e7e0',cursor:'pointer',fontSize:'0.875rem'}}>Annuler</button>
              <button onClick={()=>generate({prolonger:true,from_mois:prevMois,from_annee:prevAnnee,cfg_override:prolongCfg})} disabled={prolonging}
                style={{flex:1,padding:'9px',borderRadius:10,background:prolonging?'#E8E6DF':'#1D9E75',color:'#fff',border:'none',cursor:prolonging?'not-allowed':'pointer',fontSize:'0.875rem',fontWeight:600}}>
                {prolonging?'Génération...':'↪ Prolonger'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
