'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Commune { code_insee: string; nom: string; code_postal: string; ban_chargee: boolean }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6DF', marginBottom:16, overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #F0EDE6', fontWeight:700, fontSize:14, color:'#1a1a1a' }}>{title}</div>
      <div style={{ padding:'20px' }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:5 }}>{label}</div>
      {children}
    </div>
  )
}

const inp: any = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }
const btn = (bg: string, color='#fff'): any => ({ padding:'9px 18px', borderRadius:8, fontWeight:600, fontSize:13, background:bg, color, border:'none', cursor:'pointer' })

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()

  // Profil
  const [email, setEmail]     = useState('')
  const [prenom, setPrenom]   = useState('')
  const [nom, setNom]         = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // Mot de passe
  const [pwdCurrent, setPwdCurrent] = useState('')
  const [pwdNew, setPwdNew]         = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdMsg, setPwdMsg]         = useState('')
  const [pwdSaving, setPwdSaving]   = useState(false)

  // Communes
  const [communes, setCommunes]       = useState<Commune[]>([])
  const [communeSearch, setCommuneSearch] = useState('')
  const [communeResults, setCommuneResults] = useState<any[]>([])
  const [communeLoading, setCommuneLoading] = useState(false)
  const [communeMsg, setCommuneMsg]   = useState('')

  // Chargement initial
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (!cancelled) setEmail(user.email ?? '')

      // Profil depuis commerciaux
      const r = await fetch('/api/communes')
      const d = await r.json()
      if (!cancelled) setCommunes(d.communes ?? [])

      // Nom/prénom depuis commerciaux
      const { data: commercial } = await supabase
        .from('commerciaux')
        .select('prenom, nom')
        .eq('id', user.id)
        .single()
      if (!cancelled && commercial) {
        setPrenom(commercial.prenom ?? '')
        setNom(commercial.nom ?? '')
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  // Sauvegarde profil
  const saveProfile = async () => {
    setProfileSaving(true); setProfileMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('commerciaux').update({ prenom, nom }).eq('id', user.id)
    setProfileSaving(false)
    setProfileMsg(error ? 'Erreur : ' + error.message : 'Profil mis a jour')
    setTimeout(() => setProfileMsg(''), 3000)
  }

  // Changement mot de passe
  const savePassword = async () => {
    if (pwdNew !== pwdConfirm) { setPwdMsg('Les mots de passe ne correspondent pas'); return }
    if (pwdNew.length < 8) { setPwdMsg('Minimum 8 caracteres'); return }
    setPwdSaving(true); setPwdMsg('')
    const { error } = await supabase.auth.updateUser({ password: pwdNew })
    setPwdSaving(false)
    if (error) { setPwdMsg('Erreur : ' + error.message) }
    else { setPwdMsg('Mot de passe mis a jour'); setPwdCurrent(''); setPwdNew(''); setPwdConfirm('') }
    setTimeout(() => setPwdMsg(''), 4000)
  }

  // Recherche commune
  useEffect(() => {
    if (communeSearch.length < 2) { setCommuneResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setCommuneLoading(true)
      const r = await fetch('/api/communes/search?q=' + encodeURIComponent(communeSearch))
      const d = await r.json()
      if (!cancelled) { setCommuneResults(d.communes ?? []); setCommuneLoading(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [communeSearch])

  const addCommune = async (c: any) => {
    setCommuneMsg('')
    const r = await fetch('/api/communes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_insee: c.code_insee, nom: c.nom, code_postal: c.code_postal })
    })
    const d = await r.json()
    if (d.error) { setCommuneMsg('Erreur : ' + d.error); return }
    setCommunes(prev => [...prev, { code_insee: c.code_insee, nom: c.nom, code_postal: c.code_postal, ban_chargee: false }])
    setCommuneSearch(''); setCommuneResults([])
    setCommuneMsg('Commune ajoutee. Chargement BAN en cours...')
    // Déclencher l'ingestion BAN
    fetch('/api/ingestion/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code_insee: c.code_insee }) })
      .then(r => r.json())
      .then(d => { setCommuneMsg(d.error ? 'BAN : ' + d.error : 'BAN chargee pour ' + c.nom) })
      .catch(() => setCommuneMsg('Erreur lors du chargement BAN'))
    setTimeout(() => setCommuneMsg(''), 5000)
  }

  const removeCommune = async (code_insee: string) => {
    if (!confirm('Supprimer cette commune de votre secteur ?')) return
    const r = await fetch('/api/communes/' + code_insee, { method: 'DELETE' })
    if (r.ok) setCommunes(prev => prev.filter(c => c.code_insee !== code_insee))
  }

  const alreadyAdded = (code_insee: string) => communes.some(c => c.code_insee === code_insee)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ maxWidth:580, margin:'0 auto', padding:'24px 16px', fontFamily:'-apple-system,sans-serif' }}>
      <h1 style={{ fontSize:20, fontWeight:700, marginBottom:20 }}>Parametres</h1>

      {/* ── Profil ── */}
      <Section title="Profil">
        <Field label="EMAIL"><div style={{ padding:'9px 12px', borderRadius:8, background:'#F8F7F4', fontSize:13, color:'#6b7280' }}>{email}</div></Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="PRENOM"><input style={inp} value={prenom} onChange={e=>setPrenom(e.target.value)} placeholder="Votre prenom"/></Field>
          <Field label="NOM"><input style={inp} value={nom} onChange={e=>setNom(e.target.value)} placeholder="Votre nom"/></Field>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={saveProfile} disabled={profileSaving} style={btn(profileSaving?'#E8E6DF':'#1D9E75')}>
            {profileSaving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {profileMsg && <span style={{ fontSize:13, color: profileMsg.startsWith('Erreur') ? '#E24B4A' : '#1D9E75' }}>{profileMsg}</span>}
        </div>
      </Section>

      {/* ── Mot de passe ── */}
      <Section title="Mot de passe">
        <Field label="NOUVEAU MOT DE PASSE"><input type="password" style={inp} value={pwdNew} onChange={e=>setPwdNew(e.target.value)} placeholder="8 caracteres minimum"/></Field>
        <Field label="CONFIRMER"><input type="password" style={inp} value={pwdConfirm} onChange={e=>setPwdConfirm(e.target.value)} placeholder="Repeter le mot de passe"/></Field>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={savePassword} disabled={pwdSaving || !pwdNew} style={btn(pwdSaving||!pwdNew?'#E8E6DF':'#1D9E75')}>
            {pwdSaving ? 'Modification...' : 'Modifier le mot de passe'}
          </button>
          {pwdMsg && <span style={{ fontSize:13, color: pwdMsg.startsWith('Erreur')||pwdMsg.includes('correspondent')||pwdMsg.includes('Minimum') ? '#E24B4A' : '#1D9E75' }}>{pwdMsg}</span>}
        </div>
      </Section>

      {/* ── Communes ── */}
      <Section title="Mon secteur (communes)">
        {/* Communes actives */}
        <div style={{ marginBottom:16 }}>
          {communes.length === 0 ? (
            <div style={{ fontSize:13, color:'#9ca3af', fontStyle:'italic' }}>Aucune commune configuree</div>
          ) : communes.map(c => (
            <div key={c.code_insee} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, border:'1px solid #E8E6DF', marginBottom:6, background:'#F8F7F4' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{c.nom}</div>
                <div style={{ fontSize:11, color:'#9ca3af' }}>{c.code_postal} · INSEE {c.code_insee}</div>
              </div>
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background: c.ban_chargee ? '#d1fae5' : '#fef3c7', color: c.ban_chargee ? '#065f46' : '#92400e', fontWeight:600 }}>
                {c.ban_chargee ? 'BAN OK' : 'BAN en attente'}
              </span>
              <button onClick={() => removeCommune(c.code_insee)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:16, padding:'0 4px' }}>&#10005;</button>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <Field label="AJOUTER UNE COMMUNE">
          <div style={{ position:'relative' }}>
            <input style={inp} value={communeSearch} onChange={e=>setCommuneSearch(e.target.value)} placeholder="Nom ou code postal..."/>
            {communeLoading && <div style={{ position:'absolute', right:10, top:9, fontSize:12, color:'#9ca3af' }}>...</div>}
          </div>
          {communeResults.length > 0 && (
            <div style={{ border:'1px solid #E8E6DF', borderRadius:8, overflow:'hidden', marginTop:4, boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}>
              {communeResults.slice(0,6).map((c: any) => (
                <div key={c.code_insee} onClick={() => !alreadyAdded(c.code_insee) && addCommune(c)}
                  style={{ padding:'9px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #F0EDE6', cursor: alreadyAdded(c.code_insee) ? 'default' : 'pointer', background: alreadyAdded(c.code_insee) ? '#F8F7F4' : '#fff' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{c.nom}</div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>{c.code_postal} · {c.code_insee}</div>
                  </div>
                  {alreadyAdded(c.code_insee)
                    ? <span style={{ fontSize:11, color:'#1D9E75', fontWeight:600 }}>&#10003; Deja dans le secteur</span>
                    : <span style={{ fontSize:12, color:'#1D9E75', fontWeight:600 }}>+ Ajouter</span>
                  }
                </div>
              ))}
            </div>
          )}
        </Field>
        {communeMsg && <div style={{ fontSize:13, color: communeMsg.startsWith('Erreur') ? '#E24B4A' : '#1D9E75', marginTop:4 }}>{communeMsg}</div>}
      </Section>

      {/* ── Déconnexion ── */}
      <Section title="Session">
        <button onClick={handleSignOut} style={btn('#fff', '#E24B4A')}>
          Se deconnecter
        </button>
      </Section>
    </div>
  )
}
