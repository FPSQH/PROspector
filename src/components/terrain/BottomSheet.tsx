'use client'

import { useState, useRef, useEffect } from 'react'

interface Adresse {
  id: string; numero?: string; nom_voie?: string; code_postal?: string; commune?: string
  type_bien?: string; nb_bal?: number; has_commerce?: boolean
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  interaction?: { resultat?: string; action?: string; type_habitat?: string }
  score?: number
  latest_dpe_date?: string | null
}

const btn = (active: boolean, color = '#1D9E75'): any => ({
  flex: 1, padding: '10px 6px', borderRadius: 10, fontWeight: 600, fontSize: 13,
  border: active ? 'none' : '1.5px solid #E8E6DF',
  background: active ? color : '#fff',
  color: active ? '#fff' : '#5F5E5A', cursor: 'pointer', transition: 'all 0.12s',
})

const chipBtn = (active: boolean, color = '#1D9E75'): any => ({
  padding: '7px 12px', borderRadius: 20, fontWeight: 600, fontSize: 12,
  border: active ? 'none' : '1.5px solid #E8E6DF',
  background: active ? color : '#fff',
  color: active ? '#fff' : '#5F5E5A', cursor: 'pointer',
})

export default function BottomSheet({
  adresse, open, onClose, onQualification, sessionId
}: {
  adresse: Adresse; open: boolean; onClose: () => void
  onQualification: (data: any) => void; sessionId?: string
}) {
  // Niveau 1 — résultat principal
  const [step, setStep]               = useState<'main'|'pas_reponse'|'contact'|'exclure'>('main')
  // Niveau 2a — pas de réponse
  const [typeHabitat, setTypeHabitat] = useState(adresse.type_habitat ?? '')
  const [action, setAction]           = useState('')
  const [nbBal, setNbBal]             = useState<string>(adresse.nb_bal?.toString() ?? '')
  const [courrierCible, setCourrierCible] = useState(false)
  // Niveau 2b — contact
  const [profil, setProfil]           = useState('')
  const [typeProjet, setTypeProjet]   = useState<string[]>([])
  const [horizon, setHorizon]         = useState('')
  const [autreProjet, setAutreProjet] = useState(false)
  const [note, setNote]               = useState('')
  const [dateRelance, setDateRelance] = useState('')
  const [contact, setContact]         = useState({ nom:'', prenom:'', tel1:'', email1:'' })
  const [showContactForm, setShowContactForm] = useState(false)
  // Niveau 2c — exclusion
  const [motifExclusion, setMotifExclusion] = useState('')
  const [nomSyndic, setNomSyndic]     = useState('')
  const [saving, setSaving]           = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setStep('main')
      setTypeHabitat(adresse.type_habitat ?? adresse.interaction?.type_habitat ?? '')
      setNbBal(adresse.nb_bal?.toString() ?? '')
      setAction(''); setCourrierCible(false)
      setProfil(''); setTypeProjet([]); setHorizon(''); setAutreProjet(false)
      setNote(''); setDateRelance(''); setMotifExclusion('')
      setContact({ nom:'', prenom:'', tel1:'', email1:'' })
      setNomSyndic('')
      setShowContactForm(false)
    }
  }, [open, adresse])

  if (!open) return null

  const toggleProjet = (v: string) =>
    setTypeProjet(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  const adresseLabel = [adresse.numero, adresse.nom_voie].filter(Boolean).join(' ')
  const isCollectif  = typeHabitat === 'collectif'
  const isIndividuel = typeHabitat === 'individuel'

  const submitPasReponse = async (overrideAction?: string) => {
    const finalAction = overrideAction || action
    if (!finalAction) return
    setSaving(true)
    // Mettre à jour adresse si nouveaux champs
    const adresseUpdate: any = {}
    if (typeHabitat && typeHabitat !== adresse.type_habitat) adresseUpdate.type_habitat = typeHabitat
    if (nbBal && parseInt(nbBal) !== adresse.nb_bal) adresseUpdate.nb_bal = parseInt(nbBal)
    if (nomSyndic.trim()) adresseUpdate.nom_syndic = nomSyndic.trim()
    if (courrierCible) adresseUpdate.courrier_cible_possible = true
    if (Object.keys(adresseUpdate).length) {
      await fetch('/api/adresses/' + adresse.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adresseUpdate)
      })
    }
    // Créer interaction
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse_id: adresse.id, session_id: sessionId,
        resultat: 'pas_de_reponse', action: finalAction,
        type_habitat_observe: typeHabitat || null,
        observations_terrain: courrierCible ? { courrier_possible: true } : {},
      })
    })
    setSaving(false)
    onQualification({ resultat: 'pas_de_reponse', action: finalAction, type_habitat: typeHabitat })
    onClose()
  }

  const submitExclusion = async () => {
    if (!motifExclusion) return
    setSaving(true)
    await fetch('/api/adresses/' + adresse.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut_prospectabilite: 'non_prospectable', motif_exclusion: motifExclusion, mode_prospection: 'exclure' })
    })
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adresse_id: adresse.id, session_id: sessionId, resultat: 'exclusion', action: 'rien', observations_terrain: { motif_exclusion: motifExclusion } })
    })
    setSaving(false)
    onQualification({ resultat: 'exclusion', motif_exclusion: motifExclusion })
    onClose()
  }

  const submitContact = async () => {
    setSaving(true)
    // Mettre à jour adresse
    const adresseUpdate: any = {}
    if (typeHabitat && typeHabitat !== adresse.type_habitat) adresseUpdate.type_habitat = typeHabitat
    if (Object.keys(adresseUpdate).length) {
      await fetch('/api/adresses/' + adresse.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adresseUpdate)
      })
    }
    // Créer interaction
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse_id: adresse.id, session_id: sessionId,
        resultat: 'contact', action: 'rien',
        type_habitat_observe: typeHabitat || null,
        notes: note || null,
      })
    })
    // Créer contact si renseigné
    let contactId = null
    if (showContactForm && (contact.nom || contact.prenom || contact.tel1)) {
      const cr = await fetch('/api/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adresse_id: adresse.id,
          nom: contact.nom || null, prenom: contact.prenom || null,
          tel1: contact.tel1 || null, email1: contact.email1 || null,
          profil_interlocuteur: profil || null,
          type_contact: typeProjet.includes('vente') ? 'interet_vente' : typeProjet.length ? 'autre' : null,
          statut_pipeline: 'prospect',
          notes: note || null,
          date_relance: dateRelance || null,
          autre_projet_connu: autreProjet,
        })
      })
      const cd = await cr.json()
      contactId = cd.contact?.id
      // Créer projet si type renseigné
      if (contactId && typeProjet.length) {
        await fetch('/api/projets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: contactId,
            type_projet: typeProjet,
            horizon_projet: horizon || 'inconnu',
          })
        })
      }
    }
    setSaving(false)
    onQualification({ resultat: 'contact', profil, type_projet: typeProjet, contact_id: contactId })
    onClose()
  }

  const overlay: any = { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:900, display:'flex', alignItems:'flex-end' }
  const sheet: any  = { background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'90vh', overflowY:'auto', padding:'0 0 32px' }
  const handle: any = { width:36, height:4, borderRadius:2, background:'#D4D2CC', margin:'10px auto 0' }
  const section: any = { padding:'12px 20px 0' }
  const label: any  = { fontSize:11, color:'#9ca3af', fontWeight:700, letterSpacing:'0.05em', marginBottom:8, display:'block' }
  const row: any    = { display:'flex', gap:8, flexWrap:'wrap' }

  return (
    <div style={overlay} onClick={e => { if(e.target === e.currentTarget) onClose() }}>
      <div ref={sheetRef} style={sheet}>
        <div style={handle}/>

        {/* Quick Actions - Ergonomie optimisée */}
        <div style={{ padding: '16px 20px 8px', display: 'flex', gap: 10 }}>
          <button
            onClick={() => submitPasReponse('flyer')}
            disabled={saving}
            style={{
              flex: 1, height: 48, borderRadius: 12, background: '#f0fdf4', border: '1.5px solid #bbf7d0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 14, fontWeight: 700, color: '#166534', cursor: 'pointer'
            }}
          >
            📄 Flyer
          </button>
          <button
            onClick={() => submitPasReponse('rien')}
            disabled={saving}
            style={{
              flex: 1, height: 48, borderRadius: 12, background: '#f8f9fa', border: '1.5px solid #e9ecef',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 14, fontWeight: 700, color: '#495057', cursor: 'pointer'
            }}
          >
            ⚪ Rien
          </button>
        </div>

        <div style={{ margin: '0 20px', height: 1, background: '#F0EDE6' }} />

        {/* Header adresse */}
        <div style={{ padding:'12px 20px 10px', borderBottom:'1px solid #F0EDE6' }}>
          <div style={{ fontWeight:700, fontSize:15 }}>{adresseLabel || 'Adresse'}</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ fontSize:12, color:'#9ca3af' }}>{adresse.commune}</div>
            {adresse.score !== undefined && (
              <div style={{
                fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                background: adresse.score >= 80 ? '#dcfce7' : adresse.score >= 60 ? '#fef9c3' : '#f3f4f6',
                color: adresse.score >= 80 ? '#15803d' : adresse.score >= 60 ? '#a16207' : '#6b7280',
              }}>
                {adresse.score >= 80 ? '🔥 ' : adresse.score >= 60 ? '⭐ ' : ''}{adresse.score}/100
              </div>
            )}
            {adresse.latest_dpe_date && (
              <div style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'#eff6ff', color:'#1d4ed8', fontWeight:600 }}>
                DPE {new Date(adresse.latest_dpe_date).toLocaleDateString('fr-FR', {month:'short', year:'numeric'})}
              </div>
            )}
          </div>
        </div>

        {/* ── NIVEAU 1 : Résultat principal ── */}
        {step === 'main' && (
          <div style={section}>
            <span style={label}>QUE SE PASSE-T-IL ?</span>
            <div style={{ display:'flex', gap:10 }}>
              <button style={btn(false)} onClick={() => setStep('pas_reponse')}>
                🚪 Pas de réponse
              </button>
              <button style={btn(false, '#1D9E75')} onClick={() => setStep('contact')}>
                🤝 Contact
              </button>
              <button style={btn(false, '#E24B4A')} onClick={() => setStep('exclure')}>
                ✕ Exclure
              </button>
            </div>
          </div>
        )}

        {/* ── NIVEAU 2a : Pas de réponse ── */}
        {step === 'pas_reponse' && (
          <>
            <div style={section}>
              <span style={label}>TYPE DE BIEN</span>
              <div style={row}>
                {[['individuel','🏠 Maison'],['collectif','🏢 Immeuble'],['mixte','🏪 Mixte'],['activite','🏭 Activité']].map(([v,l]) => (
                  <button key={v} style={chipBtn(typeHabitat===v)} onClick={() => setTypeHabitat(v)}>{l}</button>
                ))}
              </div>
            </div>

            {(isCollectif || typeHabitat === 'mixte') && (
              <div style={section}>
                <span style={label}>NB BOÎTES AUX LETTRES</span>
                <input type="number" value={nbBal} onChange={e=>setNbBal(e.target.value)} placeholder="Ex: 12"
                  style={{ width:100, padding:'8px 12px', borderRadius:8, border:'1.5px solid #E8E6DF', fontSize:14, outline:'none' }}/>
              </div>
            )}
            {(isCollectif || typeHabitat === 'mixte') && (
              <div style={section}>
                <span style={label}>NOM DU SYNDIC (optionnel)</span>
                <input type="text" value={nomSyndic} onChange={e=>setNomSyndic(e.target.value)} placeholder="Ex: Foncia, Nexity Lamy..."
                  style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
              </div>
            )}

            <div style={section}>
              <span style={label}>ACTION</span>
              <div style={{ display:'flex', gap:10 }}>
                <button style={btn(action==='flyer')} onClick={() => setAction('flyer')}>📄 Flyer déposé</button>
                <button style={btn(action==='rien', '#9ca3af')} onClick={() => setAction('rien')}>— Rien</button>
              </div>
            </div>

            {isIndividuel && (
              <div style={{ padding:'10px 20px 0', display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={() => setCourrierCible(!courrierCible)}
                  style={{ width:22, height:22, borderRadius:6, border:'1.5px solid #E8E6DF', background: courrierCible ? '#1D9E75' : '#fff', cursor:'pointer', fontSize:14, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {courrierCible ? '✓' : ''}
                </button>
                <span style={{ fontSize:13, color:'#5F5E5A' }}>Courrier nominatif possible</span>
              </div>
            )}

            <div style={{ padding:'16px 20px 0', display:'flex', gap:10 }}>
              <button onClick={() => setStep('main')} style={{ padding:'10px 16px', borderRadius:10, border:'1.5px solid #E8E6DF', background:'#fff', cursor:'pointer', fontSize:13 }}>← Retour</button>
              <button onClick={submitPasReponse} disabled={!action || saving}
                style={{ flex:1, padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background: !action || saving ? '#E8E6DF' : '#1D9E75', color:'#fff', border:'none', cursor: !action || saving ? 'not-allowed':'pointer' }}>
                {saving ? 'Enregistrement...' : 'Valider'}
              </button>
            </div>
          </>
        )}

        {/* ── NIVEAU 2b : Contact ── */}
        {step === 'contact' && (
          <>
            <div style={section}>
              <span style={label}>PROFIL</span>
              <div style={row}>
                {[['proprio_occupant','Proprio'],['locataire','Locataire'],['voisin','Voisin'],['gardien','Gardien'],['commercant','Commerçant'],['autre','Autre']].map(([v,l]) => (
                  <button key={v} style={chipBtn(profil===v)} onClick={() => setProfil(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={section}>
              <span style={label}>TYPE DE PROJET (plusieurs possibles)</span>
              <div style={row}>
                {[['vente','🏷 Vente'],['achat','🔑 Achat'],['estimation','📊 Estimation'],['investissement','💰 Invest.'],['location','🏠 Location'],['pas_de_projet','— Pas de projet']].map(([v,l]) => (
                  <button key={v} style={chipBtn(typeProjet.includes(v))} onClick={() => toggleProjet(v)}>{l}</button>
                ))}
              </div>
            </div>

            {typeProjet.length > 0 && (
              <div style={section}>
                <span style={label}>HORIZON</span>
                <div style={row}>
                  {[['moins_6_mois','< 6 mois'],['6_12_mois','6-12 mois'],['1_2_ans','1-2 ans'],['plus_2_ans','+ 2 ans']].map(([v,l]) => (
                    <button key={v} style={chipBtn(horizon===v)} onClick={() => setHorizon(v)}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding:'10px 20px 0', display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => setAutreProjet(!autreProjet)}
                style={{ width:22, height:22, borderRadius:6, border:'1.5px solid #E8E6DF', background: autreProjet ? '#1D9E75' : '#fff', cursor:'pointer', fontSize:14, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {autreProjet ? '✓' : ''}
              </button>
              <span style={{ fontSize:13, color:'#5F5E5A' }}>Autre projet connu dans l&apos;entourage</span>
            </div>

            <div style={section}>
              <span style={label}>NOTE</span>
              <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Note courte sur le projet..." maxLength={200}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid #E8E6DF', fontSize:13, resize:'none', minHeight:60, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
            </div>

            <div style={section}>
              <span style={label}>DATE DE RELANCE</span>
              <input type="date" value={dateRelance} onChange={e=>setDateRelance(e.target.value)}
                style={{ padding:'9px 12px', borderRadius:10, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none' }}/>
            </div>

            {/* Fiche contact optionnelle */}
            <div style={{ padding:'10px 20px 0' }}>
              <button onClick={() => setShowContactForm(!showContactForm)}
                style={{ fontSize:13, color:'#1D9E75', fontWeight:600, background:'none', border:'none', cursor:'pointer', padding:0 }}>
                {showContactForm ? '▾ Masquer la fiche contact' : '＋ Créer une fiche contact'}
              </button>
            </div>

            {showContactForm && (
              <div style={{ padding:'10px 20px 0', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <input placeholder="Prénom" value={contact.prenom} onChange={e=>setContact(c=>({...c,prenom:e.target.value}))}
                    style={{ padding:'9px 12px', borderRadius:10, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none' }}/>
                  <input placeholder="Nom" value={contact.nom} onChange={e=>setContact(c=>({...c,nom:e.target.value}))}
                    style={{ padding:'9px 12px', borderRadius:10, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none' }}/>
                </div>
                <input placeholder="Téléphone" value={contact.tel1} onChange={e=>setContact(c=>({...c,tel1:e.target.value}))}
                  style={{ padding:'9px 12px', borderRadius:10, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none' }}/>
                <input placeholder="Email (optionnel)" value={contact.email1} onChange={e=>setContact(c=>({...c,email1:e.target.value}))}
                  style={{ padding:'9px 12px', borderRadius:10, border:'1.5px solid #E8E6DF', fontSize:13, outline:'none' }}/>
              </div>
            )}

            <div style={{ padding:'16px 20px 0', display:'flex', gap:10 }}>
              <button onClick={() => setStep('main')} style={{ padding:'10px 16px', borderRadius:10, border:'1.5px solid #E8E6DF', background:'#fff', cursor:'pointer', fontSize:13 }}>← Retour</button>
              <button onClick={submitContact} disabled={saving}
                style={{ flex:1, padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background: saving ? '#E8E6DF' : '#1D9E75', color:'#fff', border:'none', cursor: saving ? 'not-allowed':'pointer' }}>
                {saving ? 'Enregistrement...' : 'Valider le contact'}
              </button>
            </div>
          </>
        )}

        {/* ── NIVEAU 2c : Exclusion ── */}
        {step === 'exclure' && (
          <>
            <div style={section}>
              <span style={label}>MOTIF D&apos;EXCLUSION</span>
              <div style={row}>
                {[
                  ['parc_public','Parc public / HLM'],
                  ['administration','Administration'],
                  ['equipement_public','Équipement public'],
                  ['bureaux_uniquement','Bureaux seuls'],
                  ['commerce_uniquement','Commerce seul'],
                  ['site_ferme','Site fermé'],
                  ['doublon_ban','Doublon BAN'],
                  ['autre','Autre'],
                ].map(([v,l]) => (
                  <button key={v} style={chipBtn(motifExclusion===v, '#E24B4A')} onClick={() => setMotifExclusion(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ padding:'16px 20px 0', display:'flex', gap:10 }}>
              <button onClick={() => setStep('main')} style={{ padding:'10px 16px', borderRadius:10, border:'1.5px solid #E8E6DF', background:'#fff', cursor:'pointer', fontSize:13 }}>← Retour</button>
              <button onClick={submitExclusion} disabled={!motifExclusion || saving}
                style={{ flex:1, padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background: !motifExclusion || saving ? '#E8E6DF' : '#E24B4A', color:'#fff', border:'none', cursor: !motifExclusion || saving ? 'not-allowed':'pointer' }}>
                {saving ? 'Enregistrement...' : 'Exclure cette adresse'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
