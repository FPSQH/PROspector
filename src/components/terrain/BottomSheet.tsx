'use client'

import { useState, useRef, useEffect } from 'react'

interface Adresse {
  id: string; numero?: string; nom_voie?: string; code_postal?: string; commune?: string
  type_bien?: string; nb_bal?: number; has_commerce?: boolean
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  interaction?: { resultat?: string; action?: string; type_habitat?: string }
  score?: number; latest_dpe_date?: string | null; nom_syndic?: string
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

const section: any = { padding: '16px 20px 0' }
const label: any   = { fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 6, display: 'block' }
const row: any     = { display: 'flex', flexWrap: 'wrap' as const, gap: 8 }

export default function BottomSheet({
  adresse, open, onClose, onQualification, sessionId
}: {
  adresse: Adresse; open: boolean; onClose: () => void
  onQualification: (data: any) => void; sessionId?: string
}) {
  const [step,            setStep]            = useState<'main'|'pas_reponse'|'contact'|'exclure'|'supprimer'>('main')
  const [typeHabitat,     setTypeHabitat]     = useState(adresse.type_habitat ?? '')
  const [action,          setAction]          = useState('')
  const [nbBal,           setNbBal]           = useState<string>(adresse.nb_bal?.toString() ?? '')
  const [courrierCible,   setCourrierCible]   = useState(false)
  const [profil,          setProfil]          = useState('')
  const [typeProjet,      setTypeProjet]      = useState<string[]>([])
  const [horizon,         setHorizon]         = useState('')
  const [note,            setNote]            = useState('')
  const [dateRelance,     setDateRelance]     = useState('')
  const [contact,         setContact]         = useState({ nom:'', prenom:'', tel1:'', email1:'' })
  const [showContactForm, setShowContactForm] = useState(false)
  const [motifExclusion,  setMotifExclusion]  = useState('')
  const [motifSuppression,setMotifSuppression]= useState('')
  const [nomSyndic,       setNomSyndic]       = useState('')
  const [saving,          setSaving]          = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setStep('main')
      setTypeHabitat(adresse.type_habitat ?? adresse.interaction?.type_habitat ?? '')
      setNbBal(adresse.nb_bal?.toString() ?? '')
      setAction(''); setCourrierCible(false)
      setProfil(''); setTypeProjet([]); setHorizon('')
      setNote(''); setDateRelance(''); setMotifExclusion(''); setMotifSuppression('')
      setContact({ nom:'', prenom:'', tel1:'', email1:'' })
      setNomSyndic(''); setShowContactForm(false)
    }
  }, [open, adresse])

  if (!open) return null

  const toggleProjet = (v: string) =>
    setTypeProjet(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  const adresseLabel = [adresse.numero, adresse.nom_voie].filter(Boolean).join(' ')
  const isCollectif  = typeHabitat === 'collectif'

  // ── Submit PAS DE RÉPONSE ─────────────────────────────────────────────────
  const submitPasReponse = async (overrideAction?: string) => {
    const finalAction = overrideAction || action
    if (!finalAction) return
    setSaving(true)
    const adresseUpdate: any = {}
    if (typeHabitat && typeHabitat !== adresse.type_habitat) adresseUpdate.type_habitat = typeHabitat
    if (nbBal && parseInt(nbBal) !== adresse.nb_bal)         adresseUpdate.nb_bal        = parseInt(nbBal)
    if (nomSyndic.trim())                                     adresseUpdate.nom_syndic    = nomSyndic.trim()
    if (courrierCible)                                        adresseUpdate.courrier_cible_possible = true
    if (Object.keys(adresseUpdate).length) {
      await fetch('/api/adresses/' + adresse.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adresseUpdate),
      })
    }
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse_id: adresse.id, session_id: sessionId,
        resultat: 'pas_de_reponse', action: finalAction,
        type_habitat_observe: typeHabitat || null,
        observations_terrain: courrierCible ? { courrier_possible: true } : {},
      }),
    })
    setSaving(false)
    onQualification({ resultat: 'pas_de_reponse', action: finalAction, type_habitat: typeHabitat })
    onClose()
  }

  // ── Submit CONTACT ────────────────────────────────────────────────────────
  const submitContact = async () => {
    setSaving(true)
    const adresseUpdate: any = {}
    if (typeHabitat && typeHabitat !== adresse.type_habitat) adresseUpdate.type_habitat = typeHabitat
    if (Object.keys(adresseUpdate).length) {
      await fetch('/api/adresses/' + adresse.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adresseUpdate),
      })
    }
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse_id: adresse.id, session_id: sessionId,
        resultat: 'contact', action: 'rien',
        type_habitat_observe: typeHabitat || null,
        notes: note || null,
      }),
    })
    if (showContactForm && (contact.nom || contact.prenom || contact.tel1)) {
      await fetch('/api/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adresse_id: adresse.id,
          nom: contact.nom || null, prenom: contact.prenom || null,
          tel1: contact.tel1 || null, email1: contact.email1 || null,
          profil_interlocuteur: profil || null,
          type_contact: typeProjet.includes('vente') ? 'interet_vente' : typeProjet.length ? 'contact_general' : null,
        }),
      })
    }
    setSaving(false)
    onQualification({ resultat: 'contact', type_habitat: typeHabitat, note })
    onClose()
  }

  // ── Submit EXCLUSION ──────────────────────────────────────────────────────
  const submitExclusion = async () => {
    if (!motifExclusion) return
    setSaving(true)
    await fetch('/api/adresses/' + adresse.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut_prospectabilite: 'non_prospectable', motif_exclusion: motifExclusion, mode_prospection: 'exclure' }),
    })
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse_id: adresse.id, session_id: sessionId,
        resultat: 'exclusion', action: 'rien',
        observations_terrain: { motif_exclusion: motifExclusion },
      }),
    })
    setSaving(false)
    onQualification({ resultat: 'exclusion', motif_exclusion: motifExclusion })
    onClose()
  }

  // ── Submit SUPPRESSION ────────────────────────────────────────────────────
  const submitSuppression = async () => {
    if (!motifSuppression) return
    setSaving(true)
    await fetch('/api/adresses/' + adresse.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospectable: false,
        statut_prospectabilite: 'supprimee',
        motif_exclusion: motifSuppression,
      }),
    })
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse_id: adresse.id, session_id: sessionId,
        resultat: 'supprimee', action: 'rien',
        statut_adresse: 'supprimee',
        observations_terrain: { motif_suppression: motifSuppression },
      }),
    })
    setSaving(false)
    onQualification({ resultat: 'supprimee', statut_adresse: 'supprimee' })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={sheetRef} style={{ background: '#fff', borderRadius: '16px 16px 0 0', maxHeight: '85dvh', overflowY: 'auto', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }}>

        {/* Handle + header */}
        <div style={{ padding: '10px 20px 12px', borderBottom: '1px solid #F0EDE6' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E8E6DF', margin: '0 auto 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a18' }}>{adresseLabel || 'Adresse'}</div>
              <div style={{ fontSize: 12, color: '#9b9b96', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{adresse.code_postal} {adresse.commune}</span>
                {adresse.statut_prospectabilite === 'supprimee' && (
                  <span style={{ fontSize: 10, background: '#1a1a18', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>SUPPRIMÉE</span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9b9b96', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        {/* ── MAIN ── */}
        {step === 'main' && (
          <>
            {adresse.interaction?.resultat && (
              <div style={{ margin: '12px 20px 0', padding: '8px 12px', borderRadius: 8, background: '#f8f7f4', fontSize: 12, color: '#5F5E5A' }}>
                Dernière visite : <strong>{adresse.interaction.resultat}</strong>
              </div>
            )}
            {adresse.statut_prospectabilite === 'supprimee' && (
              <div style={{ margin: '12px 20px 0', padding: '8px 12px', borderRadius: 8, background: '#f5f5f5', border: '1px solid #e0e0e0', fontSize: 12, color: '#5F5E5A' }}>
                ⚫ Adresse supprimée. Vous pouvez modifier la qualification ci-dessous.
              </div>
            )}
            <div style={{ padding: '12px 20px 8px', display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('pas_reponse')} style={btn(false)}>Pas de réponse</button>
              <button onClick={() => setStep('contact')} style={btn(false, '#1D9E75')}>Contact établi</button>
            </div>
            <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('exclure')}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 10, fontWeight: 600, fontSize: 12, border: '1.5px solid #E8E6DF', background: '#fff', color: '#5F5E5A', cursor: 'pointer' }}>
                Exclure
              </button>
              <button onClick={() => setStep('supprimer')}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 10, fontWeight: 600, fontSize: 12, border: 'none', background: '#1a1a18', color: '#fff', cursor: 'pointer' }}>
                🗑 Supprimer
              </button>
            </div>
          </>
        )}

        {/* ── PAS DE RÉPONSE ── */}
        {step === 'pas_reponse' && (
          <>
            <div style={section}>
              <span style={label}>TYPE DE LOGEMENT</span>
              <div style={row}>
                {[['individuel','🏠 Maison'],['collectif','🏢 Immeuble'],['activite','🏪 Activité'],['inconnu','❓ Inconnu']].map(([v,l]) => (
                  <button key={v} style={chipBtn(typeHabitat===v)} onClick={() => setTypeHabitat(v)}>{l}</button>
                ))}
              </div>
            </div>

            {isCollectif && (
              <>
                <div style={section}>
                  <span style={label}>NOM DU SYNDIC (optionnel)</span>
                  <input value={nomSyndic} onChange={e => setNomSyndic(e.target.value)}
                    placeholder="Ex : FONCIA, Nexity…"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <div style={section}>
                  <span style={label}>NB BOÎTES AUX LETTRES</span>
                  <input type="number" value={nbBal} min={0} onChange={e => setNbBal(e.target.value)}
                    style={{ width: 100, padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13 }} />
                </div>
              </>
            )}

            <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="courrierCible" checked={courrierCible} onChange={e => setCourrierCible(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="courrierCible" style={{ fontSize: 13, cursor: 'pointer', color: '#374151' }}>Courrier ciblé possible</label>
            </div>

            <div style={section}>
              <span style={label}>ACTION</span>
              <div style={row}>
                {[['flyer','📄 Flyer'],['courrier','✉️ Courrier'],['boite','📬 Boîte aux lettres'],['rien','— Rien']].map(([v,l]) => (
                  <button key={v} style={chipBtn(action===v)} onClick={() => submitPasReponse(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <button onClick={() => setStep('main')}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #E8E6DF', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                ← Retour
              </button>
            </div>
          </>
        )}

        {/* ── CONTACT ── */}
        {step === 'contact' && (
          <>
            <div style={section}>
              <span style={label}>TYPE DE LOGEMENT</span>
              <div style={row}>
                {[['individuel','🏠 Maison'],['collectif','🏢 Immeuble'],['activite','🏪 Activité'],['inconnu','❓ Inconnu']].map(([v,l]) => (
                  <button key={v} style={chipBtn(typeHabitat===v)} onClick={() => setTypeHabitat(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={section}>
              <span style={label}>PROFIL INTERLOCUTEUR</span>
              <div style={row}>
                {[['proprietaire','Propriétaire'],['locataire','Locataire'],['inconnu','Inconnu']].map(([v,l]) => (
                  <button key={v} style={chipBtn(profil===v)} onClick={() => setProfil(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={section}>
              <span style={label}>TYPE DE PROJET</span>
              <div style={row}>
                {[['vente','Vente'],['location','Location'],['achat','Achat'],['reflexion','En réflexion']].map(([v,l]) => (
                  <button key={v} style={chipBtn(typeProjet.includes(v))} onClick={() => toggleProjet(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={section}>
              <span style={label}>NOTE</span>
              <textarea value={note} rows={2} onChange={e => setNote(e.target.value)}
                placeholder="Informations sur l'échange…"
                style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13, resize: 'none', boxSizing: 'border-box' as const }} />
            </div>

            {!showContactForm ? (
              <div style={{ padding: '12px 20px 0' }}>
                <button onClick={() => setShowContactForm(true)}
                  style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1.5px solid #1D9E75', color: '#1D9E75', background: '#fff', cursor: 'pointer' }}>
                  + Ajouter coordonnées contact
                </button>
              </div>
            ) : (
              <div style={section}>
                <span style={label}>COORDONNÉES CONTACT</span>
                {(['nom','prenom','tel1','email1'] as const).map((k) => (
                  <input key={k} placeholder={{ nom:'Nom', prenom:'Prénom', tel1:'Téléphone', email1:'Email' }[k]}
                    value={contact[k]} onChange={e => setContact(c => ({ ...c, [k]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' as const }} />
                ))}
              </div>
            )}

            <div style={{ padding: '16px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('main')}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #E8E6DF', background: '#fff', cursor: 'pointer', fontSize: 13 }}>← Retour</button>
              <button onClick={submitContact} disabled={saving}
                style={{ flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: saving ? '#E8E6DF' : '#1D9E75', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement...' : 'Valider le contact'}
              </button>
            </div>
          </>
        )}

        {/* ── EXCLUSION ── */}
        {step === 'exclure' && (
          <>
            <div style={section}>
              <span style={label}>MOTIF D&apos;EXCLUSION</span>
              <div style={row}>
                {[
                  ['parc_public','Parc public / HLM'],['administration','Administration'],
                  ['equipement_public','Équipement public'],['bureaux_uniquement','Bureaux seuls'],
                  ['commerce_uniquement','Commerce seul'],['site_ferme','Site fermé'],
                  ['doublon_ban','Doublon BAN'],['autre','Autre'],
                ].map(([v,l]) => (
                  <button key={v} style={chipBtn(motifExclusion===v, '#E24B4A')} onClick={() => setMotifExclusion(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('main')}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #E8E6DF', background: '#fff', cursor: 'pointer', fontSize: 13 }}>← Retour</button>
              <button onClick={submitExclusion} disabled={!motifExclusion || saving}
                style={{ flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: !motifExclusion || saving ? '#E8E6DF' : '#E24B4A', color: '#fff', border: 'none', cursor: !motifExclusion || saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement...' : 'Exclure cette adresse'}
              </button>
            </div>
          </>
        )}

        {/* ── SUPPRESSION ── */}
        {step === 'supprimer' && (
          <>
            <div style={{ padding: '12px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>⚠️ Suppression d&apos;adresse</div>
              <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
                Cette adresse apparaîtra en noir sur la carte. Elle reste visible mais ne sera plus prospectée.
                Vous pourrez annuler en modifiant sa qualification.
              </div>
            </div>

            <div style={section}>
              <span style={label}>MOTIF DE SUPPRESSION</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {[
                  ['souhait_proprietaire','🙅 Souhait du propriétaire','Le propriétaire ne souhaite pas être contacté'],
                  ['adresse_inconnue','❓ Adresse inconnue','Adresse introuvable sur le terrain'],
                ].map(([val, titre, desc]) => (
                  <button key={val} onClick={() => setMotifSuppression(val)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', width: '100%',
                      background: motifSuppression === val ? '#1a1a18' : '#f9f9f9',
                      color:      motifSuppression === val ? '#fff'    : '#1a1a18',
                      border: '1.5px solid ' + (motifSuppression === val ? '#1a1a18' : '#E8E6DF'),
                    }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{titre}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('main')}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid #E8E6DF', background: '#fff', cursor: 'pointer', fontSize: 13 }}>← Retour</button>
              <button onClick={submitSuppression} disabled={!motifSuppression || saving}
                style={{ flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: !motifSuppression || saving ? '#E8E6DF' : '#1a1a18', color: '#fff', border: 'none', cursor: !motifSuppression || saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement...' : 'Confirmer la suppression'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
