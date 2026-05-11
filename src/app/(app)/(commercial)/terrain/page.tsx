'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/terrain/BottomSheet'

const TerrainMap = dynamic(() => import('@/components/terrain/TerrainMap'), { ssr: false })

interface Zone { id:string; nom:string; couleur:string; numero:number; nb_prospectables:number }
interface Commune { code_insee:string; nom:string; code_postal?:string }
interface Adresse {
  id:string; lat:number; lon:number; numero?:string; nom_voie?:string
  code_postal?:string; commune?:string; code_insee?:string
  type_bien?:string; nb_bal?:number; prospectable?:boolean
  statut_carte:'a_faire'|'contact'|'boite'|'visite'
  interaction?:any; ordre:number; score?:number
  latest_dpe_date?:string|null; etiquette_dpe?:string|null
  has_audit?:boolean; audit_n?:string|null
  type_habitat?:string; mode_prospection?:string; statut_prospectabilite?:string
  nom_syndic?:string; courrier_cible_possible?:boolean; commentaire_adresse?:string
  zone_id?:string|null; zone_nom?:string|null; zone_couleur?:string|null
  is_manuelle?:boolean
}
interface Session {
  id:string; zone_id?:string|null; statut:string; date_session:string
  created_at?:string; heure_debut_reel?:string
  type_session?:string; commune_code_insee?:string; commune_nom?:string
  zones_prospection?:{ nom:string; couleur:string; numero:number }
}

type AppState = 'checking'|'resume_prompt'|'choix_zone'|'choix_hors_zone'|'pre_session'|'pre_session_hors_zone'|'en_cours'|'terminee'
const SESSION_KEY = 'prospector_session_id'

export default function TerrainPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [appState, setAppState] = useState<AppState>('checking')
  const [zones, setZones] = useState<Zone[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [communeChoisie, setCommuneChoisie] = useState<Commune|null>(null)
  const [activeSessionFound, setActiveSessionFound] = useState<Session|null>(null)
  const [preZone, setPreZone] = useState<Zone|null>(null)
  const [preAdresses, setPreAdresses] = useState<any[]>([])
  const [preLoading, setPreLoading] = useState(false)
  const [showDpeFilter, setShowDpeFilter] = useState(false)
  const [dpeFrom, setDpeFrom] = useState('')
  const [dpeTo, setDpeTo] = useState('')
  const [pendingFrom, setPendingFrom] = useState('')
  const [pendingTo, setPendingTo] = useState('')
  const [dpeFlags, setDpeFlags] = useState<string[]>([])
  const [activeDpeFlags, setActiveDpeFlags] = useState<string[]>([])
  const [session, setSession] = useState<Session|null>(null)
  const [adresses, setAdresses] = useState<Adresse[]>([])
  const [nbTotal, setNbTotal] = useState(0)
  const [nbVisites, setNbVisites] = useState(0)
  const [pctCouvert, setPctCouvert] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedAdresse, setSelectedAdresse] = useState<Adresse|null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [itineraire, setItineraire] = useState<string[]>([])
  const [idxCourant, setIdxCourant] = useState(0)
  const [rapport, setRapport] = useState<any>(null)
  const [isHorsZone, setIsHorsZone] = useState(false)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState({ numero:'', nom_voie:'', type_habitat:'individuel', nb_bal:'' })
  const [savingAddress, setSavingAddress] = useState(false)
  const [placingAddress, setPlacingAddress] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<any>(null)
  const [placementCoords, setPlacementCoords] = useState<{lat:number,lon:number}|null>(null)
  const [geolocating, setGeolocating] = useState(false)

  const calculerItineraire = (adrs:Adresse[]):string[] => {
    const points = adrs.filter(a=>a.lat&&a.lon&&a.prospectable!==false)
    if(!points.length) return []
    const visited=new Set<string>(); const result:string[]=[]
    let current=points.reduce((b,p)=>p.lat+p.lon<b.lat+b.lon?p:b)
    while(result.length<points.length){
      visited.add(current.id); result.push(current.id)
      let nearest:Adresse|null=null; let minDist=Infinity
      for(const p of points){ if(visited.has(p.id)) continue; const d=Math.pow(p.lat-current.lat,2)+Math.pow(p.lon-current.lon,2); if(d<minDist){minDist=d;nearest=p} }
      if(!nearest) break; current=nearest
    }
    return result
  }

  useEffect(()=>{
    ;(async()=>{
      const [zonesRes, activeRes, communesRes] = await Promise.all([
        fetch('/api/zones').then(r=>r.json()),
        fetch('/api/sessions?statut=en_cours').then(r=>r.json()).catch(()=>({sessions:[]})),
        fetch('/api/communes').then(r=>r.json()).catch(()=>({communes:[]})),
      ])
      const zonesData = zonesRes.zones??[]
      setZones(zonesData); setCommunes(communesRes.communes??[])
      const active = activeRes.sessions?.[0]??null
      if(active){ setActiveSessionFound(active); setAppState('resume_prompt') }
      else {
        setAppState('choix_zone')
        const zp = searchParams.get('zone_id')
        if(zp){ const z=zonesData.find((z:Zone)=>z.id===zp); if(z) handleZonePreview(z) }
      }
    })()
  },[]) // eslint-disable-line

  const handleResumeSession = async()=>{ if(!activeSessionFound) return; setLoading(true); setSession(activeSessionFound); setIsHorsZone(activeSessionFound.type_session==='hors_zone'); setActiveDpeFlags([]); await loadSessionData(activeSessionFound.id); setAppState('en_cours'); setLoading(false) }
  const handleAbandonAndNew = async()=>{ if(!activeSessionFound) return; if(!confirm('Clore la session sans enregistrer ?')) return; await fetch(`/api/sessions/${activeSessionFound.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({statut:'non_realisee'})}); try{localStorage.removeItem(SESSION_KEY)}catch(_){}; setActiveSessionFound(null); setAppState('choix_zone') }

  const handleZonePreview = async(zone:Zone)=>{
    setPreZone(zone); setDpeFlags([]); setPreAdresses([]); setAppState('pre_session'); setPreLoading(true)
    const now=new Date(); const to=now.toISOString().split('T')[0]; const from=new Date(now.getTime()-30*86400000).toISOString().split('T')[0]
    setDpeTo(to); setDpeFrom(from); setPendingTo(to); setPendingFrom(from)
    try{ const res=await fetch(`/api/zones/${zone.id}/adresses`); const d=await res.json(); setPreAdresses(d.adresses??[]) }finally{ setPreLoading(false) }
  }

  useEffect(()=>{
    if(!dpeFrom&&!dpeTo){setDpeFlags([]);return}
    const from=dpeFrom?new Date(dpeFrom):new Date(0); const to=dpeTo?new Date(dpeTo+'T23:59:59'):new Date()
    setDpeFlags(preAdresses.filter((a:any)=>{ if(!a.latest_dpe_date) return false; const d=new Date(a.latest_dpe_date); return d>=from&&d<=to }).map((a:any)=>a.id))
  },[preAdresses,dpeFrom,dpeTo])

  const handlePreviewHorsZone = async()=>{ if(!communeChoisie) return; setPreAdresses([]); setAppState('pre_session_hors_zone'); setPreLoading(true); try{ const res=await fetch(`/api/prospection-libre/adresses?code_insee=${communeChoisie.code_insee}`); const d=await res.json(); setPreAdresses(d.adresses??[]) }finally{ setPreLoading(false) } }

  const handleStartSession = async(zone?:Zone, horsZone?:boolean)=>{
    const activeRes=await fetch('/api/sessions?statut=en_cours').then(r=>r.json()).catch(()=>({sessions:[]}))
    const existing=activeRes.sessions?.[0]
    if(existing){ if(!confirm(`Session active sur "${existing.zones_prospection?.nom??existing.commune_nom??'zone'}". Clôturer ?`)) return; await fetch(`/api/sessions/${existing.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({statut:'non_realisee'})}) }
    setActiveDpeFlags(dpeFlags); setLoading(true); setIsHorsZone(!!horsZone)
    try{
      const body:any = horsZone?{type_session:'hors_zone',commune_code_insee:communeChoisie?.code_insee,commune_nom:communeChoisie?.nom}:{zone_id:zone!.id,type_session:'libre'}
      const res=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const data=await res.json(); if(!res.ok||!data.session){console.error(data);return}
      setSession(data.session); try{localStorage.setItem(SESSION_KEY,data.session.id)}catch(_){}
      if(horsZone){ const adrs=(preAdresses??[]).map((a:any,i:number)=>({...a,statut_carte:'a_faire' as const,ordre:i,prospectable:a.prospectable!==false})); setAdresses(adrs); setNbTotal(adrs.length); setNbVisites(0); setPctCouvert(0); setItineraire([]) }
      else{ await loadSessionData(data.session.id) }
      setAppState('en_cours')
    }catch(e){console.error(e)}finally{setLoading(false)}
  }

  const loadSessionData = useCallback(async(sessionId:string)=>{
    const res=await fetch(`/api/sessions/${sessionId}`); const data=await res.json(); if(!res.ok) return
    setAdresses(data.adresses??[]); setNbTotal(data.nb_total??0); setNbVisites(data.nb_visites??0); setPctCouvert(data.pct_couvert??0)
    const itin=calculerItineraire(data.adresses??[]); setItineraire(itin); setIdxCourant(0)
  },[])

  const handleAdresseClick=(adresse:Adresse)=>{setSelectedAdresse(adresse);setSheetOpen(true)}
  const handleQualification=async(interactionData:any)=>{
    if(!session||!selectedAdresse) return
    await fetch('/api/interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:session.id,adresse_id:selectedAdresse.id,...interactionData})})
    const statut:Adresse['statut_carte']=interactionData.resultat==='contact_etabli'?'contact':interactionData.action==='flyer'||interactionData.action==='courrier'?'boite':'visite'
    setAdresses(prev=>prev.map(a=>a.id===selectedAdresse.id?{...a,statut_carte:statut,interaction:interactionData}:a))
    setNbVisites(prev=>selectedAdresse.statut_carte!=='a_faire'?prev:prev+1); setPctCouvert(nbTotal>0?Math.round(((nbVisites+1)/nbTotal)*100):0)
    setSheetOpen(false); setSelectedAdresse(null); if(!isHorsZone) setIdxCourant(prev=>Math.min(prev+1,itineraire.length-1))
  }
  const allerAdresseSuivante=()=>{ for(let i=idxCourant;i<itineraire.length;i++){const adr=adresses.find(a=>a.id===itineraire[i]);if(adr&&adr.statut_carte==='a_faire'){setIdxCourant(i);setSelectedAdresse(adr);setSheetOpen(true);return}}; const p=adresses.find(a=>a.statut_carte==='a_faire');if(p){setSelectedAdresse(p);setSheetOpen(true)} }
  const ouvrirGoogleMaps=()=>{ const adr=adresses.find(a=>a.id===itineraire[idxCourant]); if(!adr?.lat||!adr?.lon) return; window.open(`https://www.google.com/maps/dir/?api=1&destination=${adr.lat},${adr.lon}&travelmode=walking`,'_blank') }
  const handleEndSession=async()=>{ if(!session) return; if(!confirm('Terminer et clôturer cette session ?')) return; setLoading(true); const res=await fetch(`/api/sessions/${session.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({statut:'realisee',nb_portes:nbVisites})}); const d=await res.json(); setRapport(d.rapport??null); try{localStorage.removeItem(SESSION_KEY)}catch(_){}; setLoading(false); setAppState('terminee') }

  const handleAddManualAddress=async()=>{
    if(!newAddress.nom_voie.trim()||!session) return; setSavingAddress(true)
    const lat=preAdresses[0]?.lat??adresses[0]?.lat??48.5; const lon=preAdresses[0]?.lon??adresses[0]?.lon??-2.5
    const res=await fetch('/api/adresses/manuel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lon,numero:newAddress.numero||null,nom_voie:newAddress.nom_voie,code_insee:communeChoisie?.code_insee??session.commune_code_insee,commune:communeChoisie?.nom??session.commune_nom,code_postal:communeChoisie?.code_postal??'',type_habitat:newAddress.type_habitat,nb_bal:newAddress.nb_bal||null})})
    const data=await res.json()
    if(res.ok&&data.adresse){ const newAdr:Adresse={...data.adresse,statut_carte:'a_faire',ordre:adresses.length,zone_id:null,zone_nom:null,zone_couleur:null,is_manuelle:true}; setAdresses(prev=>[...prev,newAdr]); setNbTotal(prev=>prev+1); setNewAddress({numero:'',nom_voie:'',type_habitat:'individuel',nb_bal:''}); setShowAddressForm(false); setSelectedAdresse(newAdr); setSheetOpen(true) }
    setSavingAddress(false)
  }

  const prochaineAdresseId=isHorsZone?null:(itineraire[idxCourant]??null)

  if(appState==='checking') return(<div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8f7f4'}}><div style={{fontSize:'0.875rem',color:'#9b9b96'}}>Chargement...</div></div>)

  if(appState==='resume_prompt'&&activeSessionFound){
    const z=activeSessionFound.zones_prospection; const isHz=activeSessionFound.type_session==='hors_zone'
    const nomSession=isHz?(activeSessionFound.commune_nom??'Hors Zone'):(z?.nom??'Zone')
    const debutFr=activeSessionFound.heure_debut_reel?new Date(activeSessionFound.heure_debut_reel).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''
    return(<div style={{height:'100dvh',background:'#f8f7f4',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px'}}><div style={{background:'#fff',borderRadius:16,border:'1px solid #e8e7e0',padding:'28px 24px',width:'100%',maxWidth:380,textAlign:'center'}}>
      <div style={{fontSize:'2.5rem',marginBottom:12}}>{isHz?'🌐':'⚡'}</div>
      <h2 style={{fontSize:'1rem',fontWeight:700,color:'#1a1a18',marginBottom:4}}>Session en cours</h2>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:4}}>
        {!isHz&&z&&<div style={{width:10,height:10,borderRadius:'50%',background:z.couleur}}/>}
        <span style={{fontSize:'0.9rem',fontWeight:600,color:'#1a1a18'}}>{nomSession}</span>
        {isHz&&<span style={{fontSize:'0.72rem',fontWeight:600,padding:'1px 6px',borderRadius:10,background:'#fff7ed',color:'#ea580c'}}>Hors Zone</span>}
      </div>
      {debutFr&&<p style={{fontSize:'0.78rem',color:'#9b9b96',marginBottom:24}}>Démarrée à {debutFr}</p>}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <button onClick={handleResumeSession} disabled={loading} style={{width:'100%',padding:'13px',borderRadius:10,background:loading?'#9b9b96':'#1D9E75',color:'#fff',fontWeight:700,fontSize:'0.95rem',border:'none',cursor:loading?'not-allowed':'pointer'}}>{loading?'Chargement...':'Reprendre la session →'}</button>
        <button onClick={async()=>{if(!confirm('Terminer ?')) return;setLoading(true);await fetch(`/api/sessions/${activeSessionFound.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({statut:'realisee'})});try{localStorage.removeItem(SESSION_KEY)}catch(_){};router.push('/dashboard')}} disabled={loading} style={{width:'100%',padding:'11px',borderRadius:10,background:'#fff',color:'#1D9E75',fontWeight:600,fontSize:'0.85rem',border:'1.5px solid #bbf7d0',cursor:'pointer'}}>✓ Terminer et clôturer</button>
        <button onClick={handleAbandonAndNew} style={{width:'100%',padding:'11px',borderRadius:10,background:'#fff',color:'#dc2626',fontWeight:600,fontSize:'0.85rem',border:'1.5px solid #fca5a5',cursor:'pointer'}}>Abandonner et démarrer une nouvelle</button>
        <button onClick={()=>router.push('/dashboard')} style={{background:'none',border:'none',color:'#9b9b96',fontSize:'0.8rem',cursor:'pointer',marginTop:4}}>← Dashboard</button>
      </div>
    </div></div>)
  }

  if(appState==='choix_zone') return(
    <div style={{minHeight:'100dvh',background:'#f8f7f4',display:'flex',flexDirection:'column'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e8e7e0',padding:'0 20px',height:52,display:'flex',alignItems:'center',gap:12}}>
        <button onClick={()=>router.push('/dashboard')} style={{background:'none',border:'none',color:'#9b9b96',cursor:'pointer',fontSize:'0.9rem'}}>←</button>
        <span style={{fontWeight:600,fontSize:'0.9375rem',color:'#1a1a18'}}>Démarrer une prospection</span>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'20px 16px'}}>
        <div style={{marginBottom:20,padding:'16px',borderRadius:14,background:'#fff7ed',border:'2px solid #fed7aa',boxShadow:'0 2px 12px rgba(234,88,12,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span style={{fontSize:'1.8rem'}}>🌐</span>
            <div><div style={{fontWeight:700,fontSize:'0.95rem',color:'#ea580c'}}>Prospection libre hors zone</div><div style={{fontSize:'0.75rem',color:'#9b9b96',marginTop:2}}>Explorer librement n'importe quelle adresse de votre secteur</div></div>
          </div>
          <button onClick={()=>setAppState('choix_hors_zone')} style={{width:'100%',padding:'12px',borderRadius:10,background:'#ea580c',color:'#fff',fontWeight:700,fontSize:'0.9rem',border:'none',cursor:'pointer'}}>Choisir une commune et démarrer →</button>
        </div>
        {zones.length>0&&(<>
          <p style={{fontSize:'0.78rem',color:'#9b9b96',marginBottom:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Ou prospecter une zone identifiée</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {zones.map(zone=>(
              <button key={zone.id} onClick={()=>handleZonePreview(zone)} disabled={loading}
                style={{display:'flex',flexDirection:'column',gap:6,background:'#fff',border:'1px solid #e8e7e0',borderRadius:12,padding:'14px',cursor:loading?'not-allowed':'pointer',textAlign:'left'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:'50%',background:zone.couleur,flexShrink:0}}/><span style={{fontWeight:600,fontSize:'0.82rem',color:'#1a1a18',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{zone.nom}</span></div>
                <div style={{fontSize:'0.72rem',color:'#9b9b96'}}>{zone.nb_prospectables} adresses</div>
                <div style={{fontSize:'0.72rem',color:'#1D9E75',fontWeight:600}}>Démarrer →</div>
              </button>
            ))}
          </div>
        </>)}
      </div>
    </div>
  )

  if(appState==='choix_hors_zone') return(
    <div style={{minHeight:'100dvh',background:'#f8f7f4',display:'flex',flexDirection:'column'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e8e7e0',padding:'0 16px',height:52,display:'flex',alignItems:'center',gap:12}}>
        <button onClick={()=>setAppState('choix_zone')} style={{background:'none',border:'none',color:'#9b9b96',cursor:'pointer',fontSize:'1rem'}}>←</button>
        <span style={{fontWeight:600,fontSize:'0.9375rem',color:'#1a1a18'}}>🌐 Prospection hors zone</span>
      </div>
      <div style={{flex:1,padding:'24px 16px',overflowY:'auto'}}>
        <p style={{fontSize:'0.82rem',color:'#9b9b96',marginBottom:20}}>Choisissez la commune à prospecter</p>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
          {communes.map(c=>(
            <button key={c.code_insee} onClick={()=>setCommuneChoisie(c)} style={{display:'flex',alignItems:'center',gap:12,background:'#fff',border:`2px solid ${communeChoisie?.code_insee===c.code_insee?'#ea580c':'#e8e7e0'}`,borderRadius:12,padding:'14px 16px',cursor:'pointer',textAlign:'left'}}>
              <span style={{fontSize:'1.2rem'}}>🏘</span>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:'0.9rem',color:'#1a1a18'}}>{c.nom}</div>{c.code_postal&&<div style={{fontSize:'0.72rem',color:'#9b9b96'}}>{c.code_postal}</div>}</div>
              {communeChoisie?.code_insee===c.code_insee&&<span style={{color:'#ea580c',fontSize:'1.1rem'}}>✓</span>}
            </button>
          ))}
          {communes.length===0&&<div style={{textAlign:'center',color:'#9b9b96',padding:'24px'}}>Aucune commune dans votre secteur</div>}
        </div>
        <button onClick={handlePreviewHorsZone} disabled={!communeChoisie||preLoading} style={{width:'100%',padding:'14px',borderRadius:12,background:!communeChoisie?'#e8e7e0':'#ea580c',color:'#fff',fontWeight:700,fontSize:'1rem',border:'none',cursor:!communeChoisie?'not-allowed':'pointer'}}>
          {preLoading?'Chargement...':'Charger les adresses →'}
        </button>
      </div>
    </div>
  )

  if(appState==='pre_session'&&preZone){
    const applyFilter=(from:string,to:string)=>{setDpeFrom(from);setDpeTo(to);setPendingFrom(from);setPendingTo(to)}
    const quickSet=(days:number)=>{const now=new Date();applyFilter(new Date(now.getTime()-days*86400000).toISOString().split('T')[0],now.toISOString().split('T')[0])}
    const preMap=preAdresses.map((a:any,i:number)=>({...a,statut_carte:'a_faire' as const,ordre:i,prospectable:a.prospectable!==false}))
    return(<div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#f8f7f4'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e8e7e0',padding:'0 16px',height:52,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
        <button onClick={()=>setAppState('choix_zone')} style={{background:'none',border:'none',color:'#9b9b96',cursor:'pointer',fontSize:'1rem'}}>←</button>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}><div style={{width:10,height:10,borderRadius:'50%',background:preZone.couleur,flexShrink:0}}/><span style={{fontWeight:600,color:'#1a1a18',fontSize:'0.9375rem'}}>{preZone.nom}</span><span style={{fontSize:'0.75rem',color:'#9b9b96'}}>{preZone.nb_prospectables} adresses</span></div>
      </div>
      <div style={{background:'#fff',borderBottom:'1px solid #e8e7e0',padding:'12px 16px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:showDpeFilter?8:0}}>
          <button onClick={()=>setShowDpeFilter(v=>!v)} style={{fontSize:'0.78rem',fontWeight:600,color:'#5F5E5A',background:'none',border:'none',cursor:'pointer',padding:0}}>⚡ DPE récents {showDpeFilter?'▲':'▼'}</button>
          {dpeFlags.length>0&&<span style={{background:'#fef3c7',color:'#d97706',border:'1px solid #fde68a',borderRadius:10,padding:'1px 8px',fontSize:'0.7rem',fontWeight:600}}>🚩 {dpeFlags.length}</span>}
        </div>
        {showDpeFilter&&(<><div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>quickSet(14)} style={{padding:'6px 14px',borderRadius:20,fontSize:'0.78rem',fontWeight:600,border:'1.5px solid #1D9E75',background:'#f0fdf4',color:'#1D9E75',cursor:'pointer'}}>2 semaines</button><button onClick={()=>quickSet(30)} style={{padding:'6px 14px',borderRadius:20,fontSize:'0.78rem',fontWeight:600,border:'1.5px solid #1D9E75',background:'#f0fdf4',color:'#1D9E75',cursor:'pointer'}}>1 mois</button><button onClick={()=>{setDpeFrom('');setDpeTo('');setPendingFrom('');setPendingTo('')}} style={{padding:'6px 10px',borderRadius:20,fontSize:'0.75rem',border:'1px solid #e8e7e0',background:'transparent',color:'#9b9b96',cursor:'pointer'}}>Effacer</button></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}><input type="date" value={pendingFrom} onChange={e=>setPendingFrom(e.target.value)} style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1.5px solid #e8e7e0',fontSize:'0.8rem'}}/><span style={{color:'#9b9b96',fontSize:'0.8rem'}}>→</span><input type="date" value={pendingTo} onChange={e=>setPendingTo(e.target.value)} style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1.5px solid #e8e7e0',fontSize:'0.8rem'}}/></div>
        <button onClick={()=>applyFilter(pendingFrom,pendingTo)} disabled={!pendingFrom&&!pendingTo} style={{marginTop:8,width:'100%',padding:'8px',borderRadius:8,background:(pendingFrom||pendingTo)?'#1D9E75':'#e8e7e0',color:'#fff',border:'none',fontWeight:600,fontSize:'0.8rem',cursor:(pendingFrom||pendingTo)?'pointer':'not-allowed'}}>Appliquer</button></>)}
      </div>
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        {preLoading?<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8f7f4',fontSize:'0.875rem',color:'#9b9b96'}}>Chargement...</div>:<TerrainMap adresses={preMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={()=>{}} dpeFlags={dpeFlags} dpeFilterFrom={dpeFrom} dpeFilterTo={dpeTo}/>}
      </div>
      <div style={{padding:'12px 16px',background:'#fff',borderTop:'1px solid #e8e7e0',flexShrink:0}}>
        <button onClick={()=>handleStartSession(preZone,false)} disabled={loading} style={{width:'100%',padding:'14px',borderRadius:12,background:loading?'#9b9b96':'#1D9E75',color:'#fff',fontWeight:700,fontSize:'1rem',border:'none',cursor:loading?'not-allowed':'pointer'}}>{loading?'Démarrage...':'Démarrer la tournée →'}</button>
      </div>
    </div>)
  }

  if(appState==='pre_session_hors_zone'&&communeChoisie){
    const preMap=preAdresses.map((a:any,i:number)=>({...a,statut_carte:'a_faire' as const,ordre:i,prospectable:a.prospectable!==false}))
    return(<div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#f8f7f4'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e8e7e0',padding:'0 16px',height:52,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
        <button onClick={()=>setAppState('choix_hors_zone')} style={{background:'none',border:'none',color:'#9b9b96',cursor:'pointer',fontSize:'1rem'}}>←</button>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}><span style={{fontSize:'1rem'}}>🌐</span><span style={{fontWeight:600,color:'#ea580c',fontSize:'0.9375rem'}}>{communeChoisie.nom}</span><span style={{fontSize:'0.72rem',fontWeight:600,padding:'1px 6px',borderRadius:10,background:'#fff7ed',color:'#ea580c'}}>Hors Zone</span></div>
        <span style={{fontSize:'0.75rem',color:'#9b9b96'}}>{preAdresses.length} adresses</span>
      </div>
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        {preLoading?<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8f7f4',fontSize:'0.875rem',color:'#9b9b96'}}>Chargement des adresses...</div>:<TerrainMap adresses={preMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={()=>{}} dpeFlags={[]}/>}
        {!preLoading&&<div style={{position:'absolute',top:12,right:12,background:'rgba(255,255,255,0.95)',borderRadius:8,padding:'6px 10px',fontSize:'0.72rem',color:'#ea580c',fontWeight:600,border:'1px solid #fed7aa'}}>🌐 Navigation libre</div>}
      </div>
      <div style={{padding:'12px 16px',background:'#fff',borderTop:'1px solid #e8e7e0',flexShrink:0}}>
        <button onClick={()=>handleStartSession(undefined,true)} disabled={loading||preLoading} style={{width:'100%',padding:'14px',borderRadius:12,background:loading?'#9b9b96':'#ea580c',color:'#fff',fontWeight:700,fontSize:'1rem',border:'none',cursor:loading?'not-allowed':'pointer'}}>{loading?'Démarrage...':'🌐 Démarrer la prospection libre →'}</button>
      </div>
    </div>)
  }

  if(appState==='terminee'){
    const cr=rapport?.contacts??[]
    return(<div style={{minHeight:'100dvh',background:'#f8f7f4',display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 16px'}}>
      <div style={{background:'#fff',borderRadius:16,border:'1px solid #e8e7e0',padding:'28px 24px',width:'100%',maxWidth:420}}>
        <div style={{textAlign:'center',marginBottom:20}}><div style={{fontSize:'3rem',marginBottom:10}}>✅</div><h2 style={{fontSize:'1.1rem',fontWeight:700,color:'#1a1a18',marginBottom:4}}>Session clôturée</h2><p style={{fontSize:'0.82rem',color:'#5F5E5A'}}>{session?.type_session==='hors_zone'?`🌐 ${session.commune_nom??'Hors Zone'}`:session?.zones_prospection?.nom??'Zone'}</p></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {[{label:'Visitées',value:rapport?`${rapport.nb_visites}/${nbTotal}`:`${nbVisites}/${nbTotal}`,color:'#1D9E75',bg:'#f0fdf4'},{label:'Couverture',value:rapport&&nbTotal>0?`${Math.round(rapport.nb_visites/nbTotal*100)}%`:`${pctCouvert}%`,color:'#2196F3',bg:'#eff6ff'},{label:'Contacts',value:rapport?.nb_contacts??adresses.filter(a=>a.statut_carte==='contact').length,color:'#FF9800',bg:'#fff7ed'},{label:'Flyers',value:rapport?.nb_flyers??adresses.filter(a=>a.statut_carte==='boite').length,color:'#9C27B0',bg:'#f5f3ff'}].map(s=>(<div key={s.label} style={{background:s.bg,borderRadius:10,padding:'12px',textAlign:'center'}}><div style={{fontSize:'1.5rem',fontWeight:700,color:s.color}}>{s.value}</div><div style={{fontSize:'0.68rem',color:'#9b9b96',marginTop:2}}>{s.label}</div></div>))}
        </div>
        {cr.length>0&&<div style={{marginBottom:16}}><div style={{fontSize:'0.7rem',fontWeight:700,color:'#9b9b96',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.04em'}}>Contacts ({cr.length})</div>{cr.slice(0,5).map((c:any)=>(<div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,background:'#f8f7f4',border:'1px solid #e8e7e0',marginBottom:4}}><div style={{width:28,height:28,borderRadius:'50%',background:'#1D9E75',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><span style={{fontSize:'0.75rem',color:'#fff',fontWeight:700}}>{(c.prenom?.[0]??c.nom?.[0]??'?').toUpperCase()}</span></div><div style={{flex:1}}><div style={{fontSize:'0.82rem',fontWeight:600,color:'#1a1a18'}}>{[c.prenom,c.nom].filter(Boolean).join(' ')||'Contact'}</div>{c.tel1&&<div style={{fontSize:'0.72rem',color:'#9b9b96'}}>{c.tel1}</div>}</div></div>))}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button onClick={()=>router.push('/dashboard')} style={{width:'100%',padding:'12px',borderRadius:10,background:'#1D9E75',color:'#fff',fontWeight:600,fontSize:'0.9rem',border:'none',cursor:'pointer'}}>Retour au dashboard</button>
          <button onClick={()=>router.push('/contacts')} style={{width:'100%',padding:'10px',borderRadius:10,background:'#fff',color:'#1D9E75',fontWeight:600,fontSize:'0.85rem',border:'1.5px solid #bbf7d0',cursor:'pointer'}}>Voir les contacts →</button>
        </div>
      </div>
    </div>)
  }

  return(
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#000'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e8e7e0',padding:'0 12px',height:48,flexShrink:0,display:'flex',alignItems:'center',gap:10,zIndex:10}}>
        <button onClick={()=>setAppState('choix_zone')} style={{background:'none',border:'none',color:'#9b9b96',cursor:'pointer',fontSize:'1rem',padding:'4px'}}>←</button>
        <div style={{display:'flex',alignItems:'center',gap:7,flex:1,minWidth:0}}>
          {isHorsZone?<><span style={{fontSize:'0.9rem'}}>🌐</span><span style={{fontWeight:600,fontSize:'0.875rem',color:'#ea580c',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session?.commune_nom??'Hors Zone'}</span><span style={{fontSize:'0.68rem',fontWeight:600,padding:'1px 5px',borderRadius:8,background:'#fff7ed',color:'#ea580c',flexShrink:0}}>Libre</span></>:<><div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,background:session?.zones_prospection?.couleur??'#1D9E75'}}/><span style={{fontWeight:600,fontSize:'0.875rem',color:'#1a1a18',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session?.zones_prospection?.nom}</span></>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}><div style={{width:80,height:5,background:'#f0efeb',borderRadius:3}}><div style={{width:`${Math.min(pctCouvert,100)}%`,height:'100%',background:isHorsZone?'#ea580c':'#1D9E75',borderRadius:3,transition:'width 0.3s ease'}}/></div><span style={{fontSize:'0.75rem',color:'#5F5E5A',fontWeight:500,minWidth:30}}>{nbVisites}/{nbTotal}</span></div>
        {!isHorsZone&&<button onClick={allerAdresseSuivante} style={{padding:'5px 10px',borderRadius:7,background:'#1D9E75',color:'#fff',border:'none',fontSize:'0.72rem',fontWeight:600,cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Suivante</button>}
        {!isHorsZone&&prochaineAdresseId&&<button onClick={ouvrirGoogleMaps} style={{padding:'5px 8px',borderRadius:7,background:'#eff6ff',color:'#1e40af',border:'1px solid #bfdbfe',fontSize:'0.72rem',fontWeight:600,cursor:'pointer',flexShrink:0}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg></button>}
        <button onClick={handleEndSession} disabled={loading} style={{padding:'5px 10px',borderRadius:7,background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',fontSize:'0.72rem',fontWeight:600,cursor:loading?'not-allowed':'pointer',flexShrink:0}}>Terminer</button>
      </div>
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <TerrainMap adresses={adresses} zonePolygon={null} prochaineAdresseId={prochaineAdresseId} onAdresseClick={handleAdresseClick} dpeFlags={activeDpeFlags}/>
        <div style={{position:'absolute',bottom:sheetOpen?320:16,left:12,background:'rgba(255,255,255,0.95)',borderRadius:8,padding:'6px 10px',fontSize:'0.68rem',color:'#5F5E5A',border:'1px solid #e8e7e0',transition:'bottom 0.3s ease',pointerEvents:'none'}}>
          {[{color:'#ef4444',label:'À faire'},{color:'#3b82f6',label:'Boîté'},{color:'#22c55e',label:'Contact'},{color:'#9b9b96',label:'Autre'}].map(item=>(<div key={item.label} style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}><div style={{width:8,height:8,borderRadius:'50%',background:item.color,flexShrink:0}}/><span>{item.label}</span></div>))}
          {isHorsZone&&<div style={{marginTop:4,paddingTop:4,borderTop:'1px solid #f0efeb',color:'#ea580c',fontWeight:600}}>🌐 Prospection libre</div>}
        </div>
        {isHorsZone&&!showAddressForm&&!placingAddress&&<button onClick={()=>setShowAddressForm(true)} style={{position:'absolute',bottom:sheetOpen?340:100,left:16,width:48,height:48,borderRadius:'50%',background:'#ea580c',color:'#fff',border:'none',fontSize:'1.4rem',fontWeight:700,cursor:'pointer',boxShadow:'0 4px 16px rgba(234,88,12,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>+</button>}
        {isHorsZone&&showAddressForm&&(
          <div style={{position:'absolute',bottom:0,left:0,right:0,background:'#fff',borderRadius:'20px 20px 0 0',padding:'16px 20px 32px',boxShadow:'0 -4px 20px rgba(0,0,0,0.15)',zIndex:500}}>
            <div style={{width:36,height:4,borderRadius:2,background:'#D4D2CC',margin:'0 auto 14px'}}/>
            <div style={{fontWeight:700,fontSize:'0.95rem',color:'#1a1a18',marginBottom:14}}>➕ Ajouter une adresse manuelle</div>
            <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:8,marginBottom:10}}><input placeholder="N°" value={newAddress.numero} onChange={e=>setNewAddress(a=>({...a,numero:e.target.value}))} style={{padding:'9px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:13,outline:'none'}}/><input placeholder="Nom de la voie *" value={newAddress.nom_voie} onChange={e=>setNewAddress(a=>({...a,nom_voie:e.target.value}))} style={{padding:'9px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:13,outline:'none'}}/></div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>{[['individuel','🏠 Maison'],['collectif','🏢 Immeuble'],['mixte','🏪 Mixte'],['activite','🏭 Activité']].map(([v,l])=>(<button key={v} onClick={()=>setNewAddress(a=>({...a,type_habitat:v}))} style={{flex:1,padding:'7px 4px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',background:newAddress.type_habitat===v?'#1D9E75':'#f3f4f6',color:newAddress.type_habitat===v?'#fff':'#374151',border:'none'}}>{l}</button>))}</div>
            {(newAddress.type_habitat==='collectif'||newAddress.type_habitat==='mixte')&&<input type="number" placeholder="Nb boîtes aux lettres" value={newAddress.nb_bal} onChange={e=>setNewAddress(a=>({...a,nb_bal:e.target.value}))} style={{width:'100%',padding:'9px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:13,outline:'none',marginBottom:10,boxSizing:'border-box'}}/>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setShowAddressForm(false)} style={{padding:'10px 16px',borderRadius:10,border:'1.5px solid #E8E6DF',background:'#fff',cursor:'pointer',fontSize:13}}>Annuler</button>
              <button onClick={handlePrepareAddress} disabled={!newAddress.nom_voie.trim()} style={{flex:1,padding:'11px',borderRadius:10,fontWeight:700,fontSize:14,background:!newAddress.nom_voie.trim()?'#E8E6DF':'#ea580c',color:'#fff',border:'none',cursor:!newAddress.nom_voie.trim()?'not-allowed':'pointer'}}>Placer sur la carte →</button>
            </div>
          </div>
        )}
      </div>
      {/* Overlay placement adresse manuelle */}
      {isHorsZone&&placingAddress&&(
        <div style={{position:'absolute',bottom:0,left:0,right:0,background:'#fff',borderRadius:'20px 20px 0 0',padding:'16px 20px 32px',boxShadow:'0 -4px 20px rgba(0,0,0,0.15)',zIndex:500}}>
          <div style={{width:36,height:4,borderRadius:2,background:'#D4D2CC',margin:'0 auto 14px'}}/>
          <div style={{fontWeight:700,fontSize:'0.95rem',color:'#1a1a18',marginBottom:4}}>📍 Placer l'adresse sur la carte</div>
          <div style={{fontSize:'0.78rem',color:'#9b9b96',marginBottom:16}}>{pendingFormData?.numero?`${pendingFormData.numero} `:''}{ pendingFormData?.nom_voie}</div>
          {/* Géolocalisation */}
          <button onClick={handleGeolocate} disabled={geolocating}
            style={{width:'100%',padding:'12px',borderRadius:10,background:geolocating?'#e8e7e0':'#eff6ff',color:geolocating?'#9b9b96':'#1e40af',fontWeight:600,fontSize:'0.9rem',border:'1.5px solid #bfdbfe',cursor:geolocating?'not-allowed':'pointer',marginBottom:12,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
            {geolocating?'Localisation en cours...':'📡 Utiliser ma position GPS'}
          </button>
          {/* Coordonnées manuelles si pas de géoloc */}
          {!placementCoords&&!geolocating&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:'0.72rem',color:'#9b9b96',marginBottom:6,textAlign:'center'}}>ou saisir les coordonnées manuellement</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div><div style={{fontSize:'0.7rem',color:'#9b9b96',marginBottom:3}}>Latitude</div>
                  <input type="number" step="0.000001" placeholder="48.123456"
                    onChange={e=>setPlacementCoords(prev=>({lat:parseFloat(e.target.value)||0,lon:prev?.lon??0}))}
                    style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:12,outline:'none',boxSizing:'border-box'}}/></div>
                <div><div style={{fontSize:'0.7rem',color:'#9b9b96',marginBottom:3}}>Longitude</div>
                  <input type="number" step="0.000001" placeholder="-2.123456"
                    onChange={e=>setPlacementCoords(prev=>({lat:prev?.lat??0,lon:parseFloat(e.target.value)||0}))}
                    style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:12,outline:'none',boxSizing:'border-box'}}/></div>
              </div>
            </div>
          )}
          {/* Position trouvée */}
          {placementCoords&&(
            <div style={{marginBottom:12,padding:'10px 14px',borderRadius:8,background:'#f0fdf4',border:'1px solid #bbf7d0',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:'1.2rem'}}>📍</span>
              <div style={{flex:1}}>
                <div style={{fontSize:'0.82rem',fontWeight:600,color:'#065f46'}}>Position sélectionnée</div>
                <div style={{fontSize:'0.72rem',color:'#6b7280'}}>{placementCoords.lat.toFixed(6)}, {placementCoords.lon.toFixed(6)}</div>
              </div>
              <button onClick={()=>setPlacementCoords(null)} style={{background:'none',border:'none',color:'#9b9b96',cursor:'pointer',fontSize:'1rem'}}>✕</button>
            </div>
          )}
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setPlacingAddress(false);setShowAddressForm(true)}} style={{padding:'10px 16px',borderRadius:10,border:'1.5px solid #E8E6DF',background:'#fff',cursor:'pointer',fontSize:13}}>← Retour</button>
            <button onClick={handleConfirmPlacement} disabled={!placementCoords||savingAddress}
              style={{flex:1,padding:'11px',borderRadius:10,fontWeight:700,fontSize:14,background:!placementCoords||savingAddress?'#E8E6DF':'#ea580c',color:'#fff',border:'none',cursor:!placementCoords||savingAddress?'not-allowed':'pointer'}}>
              {savingAddress?'Enregistrement...':'✓ Confirmer et qualifier →'}
            </button>
          </div>
        </div>
      )}
      {selectedAdresse&&<BottomSheet open={sheetOpen} adresse={selectedAdresse} sessionId={session?.id??''} onClose={()=>{setSheetOpen(false);setSelectedAdresse(null)}} onQualification={handleQualification}/>}
    </div>
  )
}
