'use client'

import { useState, useEffect } from 'react'

interface Adresse {
  id: string; numero?: string; nom_voie?: string; code_postal?: string; commune?: string
  type_bien?: string; nb_bal?: number; has_commerce?: boolean
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  interaction?: { resultat?: string; action?: string; type_habitat?: string }
  score?: number; latest_dpe_date?: string | null; nom_syndic?: string
}

export default function BottomSheet({
  adresse, open, onClose, onQualification, sessionId
}: {
  adresse: Adresse; open: boolean; onClose: () => void
  onQualification: (data: any) => void; sessionId?: string
}) {
  type Step = 'main' | 'contact' | 'exclure' | 'supprimer'

  const [step,             setStep]             = useState<Step>('main')
  const [typeHabitat,      setTypeHabitat]      = useState('')
  const [nbBal,            setNbBal]            = useState('')
  const [nomSyndic,        setNomSyndic]        = useState('')
  const [courrierCible,    setCourrierCible]    = useState(false)
  const [profil,           setProfil]           = useState('')
  const [typeProjet,       setTypeProjet]       = useState<string[]>([])
  const [note,             setNote]             = useState('')
  const [contact,          setContact]          = useState({ nom:'', prenom:'', tel1:'', email1:'' })
  const [showContactForm,  setShowContactForm]  = useState(false)
  const [motifExclusion,   setMotifExclusion]   = useState('')
  const [motifSuppression, setMotifSuppression] = useState('')
  const [saving,           setSaving]           = useState(false)

  // Reset à chaque ouverture
  useEffect(() => {
    if (open) {
      setStep('main')
      setTypeHabitat(adresse.type_habitat ?? adresse.interaction?.type_habitat ?? '')
      setNbBal(adresse.nb_bal?.toString() ?? '')
      setNomSyndic(adresse.nom_syndic ?? '')
      setCourrierCible(false)
      setProfil(''); setTypeProjet([]); setNote('')
      setContact({ nom:'', prenom:'', tel1:'', email1:'' })
      setShowContactForm(false)
      setMotifExclusion(''); setMotifSuppression('')
    }
  }, [open, adresse])

  if (!open) return null

  const adresseLabel = [adresse.numero, adresse.nom_voie].filter(Boolean).join(' ')
  const isSupprimee  = adresse.statut_prospectabilite === 'supprimee'

  // ── Helpers patch ─────────────────────────────────────────────────────────
  const patchAdresse = async (body: object) => {
    await fetch('/api/adresses/' + adresse.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  }
  const postInteraction = async (body: object) => {
    await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  }

  // ── Saves ─────────────────────────────────────────────────────────────────
  const submitAction = async (action: string) => {
    setSaving(true)
    const updates: any = {}
    if (typeHabitat) updates.type_habitat = typeHabitat
    if (nomSyndic.trim() && typeHabitat === 'collectif') updates.nom_syndic = nomSyndic.trim()
    if (nbBal && typeHabitat === 'collectif') updates.nb_bal = parseInt(nbBal)
    if (courrierCible) updates.courrier_cible_possible = true
    if (Object.keys(updates).length) await patchAdresse(updates)

    await postInteraction({
      adresse_id: adresse.id, session_id: sessionId,
      resultat: 'pas_de_reponse', action,
      type_habitat_observe: typeHabitat || null,
      observations_terrain: courrierCible ? { courrier_possible: true } : {},
    })
    setSaving(false)
    onQualification({ resultat: 'pas_de_reponse', action, type_habitat: typeHabitat })
    onClose()
  }

  const submitContact = async () => {
    setSaving(true)
    if (typeHabitat) await patchAdresse({ type_habitat: typeHabitat })
    await postInteraction({
      adresse_id: adresse.id, session_id: sessionId,
      resultat: 'contact', action: 'rien',
      type_habitat_observe: typeHabitat || null,
      notes: note || null,
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

  const submitExclusion = async () => {
    if (!motifExclusion) return
    setSaving(true)
    await patchAdresse({ statut_prospectabilite: 'non_prospectable', motif_exclusion: motifExclusion, mode_prospection: 'exclure' })
    await postInteraction({ adresse_id: adresse.id, session_id: sessionId, resultat: 'exclusion', action: 'rien', observations_terrain: { motif_exclusion: motifExclusion } })
    setSaving(false)
    onQualification({ resultat: 'exclusion', motif_exclusion: motifExclusion })
    onClose()
  }

  const submitSuppression = async () => {
    if (!motifSuppression) return
    setSaving(true)
    await patchAdresse({ prospectable: false, statut_prospectabilite: 'supprimee', motif_exclusion: motifSuppression })
    await postInteraction({ adresse_id: adresse.id, session_id: sessionId, resultat: 'supprimee', action: 'rien', statut_adresse: 'supprimee', observations_terrain: { motif_suppression: motifSuppression } })
    setSaving(false)
    onQualification({ resultat: 'supprimee', statut_adresse: 'supprimee' })
    onClose()
  }

  // ── Styles réutilisables ──────────────────────────────────────────────────
  const sectionTitle = { fontSize: 10, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6, display: 'block' }
  const chip = (active: boolean, color = '#1D9E75') => ({
    padding: '6px 12px', borderRadius: 20, fontWeight: 600, fontSize: 12, cursor: 'pointer',
    background: active ? color : '#f3f4f6', color: active ? '#fff' : '#374151',
    border: active ? 'none' : '1.5px solid #e5e7eb',
  })

  return (
    // Backdrop — clic en dehors = ferme
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      {/* Sheet container */}
      <div style={{
        background: '#fff',
        borderRadius: '16px 16px 0 0',
        maxHeight: '78dvh',
        overflowY: 'auto',
        boxShadow: '0 -6px 32px rgba(0,0,0,0.18)',
      }}>

        {/* ── Handle + header ── */}
        <div style={{ padding: '10px 16px 10px', borderBottom: '1px solid #F0EDE6', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E8E6DF', margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {adresseLabel || 'Adresse'}
              </div>
              <div style={{ fontSize: 12, color: '#9b9b96', display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                <span>{adresse.code_postal} {adresse.commune}</span>
                {isSupprimee && <span style={{ fontSize: 10, background: '#1a1a18', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>SUPPRIMÉE</span>}
                {adresse.interaction?.resultat && (
                  <span style={{ fontSize: 10, background: '#f0fdf4', color: '#065f46', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                    ✓ {adresse.interaction.resultat === 'pas_de_reponse' ? 'Pas de réponse' : adresse.interaction.resultat}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9b9b96', cursor: 'pointer', padding: '0 0 0 12px', flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
          {step !== 'main' && (
            <button onClick={() => setStep('main')} style={{ marginTop: 8, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid #E8E6DF', background: '#f9f9f9', color: '#374151', cursor: 'pointer' }}>
              ← Retour
            </button>
          )}
        </div>

        {/* ══════════ ÉTAPE PRINCIPALE ══════════ */}
        {step === 'main' && (
          <div>

            {/* TYPE DE LOGEMENT — sélection rapide */}
            <div style={{ padding: '12px 16px 8px' }}>
              <span style={sectionTitle}>Type de logement</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {([
                  ['individuel', '🏠', 'Maison'],
                  ['collectif',  '🏢', 'Immeuble'],
                  ['activite',   '🏪', 'Activité'],
                  ['inconnu',    '❓', 'Inconnu'],
                ] as [string,string,string][]).map(([v, emoji, label]) => (
                  <button key={v} onClick={() => setTypeHabitat(prev => prev === v ? '' : v)}
                    style={{
                      padding: '9px 4px', borderRadius: 10, cursor: 'pointer', border: 'none',
                      background: typeHabitat === v ? '#1D9E75' : '#f3f4f6',
                      color:      typeHabitat === v ? '#fff'    : '#374151',
                      fontWeight: 600, fontSize: 11, textAlign: 'center',
                    }}>
                    <div style={{ fontSize: 18, marginBottom: 3 }}>{emoji}</div>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Champs collectif (syndic + BAL) */}
            {typeHabitat === 'collectif' && (
              <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
                <input value={nomSyndic} onChange={e => setNomSyndic(e.target.value)}
                  placeholder="Nom du syndic"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13 }} />
                <input type="number" value={nbBal} onChange={e => setNbBal(e.target.value)}
                  placeholder="BAL" min={0}
                  style={{ width: 64, padding: '8px 8px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13 }} />
              </div>
            )}

            {/* ACTION RAPIDE — directement soumis */}
            <div style={{ padding: '4px 16px 8px' }}>
              <span style={sectionTitle}>Action</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {([
                  { id: 'flyer',  emoji: '📄', label: 'Flyer',   bg: '#eff6ff', fg: '#1d4ed8', action: () => submitAction('flyer') },
                  { id: 'boite',  emoji: '📬', label: 'Boîté',   bg: '#f5f3ff', fg: '#6d28d9', action: () => submitAction('boite') },
                  { id: 'rien',   emoji: '—',  label: 'Rien',    bg: '#f3f4f6', fg: '#374151', action: () => submitAction('rien') },
                  { id: 'contact',emoji: '👤', label: 'Contact', bg: '#1D9E75', fg: '#fff',    action: () => setStep('contact') },
                ]).map(({ id, emoji, label, bg, fg, action }) => (
                  <button key={id} onClick={action} disabled={saving}
                    style={{
                      padding: '11px 4px', borderRadius: 10, border: 'none',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      background: bg, color: fg, fontWeight: 700, fontSize: 12, textAlign: 'center',
                    }}>
                    <div style={{ fontSize: 20, marginBottom: 3, lineHeight: 1 }}>{emoji}</div>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Courrier ciblé */}
            <div style={{ padding: '2px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="cc" checked={courrierCible} onChange={e => setCourrierCible(e.target.checked)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
              <label htmlFor="cc" style={{ fontSize: 12, color: '#374151', cursor: 'pointer' }}>Courrier ciblé possible</label>
            </div>

            {/* Actions secondaires */}
            <div style={{ padding: '8px 16px 20px', display: 'flex', gap: 8, borderTop: '1px solid #F0EDE6' }}>
              <button onClick={() => setStep('exclure')}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1.5px solid #E8E6DF', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                Exclure
              </button>
              <button onClick={() => setStep('supprimer')}
                style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: '#1a1a18', color: '#fff', cursor: 'pointer' }}>
                🗑 Supprimer
              </button>
            </div>
          </div>
        )}

        {/* ══════════ CONTACT ══════════ */}
        {step === 'contact' && (
          <div style={{ padding: '12px 16px' }}>

            <div style={{ marginBottom: 12 }}>
              <span style={sectionTitle}>Type de logement</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['individuel','🏠 Maison'],['collectif','🏢 Immeuble'],['activite','🏪 Activité'],['inconnu','❓ Inconnu']].map(([v,l]) => (
                  <button key={v} style={chip(typeHabitat===v)} onClick={() => setTypeHabitat(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={sectionTitle}>Profil</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['proprietaire','Propriétaire'],['locataire','Locataire'],['inconnu','Inconnu']].map(([v,l]) => (
                  <button key={v} style={chip(profil===v)} onClick={() => setProfil(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={sectionTitle}>Projet</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['vente','Vente'],['location','Location'],['achat','Achat'],['reflexion','Réflexion']].map(([v,l]) => (
                  <button key={v} style={chip(typeProjet.includes(v))} onClick={() => setTypeProjet(p => p.includes(v) ? p.filter(x=>x!==v) : [...p,v])}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={sectionTitle}>Note</span>
              <textarea value={note} rows={2} onChange={e => setNote(e.target.value)}
                placeholder="Informations sur l'échange…"
                style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13, resize: 'none', boxSizing: 'border-box' }} />
            </div>

            {!showContactForm ? (
              <button onClick={() => setShowContactForm(true)}
                style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1.5px solid #1D9E75', color: '#1D9E75', background: '#fff', cursor: 'pointer', marginBottom: 12 }}>
                + Ajouter coordonnées
              </button>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <span style={sectionTitle}>Coordonnées</span>
                {(['nom','prenom','tel1','email1'] as const).map(k => (
                  <input key={k} value={contact[k]}
                    placeholder={{ nom:'Nom', prenom:'Prénom', tel1:'Téléphone', email1:'Email' }[k]}
                    onChange={e => setContact(c => ({ ...c, [k]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E6DF', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }} />
                ))}
              </div>
            )}

            <button onClick={submitContact} disabled={saving}
              style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: saving ? '#E8E6DF' : '#1D9E75', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
              {saving ? 'Enregistrement...' : 'Valider le contact'}
            </button>
          </div>
        )}

        {/* ══════════ EXCLUSION ══════════ */}
        {step === 'exclure' && (
          <div style={{ padding: '12px 16px' }}>
            <span style={sectionTitle}>Motif d&apos;exclusion</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[
                ['parc_public','Parc public / HLM'],['administration','Administration'],
                ['equipement_public','Équipement public'],['bureaux_uniquement','Bureaux seuls'],
                ['commerce_uniquement','Commerce seul'],['site_ferme','Site fermé'],
                ['doublon_ban','Doublon BAN'],['autre','Autre'],
              ].map(([v,l]) => (
                <button key={v} style={chip(motifExclusion===v, '#E24B4A')} onClick={() => setMotifExclusion(v)}>{l}</button>
              ))}
            </div>
            <button onClick={submitExclusion} disabled={!motifExclusion || saving}
              style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: !motifExclusion || saving ? '#E8E6DF' : '#E24B4A', color: '#fff', border: 'none', cursor: !motifExclusion || saving ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
              {saving ? 'Enregistrement...' : 'Exclure cette adresse'}
            </button>
          </div>
        )}

        {/* ══════════ SUPPRESSION ══════════ */}
        {step === 'supprimer' && (
          <div>
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 3 }}>⚠️ Suppression d&apos;adresse</div>
              <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
                L&apos;adresse apparaîtra en noir. Elle reste visible et peut être réactivée.
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <span style={sectionTitle}>Motif</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {[
                  ['souhait_proprietaire','🙅 Souhait du propriétaire','Ne souhaite pas être contacté'],
                  ['adresse_inconnue','❓ Adresse inconnue','Introuvable sur le terrain'],
                ].map(([v, t, d]) => (
                  <button key={v} onClick={() => setMotifSuppression(v)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', width: '100%',
                      background: motifSuppression === v ? '#1a1a18' : '#f9f9f9',
                      color:      motifSuppression === v ? '#fff'    : '#1a1a18',
                      border: '1.5px solid ' + (motifSuppression === v ? '#1a1a18' : '#E8E6DF'),
                    }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{d}</div>
                  </button>
                ))}
              </div>
              <button onClick={submitSuppression} disabled={!motifSuppression || saving}
                style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: !motifSuppression || saving ? '#E8E6DF' : '#1a1a18', color: '#fff', border: 'none', cursor: !motifSuppression || saving ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
                {saving ? 'Enregistrement...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
