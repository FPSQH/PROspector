'use client'

import { useEffect, useState } from 'react'

const TYPE_LABELS: Record<string,string> = {
  interet_vente:'Interet vente',projet_moyen:'Projet moyen terme',projet_long:'Projet long terme',
  voisin_relais:'Voisin relais',recommandation:'Recommandation',commercant:'Commercant',autre:'Autre',
}
const STATUT: Record<string,{label:string;color:string;bg:string}> = {
  prospect:      {label:'Prospect',    color:'#6b7280',bg:'#f3f4f6'},
  qualification: {label:'Découverte',  color:'#1d4ed8',bg:'#dbeafe'},
  estimation:    {label:'Estimation',  color:'#92400e',bg:'#fef3c7'},
  mandat:        {label:'Mandat',      color:'#065f46',bg:'#d1fae5'},
  perdu:         {label:'Perdu',       color:'#b91c1c',bg:'#fee2e2'},
}

// ── Génération mailto fiche contact ────────────────────────────────────
function buildMailto(c: any, addrLabel: string): string {
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ')
  const type = TYPE_LABELS[c.type_contact] ?? c.type_contact ?? ''
  const statut = STATUT[c.statut_pipeline]?.label ?? ''
  const subject = encodeURIComponent('Fiche contact – ' + nom)
  const lines = [
    'Fiche prospect – ' + nom,
    '',
    'Adresse : ' + (addrLabel || 'Non renseignee'),
    'Telephone : ' + (c.tel1 || 'Non renseigne'),
    'Email : ' + (c.email1 || 'Non renseigne'),
    '',
    'Type de contact : ' + type,
    'Statut pipeline : ' + statut,
    c.date_relance ? 'Date de relance : ' + new Date(c.date_relance).toLocaleDateString('fr-FR') : '',
    '',
    'Notes : ' + (c.notes || 'Aucune note'),
    '',
    '---',
    'Envoye depuis PROspector',
  ].filter(l => l !== null)
  return 'mailto:?subject=' + subject + '&body=' + encodeURIComponent(lines.join('\n'))
}

// ── Génération fichier ICS ──────────────────────────────────────────────
function downloadICS(c: any, addrLabel: string) {
  if (!c.date_relance) return
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ')
  const type = TYPE_LABELS[c.type_contact] ?? c.type_contact ?? ''
  const statut = STATUT[c.statut_pipeline]?.label ?? ''

  // Date de relance → événement toute la journée
  const dateStr = c.date_relance.replace(/-/g, '')  // YYYYMMDD
  const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'

  const description = [
    'Prospect : ' + nom,
    'Adresse : ' + (addrLabel || 'Non renseignee'),
    'Telephone : ' + (c.tel1 || 'Non renseigne'),
    'Type : ' + type,
    'Statut : ' + statut,
    '',
    'Notes : ' + (c.notes || 'Aucune note'),
  ].join('\n')

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PROspector//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:relance-' + c.id + '@prospector',
    'DTSTAMP:' + now,
    'DTSTART;VALUE=DATE:' + dateStr,
    'DTEND;VALUE=DATE:' + dateStr,
    'SUMMARY:Relance – ' + nom,
    'DESCRIPTION:' + description.replace(/\n/g, '\\n'),
    'LOCATION:' + (addrLabel || ''),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'relance-' + nom.toLowerCase().replace(/\s+/g, '-') + '.ics'
  link.click()
  URL.revokeObjectURL(link.href)
}

export default function ContactsPage() {
  const [contacts,setContacts]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [selected,setSelected]=useState<any|null>(null)
  const [filtre,setFiltre]=useState('tous')
  const [typeFiltre,setTypeFiltre]=useState('')
  const [recherche,setRecherche]=useState('')
  const [form,setForm]=useState<any>({})
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    let cancelled=false
    setLoading(true)
    const p=new URLSearchParams({filtre,recherche})
    if(typeFiltre)p.set('type_contact',typeFiltre)
    fetch('/api/contacts?'+p)
      .then(r=>r.json())
      .then(d=>{ if(!cancelled){setContacts(d.contacts??[]);setLoading(false)} })
      .catch(()=>{ if(!cancelled){setContacts([]);setLoading(false)} })
    return()=>{cancelled=true}
  },[filtre,typeFiltre,recherche])

  const selectContact=(c:any)=>{ setSelected(c); setForm({...c}) }
  const isR=(c:any)=>c.date_relance&&c.date_relance<=new Date().toISOString().split('T')[0]
  const addr=(a:any)=>a?[a.numero,a.nom_voie,a.code_postal,a.commune].filter(Boolean).join(' '):''
  const nbR=contacts.filter(isR).length
  const st=(s:string)=>STATUT[s]??STATUT.prospect

  const save=async()=>{
    if(!selected)return
    setSaving(true)
    const r=await fetch('/api/contacts/'+selected.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    const d=await r.json()
    setSaving(false)
    if(d.contact){
      const updated={...selected,...d.contact}
      setContacts(p=>p.map(c=>c.id===updated.id?updated:c))
      setSelected(updated)
    }
  }
  const del=async()=>{
    if(!selected)return
    await fetch('/api/contacts/'+selected.id,{method:'DELETE'})
    setContacts(p=>p.filter(c=>c.id!==selected.id))
    setSelected(null)
  }

  const inp:any={width:'100%',padding:'7px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:13,outline:'none',boxSizing:'border-box'}

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#F8F7F4',fontFamily:'-apple-system,sans-serif'}}>
      <div style={{width:selected?360:'100%',maxWidth:selected?360:680,display:'flex',flexDirection:'column',borderRight:'1px solid #E8E6DF',background:'#fff',flexShrink:0}}>
        <div style={{padding:'16px 16px 10px',borderBottom:'1px solid #E8E6DF'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <h1 style={{fontSize:18,fontWeight:700,margin:0}}>Contacts</h1>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {nbR>0&&<span style={{fontSize:12,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#fff7ed',color:'#f97316',border:'1px solid #fed7aa'}}>&#128276; {nbR}</span>}
              <span style={{fontSize:12,color:'#9ca3af'}}>{contacts.length}</span>
            </div>
          </div>
          <input placeholder="Rechercher..." value={recherche} onChange={e=>setRecherche(e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'1.5px solid #E8E6DF',fontSize:13,outline:'none',marginBottom:8,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[['tous','Tous'],['relance','A relancer']].map(([k,v])=>(
              <button key={k} onClick={()=>setFiltre(k)} style={{padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',background:filtre===k?'#1D9E75':'#F0EDE6',color:filtre===k?'#fff':'#5F5E5A',border:'none'}}>{v}</button>
            ))}
            <select value={typeFiltre} onChange={e=>setTypeFiltre(e.target.value)} style={{padding:'3px 8px',borderRadius:20,fontSize:12,border:'1.5px solid #E8E6DF',background:'#fff',cursor:'pointer'}}>
              <option value="">Tous types</option>
              {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {loading?(
            <div style={{padding:40,textAlign:'center',color:'#9ca3af'}}>Chargement...</div>
          ):contacts.length===0?(
            <div style={{padding:40,textAlign:'center',color:'#9ca3af'}}>
              <div style={{fontSize:32,marginBottom:8}}>&#128100;</div>
              <div>Aucun contact</div>
            </div>
          ):contacts.map(c=>{
            const r=isR(c); const s=st(c.statut_pipeline)
            return(
              <div key={c.id} onClick={()=>selectContact(c)} style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid #F0EDE6',background:selected?.id===c.id?'#f0fdf4':r?'#fff7ed':'#fff',borderLeft:selected?.id===c.id?'3px solid #1D9E75':r?'3px solid #f97316':'3px solid transparent'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <div style={{flex:1,fontWeight:600,fontSize:14}}>{c.prenom} {c.nom}</div>
                  <span style={{fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:20,background:s.bg,color:s.color,flexShrink:0}}>{s.label}</span>
                </div>
                <div style={{fontSize:12,color:'#6b7280',marginBottom:2}}>{TYPE_LABELS[c.type_contact]??c.type_contact}</div>
                <div style={{fontSize:11,color:'#9ca3af'}}>{addr(c.adresses)||'Adresse non renseignee'}</div>
                {c.date_relance&&<div style={{fontSize:11,color:r?'#f97316':'#9ca3af',marginTop:4}}>Relance : {new Date(c.date_relance).toLocaleDateString('fr-FR')}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {selected&&(
        <div style={{flex:1,background:'#fff',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid #E8E6DF',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#9ca3af',padding:0}}>&#8592;</button>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15}}>{selected.prenom} {selected.nom}</div>
              <div style={{fontSize:11,color:'#9ca3af'}}>{addr(selected.adresses)}</div>
            </div>
            <span style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:20,background:st(selected.statut_pipeline).bg,color:st(selected.statut_pipeline).color}}>{st(selected.statut_pipeline).label}</span>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
            {/* ── Bouton mail permanent ── */}
            {(() => {
              const nom = [selected.prenom, selected.nom].filter(Boolean).join(' ') || 'Contact'
              const adrStr = addr(selected.adresses)
              const relanceDateLabel = selected.date_relance
                ? new Date(selected.date_relance + 'T12:00:00').toLocaleDateString('fr-FR')
                : ''
              const subject = selected.date_relance
                ? 'Relance contact Prospector pour le ' + relanceDateLabel
                : 'Fiche contact – ' + nom
              const body = [
                'Contact : ' + nom,
                adrStr ? 'Adresse : ' + adrStr : '',
                selected.tel1    ? 'Tél : '    + selected.tel1 : '',
                selected.email1  ? 'Email : '  + selected.email1 : '',
                selected.type_contact ? 'Type : ' + (STATUT[selected.type_contact]?.label ?? selected.type_contact) : '',
                selected.statut_pipeline ? 'Statut : ' + (STATUT[selected.statut_pipeline]?.label ?? selected.statut_pipeline) : '',
                selected.notes   ? 'Notes : '  + selected.notes : '',
                relanceDateLabel ? 'Relance prévue le : ' + relanceDateLabel : '',
              ].filter(Boolean).join('\n')
              const mailtoHref = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)
              return (
                <a href={mailtoHref}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'9px',borderRadius:9,fontWeight:600,fontSize:13,background:'#f0fdf4',color:'#1D9E75',border:'1.5px solid #bbf7d0',textDecoration:'none'}}>
                  ✉️ Envoyer par mail
                </a>
              )
            })()}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>PRENOM</div><input style={inp} value={form.prenom??''} onChange={e=>setForm((f:any)=>({...f,prenom:e.target.value}))}/></div>
              <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>NOM</div><input style={inp} value={form.nom??''} onChange={e=>setForm((f:any)=>({...f,nom:e.target.value}))}/></div>
            </div>
            <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>TELEPHONE</div><input style={inp} value={form.tel1??''} onChange={e=>setForm((f:any)=>({...f,tel1:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>EMAIL</div><input style={inp} value={form.email1??''} onChange={e=>setForm((f:any)=>({...f,email1:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>TYPE</div>
              <select style={inp} value={form.type_contact??''} onChange={e=>setForm((f:any)=>({...f,type_contact:e.target.value}))}>
                {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>STATUT</div>
              <select style={inp} value={form.statut_pipeline??''} onChange={e=>setForm((f:any)=>({...f,statut_pipeline:e.target.value}))}>
                {Object.entries(STATUT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>DATE DE RELANCE</div><input type="date" style={inp} value={form.date_relance??''} onChange={e=>setForm((f:any)=>({...f,date_relance:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:'#9ca3af',fontWeight:600,marginBottom:4}}>NOTES</div>
              <textarea style={{...inp,minHeight:80,resize:'vertical',fontFamily:'inherit'}} value={form.notes??''} onChange={e=>setForm((f:any)=>({...f,notes:e.target.value}))}/></div>
            <div style={{fontSize:11,color:'#d4b896',padding:'6px 10px',background:'#fffbf5',borderRadius:6,border:'1px solid #f5e6d0'}}>Note limitee au projet immobilier (RGPD)</div>
          </div>
          
          {/* Actions rapides : mail + ICS */}
          {(selected.email1 || selected.date_relance) && (
            <div style={{padding:'8px 20px',borderBottom:'1px solid #F0EDE6',display:'flex',gap:8}}>
              {selected.email1 && (
                <a href={buildMailto(selected, addr(selected.adresses))}
                  style={{flex:1,padding:'8px',borderRadius:8,fontSize:12,fontWeight:600,textAlign:'center',background:'#EFF6FF',color:'#1d4ed8',border:'1px solid #bfdbfe',textDecoration:'none',display:'block'}}>
                  &#9993; Envoyer par mail
                </a>
              )}
              {selected.date_relance && (
                <button onClick={()=>downloadICS(selected, addr(selected.adresses))}
                  style={{flex:1,padding:'8px',borderRadius:8,fontSize:12,fontWeight:600,background:'#F0FDF4',color:'#15803d',border:'1px solid #bbf7d0',cursor:'pointer'}}>
                  &#128197; Ajouter au calendrier
                </button>
              )}
            </div>
          )}
          <div style={{padding:'12px 20px',borderTop:'1px solid #E8E6DF',display:'flex',gap:8,flexShrink:0}}>
            <button onClick={save} disabled={saving} style={{flex:1,padding:'9px',borderRadius:8,fontWeight:600,fontSize:13,background:saving?'#E8E6DF':'#1D9E75',color:'#fff',border:'none',cursor:'pointer'}}>{saving?'...':'Enregistrer'}</button>
            <button onClick={del} style={{padding:'9px 14px',borderRadius:8,fontSize:13,background:'#fff',color:'#E24B4A',border:'1.5px solid #E24B4A',cursor:'pointer'}}>Supprimer</button>
          </div>
        </div>
      )}
    </div>
  )
}
