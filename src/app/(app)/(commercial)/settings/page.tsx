'use client'

import { useState, useEffect } from 'react'

interface Profil {
  nom: string; prenom: string; telephone: string; email: string
  agence_nom: string; agence_adresse: string; agence_telephone: string; agence_email: string
}

const VIDE: Profil = { nom:'', prenom:'', telephone:'', email:'', agence_nom:'', agence_adresse:'', agence_telephone:'', agence_email:'' }

export default function SettingsPage() {
  const [profil,   setProfil]   = useState<Profil>(VIDE)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew,     setPwNew]     = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwMsg,     setPwMsg]     = useState('')

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/settings/profil')
      if (r.ok) { const d = await r.json(); setProfil(d.profil ?? VIDE) }
      setLoading(false)
    })()
  }, [])

  const save = async () => {
    setSaving(true); setSaved(false)
    const r = await fetch('/api/settings/profil', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(profil),
    })
    setSaving(false)
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  const changePw = async () => {
    setPwMsg('')
    if (pwNew !== pwConfirm) { setPwMsg('Les mots de passe ne correspondent pas'); return }
    if (pwNew.length < 8)    { setPwMsg('Minimum 8 caractères'); return }
    const r = await fetch('/api/settings/password', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ current: pwCurrent, new_password: pwNew }),
    })
    const d = await r.json()
    setPwMsg(r.ok ? '✓ Mot de passe modifié' : (d.error ?? 'Erreur'))
    if (r.ok) { setPwCurrent(''); setPwNew(''); setPwConfirm('') }
  }

  const field = (label: string, key: keyof Profil, type = 'text') => (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:'block', fontSize:'0.75rem', fontWeight:600, color:'#5F5E5A', marginBottom:4 }}>{label}</label>
      <input type={type} value={profil[key]} onChange={e => setProfil(p => ({...p, [key]: e.target.value}))}
        style={{ width:'100%', padding:'9px 12px', border:'1px solid #E8E6DF', borderRadius:8, fontSize:'0.875rem', outline:'none', boxSizing:'border-box' }} />
    </div>
  )

  if (loading) return <div style={{ padding:40, color:'#9b9b96' }}>Chargement...</div>

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:'32px 24px' }}>
      <h1 style={{ fontSize:'1.25rem', fontWeight:700, color:'#1a1a18', marginBottom:28 }}>Paramètres</h1>

      {/* Profil */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6DF', padding:'24px', marginBottom:20 }}>
        <h2 style={{ fontSize:'0.875rem', fontWeight:700, color:'#1a1a18', marginBottom:16, textTransform:'uppercase', letterSpacing:'0.06em' }}>Mon profil</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
          {field('Prénom', 'prenom')}
          {field('Nom', 'nom')}
        </div>
        {field('Téléphone', 'telephone', 'tel')}
        {field('Email', 'email', 'email')}
      </div>

      {/* Agence */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6DF', padding:'24px', marginBottom:20 }}>
        <h2 style={{ fontSize:'0.875rem', fontWeight:700, color:'#1a1a18', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Mon agence</h2>
        <p style={{ fontSize:'0.75rem', color:'#9b9b96', marginBottom:16 }}>Ces informations apparaissent dans les courriers DPE générés.</p>
        {field('Nom de l'agence', 'agence_nom')}
        {field('Adresse', 'agence_adresse')}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
          {field('Téléphone agence', 'agence_telephone', 'tel')}
          {field('Email agence', 'agence_email', 'email')}
        </div>
      </div>

      {/* Bouton save */}
      <button onClick={save} disabled={saving}
        style={{ width:'100%', padding:'11px 0', borderRadius:8, border:'none', background: saving ? '#B4B2A9' : '#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.9rem', cursor:'pointer', marginBottom:24 }}>
        {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer les modifications'}
      </button>

      {/* Mot de passe */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6DF', padding:'24px' }}>
        <h2 style={{ fontSize:'0.875rem', fontWeight:700, color:'#1a1a18', marginBottom:16, textTransform:'uppercase', letterSpacing:'0.06em' }}>Changer le mot de passe</h2>
        {[['Mot de passe actuel', pwCurrent, setPwCurrent], ['Nouveau mot de passe', pwNew, setPwNew], ['Confirmer le nouveau', pwConfirm, setPwConfirm]].map(([label, val, setter]) => (
          <div key={label as string} style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:'0.75rem', fontWeight:600, color:'#5F5E5A', marginBottom:4 }}>{label}</label>
            <input type="password" value={val as string} onChange={e => (setter as any)(e.target.value)}
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #E8E6DF', borderRadius:8, fontSize:'0.875rem', boxSizing:'border-box' }} />
          </div>
        ))}
        {pwMsg && <div style={{ fontSize:'0.8rem', color: pwMsg.startsWith('✓') ? '#1D9E75' : '#E24B4A', marginBottom:8 }}>{pwMsg}</div>}
        <button onClick={changePw}
          style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#1a1a18', color:'#fff', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>
          Changer le mot de passe
        </button>
      </div>
    </div>
  )
}
