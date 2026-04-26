'use client'
import{useState,useEffect}from'react'
interface P{nom:string;prenom:string;telephone:string;email:string;agence_nom:string;agence_adresse:string;agence_telephone:string;agence_email:string}
const V:P={nom:'',prenom:'',telephone:'',email:'',agence_nom:'',agence_adresse:'',agence_telephone:'',agence_email:''}
function F({label,value,type='text',onChange}:{label:string;value:string;type?:string;onChange:(v:string)=>void}){
  return(<div style={{marginBottom:16}}><label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#5F5E5A',marginBottom:4}}>{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={{width:'100%',padding:'9px 12px',border:'1px solid #E8E6DF',borderRadius:8,fontSize:'0.875rem',boxSizing:'border-box'}}/></div>)
}
export default function SettingsPage(){
  const[p,setP]=useState<P>(V)
  const[loading,setL]=useState(true)
  const[saving,setSv]=useState(false)
  const[saved,setSd]=useState(false)
  const[pwC,setPwC]=useState('');const[pwN,setPwN]=useState('');const[pwCo,setPwCo]=useState('');const[pwMsg,setPwMsg]=useState('')
  useEffect(()=>{(async()=>{const r=await fetch('/api/settings/profil');if(r.ok){const d=await r.json();setP(d.profil??V)}setL(false)})()} ,[])
  const s=(k:keyof P)=>(v:string)=>setP(prev=>({...prev,[k]:v}))
  const save=async()=>{setSv(true);setSd(false);const r=await fetch('/api/settings/profil',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});setSv(false);if(r.ok){setSd(true);setTimeout(()=>setSd(false),3000)}}
  const chpw=async()=>{setPwMsg('');if(pwN!==pwCo){setPwMsg('Mots de passe differents');return}if(pwN.length<8){setPwMsg('Min 8 caracteres');return}const r=await fetch('/api/settings/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current:pwC,new_password:pwN})});const d=await r.json();setPwMsg(r.ok?'Mot de passe modifie !':(d.error??'Erreur'));if(r.ok){setPwC('');setPwN('');setPwCo('')}}
  if(loading)return<div style={{padding:40,color:'#9b9b96'}}>Chargement...</div>
  return(
    <div style={{maxWidth:640,margin:'0 auto',padding:'32px 24px'}}>
      <h1 style={{fontSize:'1.25rem',fontWeight:700,color:'#1a1a18',marginBottom:28}}>Parametres</h1>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8E6DF',padding:24,marginBottom:20}}>
        <h2 style={{fontSize:'0.875rem',fontWeight:700,marginBottom:16,textTransform:'uppercase'}}>Mon profil</h2>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <F label="Prenom" value={p.prenom} onChange={s('prenom')}/>
          <F label="Nom" value={p.nom} onChange={s('nom')}/>
        </div>
        <F label="Telephone" value={p.telephone} type="tel" onChange={s('telephone')}/>
        <F label="Email" value={p.email} type="email" onChange={s('email')}/>
      </div>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8E6DF',padding:24,marginBottom:20}}>
        <h2 style={{fontSize:'0.875rem',fontWeight:700,marginBottom:4,textTransform:'uppercase'}}>Mon agence</h2>
        <p style={{fontSize:'0.75rem',color:'#9b9b96',marginBottom:16}}>Ces infos apparaissent dans les courriers DPE.</p>
        <F label="Nom agence" value={p.agence_nom} onChange={s('agence_nom')}/>
        <F label="Adresse" value={p.agence_adresse} onChange={s('agence_adresse')}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <F label="Tel agence" value={p.agence_telephone} type="tel" onChange={s('agence_telephone')}/>
          <F label="Email agence" value={p.agence_email} type="email" onChange={s('agence_email')}/>
        </div>
      </div>
      <button onClick={save} disabled={saving} style={{width:'100%',padding:'11px 0',borderRadius:8,border:'none',background:saving?'#B4B2A9':'#1D9E75',color:'#fff',fontWeight:600,cursor:'pointer',marginBottom:24}}>{saving?'Enregistrement...':saved?'Enregistre !':'Enregistrer'}</button>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8E6DF',padding:24}}>
        <h2 style={{fontSize:'0.875rem',fontWeight:700,marginBottom:16,textTransform:'uppercase'}}>Changer le mot de passe</h2>
        <F label="Actuel" value={pwC} type="password" onChange={setPwC}/>
        <F label="Nouveau" value={pwN} type="password" onChange={setPwN}/>
        <F label="Confirmer" value={pwCo} type="password" onChange={setPwCo}/>
        {pwMsg&&<div style={{fontSize:'0.8rem',color:pwMsg.includes('!')? '#1D9E75':'#E24B4A',marginBottom:8}}>{pwMsg}</div>}
        <button onClick={chpw} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#1a1a18',color:'#fff',cursor:'pointer'}}>Changer</button>
      </div>
    </div>
  )
}