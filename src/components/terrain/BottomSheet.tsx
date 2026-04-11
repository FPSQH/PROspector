'use client'

import { useState, useEffect, useRef } from 'react'

interface Adresse {
  id: string
  numero?: string
  nom_voie?: string
  type_bien?: string
  nb_bal?: number
  prospectable?: boolean
  statut_carte: string
  interaction?: any
}

interface Contact {
  nom:          string
  prenom:       string
  tel1:         string
  tel2:         string
  email1:       string
  email2:       string
}

type Step = 'main' | 'pas_contact' | 'contact' | 'fiche_contact'

interface Props {
  open:             boolean
  adresse:          Adresse
  sessionId:        string
  onClose:          () => void
  onQualification:  (data: any) => void
}

const TYPE_CONTACT_LABELS: Record<string, string> = {
  simple_echange:    'Simple échange',
  intention_vente:   'Intention de vendre',
  projet_moyen_long: 'Projet moyen/long terme',
  voisin_relais:     'Voisin relais',
  commercant:        'Commerçant',
}

const TYPE_HABITAT_LABELS: Record<string, string> = {
  individuel: 'Habitat individuel',
  collectif:  'Habitat collectif',
  commerce:   'Commerce',
  autre:      'Autre',
}

export default function BottomSheet({ open, adresse, sessionId, onClose, onQualification }: Props) {
  const [step, setStep]               = useState<Step>('main')
  const [typeHabitat, setTypeHabitat] = useState<string>('')
  const [nbEtages, setNbEtages]       = useState('')
  const [nomBoite, setNomBoite]       = useState('')
  const [action, setAction]           = useState<string>('')
  const [typeContact, setTypeContact] = useState<string>('')
  const [note, setNote]               = useState('')
  const [dateRelance, setDateRelance] = useState('')
  const [showFiche, setShowFiche]     = useState(false)
  const [contact, setContact]         = useState<Contact>({
    nom: '', prenom: '', tel1: '', tel2: '', email1: '', email2: '',
  })
  const [saving, setSaving]           = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)

  // Reset à chaque ouverture
  useEffect(() => {
    if (open) {
      setStep('main')
      setTypeHabitat(adresse.interaction?.type_habitat ?? '')
      setNbEtages(adresse.interaction?.nb_etages ?? '')
      setNomBoite(adresse.interaction?.nom_boite ?? (adresse as any).nom_boite ?? '')
      setAction(adresse.interaction?.action ?? '')
      setTypeContact(adresse.interaction?.type_contact ?? '')
      setNote(adresse.interaction?.note ?? '')
      setDateRelance(adresse.interaction?.date_relance ?? '')
      setShowFiche(false)
      setContact({ nom: '', prenom: '', tel1: '', tel2: '', email1: '', email2: '' })
    }
  }, [open, adresse])

  // Action rapide : pas de contact + action
  const handleActionRapide = async (act: string) => {
    setSaving(true)
    // Persister nom_boite sur l'adresse si habitat individuel
    if (typeHabitat === 'individuel' && nomBoite) {
      await fetch(`/api/adresses/${adresse.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom_boite: nomBoite }),
      })
    }
    await onQualification({
      resultat:     'pas_de_reponse',
      action:       act,
      type_habitat: typeHabitat || null,
      nb_etages:    nbEtages ? parseInt(nbEtages) : null,
      nom_boite:    nomBoite || null,
    })
    setSaving(false)
  }

  // Sauvegarder contact établi
  const handleSaveContact = async () => {
    if (!typeContact) return
    setSaving(true)

    // Persister nom_boite sur l'adresse si habitat individuel
    if (typeHabitat === 'individuel' && nomBoite) {
      await fetch(`/api/adresses/${adresse.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom_boite: nomBoite }),
      })
    }

    const interactionData = {
      resultat:     'contact_etabli',
      type_contact: typeContact,
      notes:        note || null,
      statut_pipeline: 'prospect',
      date_relance: dateRelance || null,
    }

    await onQualification(interactionData)

    // Créer la fiche contact si renseignée
    if (showFiche && (contact.nom || contact.prenom || contact.tel1)) {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adresse_id:  adresse.id,
          type_contact: typeContact,
          notes:        note || null,
          statut_pipeline: 'prospect',
          date_relance: dateRelance || null,
          ...contact,
        }),
      })
    }
    setSaving(false)
  }

  if (!open) return null

  const adresseLabel = [adresse.numero, adresse.nom_voie].filter(Boolean).join(' ')
    || `Adresse ${adresse.id.slice(0, 6)}`

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.3)', zIndex: 200,
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position:     'fixed', bottom: 0, left: 0, right: 0,
          background:   '#fff',
          borderRadius: '16px 16px 0 0',
          zIndex:       201,
          maxHeight:    '85dvh',
          overflowY:    'auto',
          padding:      '0 0 env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: '#d1d0c8', margin: '12px auto 0',
        }}/>

        {/* Adresse */}
        <div style={{
          padding: '12px 20px 0',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1a18' }}>
              {adresseLabel}
            </div>
            {adresse.type_bien && (
              <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>
                {adresse.type_bien}
                {adresse.nb_bal ? ` · ${adresse.nb_bal} BAL` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            color: '#9b9b96', fontSize: '1.2rem', cursor: 'pointer', padding: 4,
          }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px 24px' }}>

          {/* ── Étape principale ── */}
          {step === 'main' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Qualification habitat (optionnel, toujours visible) */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 6, fontWeight: 500 }}>
                  Type de bien (optionnel)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(TYPE_HABITAT_LABELS).map(([k, v]) => (
                    <button key={k} onClick={() => setTypeHabitat(typeHabitat === k ? '' : k)}
                      style={{
                        padding: '5px 10px', borderRadius: 20,
                        border: `1.5px solid ${typeHabitat === k ? '#1D9E75' : '#e8e7e0'}`,
                        background: typeHabitat === k ? '#f0fdf4' : '#fff',
                        color: typeHabitat === k ? '#0F6E56' : '#5F5E5A',
                        fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
                      }}>
                      {v}
                    </button>
                  ))}
                </div>

                {typeHabitat === 'collectif' && (
                  <input
                    type="number" placeholder="Nb d'étages"
                    value={nbEtages}
                    onChange={(e) => setNbEtages(e.target.value)}
                    style={{
                      marginTop: 8, width: '100%', padding: '8px 12px',
                      borderRadius: 8, border: '1px solid #e8e7e0',
                      fontSize: '0.875rem', boxSizing: 'border-box',
                    }}
                  />
                )}
                {typeHabitat === 'individuel' && (
                  <input
                    type="text" placeholder="Nom sur la boîte aux lettres"
                    value={nomBoite}
                    onChange={(e) => setNomBoite(e.target.value)}
                    style={{
                      marginTop: 8, width: '100%', padding: '8px 12px',
                      borderRadius: 8, border: '1px solid #e8e7e0',
                      fontSize: '0.875rem', boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>

              {/* Boutons principaux */}
              <button
                onClick={() => setStep('pas_contact')}
                style={{
                  padding: '16px', borderRadius: 12, border: 'none',
                  background: '#f0efeb', color: '#1a1a18',
                  fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                }}>
                Pas de réponse
              </button>

              <button
                onClick={() => setStep('contact')}
                style={{
                  padding: '16px', borderRadius: 12, border: 'none',
                  background: '#1D9E75', color: '#fff',
                  fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                }}>
                Contact établi 🤝
              </button>
            </div>
          )}

          {/* ── Pas de contact → action ── */}
          {step === 'pas_contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setStep('main')} style={{
                background: 'none', border: 'none', color: '#9b9b96',
                fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', padding: 0, marginBottom: 4,
              }}>
                ← Retour
              </button>

              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18', marginBottom: 4 }}>
                Qu'avez-vous laissé ?
              </div>

              {[
                { action: 'flyer',   label: '📄 Flyer déposé',   bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
                { action: 'courrier', label: '✉️ Courrier déposé', bg: '#faf5ff', color: '#6b21a8', border: '#e9d5ff' },
                { action: 'rien',    label: '— Rien',            bg: '#f9fafb', color: '#374151', border: '#e5e7eb' },
              ].map((item) => (
                <button
                  key={item.action}
                  onClick={() => handleActionRapide(item.action)}
                  disabled={saving}
                  style={{
                    padding: '16px', borderRadius: 12,
                    border: `1.5px solid ${item.border}`,
                    background: item.bg, color: item.color,
                    fontWeight: 700, fontSize: '0.95rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Contact établi ── */}
          {step === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button onClick={() => setStep('main')} style={{
                background: 'none', border: 'none', color: '#9b9b96',
                fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', padding: 0,
              }}>
                ← Retour
              </button>

              {/* Type de contact */}
              <div>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 6, fontWeight: 500 }}>
                  Type de contact *
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(TYPE_CONTACT_LABELS).map(([k, v]) => (
                    <button key={k}
                      onClick={() => setTypeContact(typeContact === k ? '' : k)}
                      style={{
                        padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                        border: `1.5px solid ${typeContact === k ? '#1D9E75' : '#e8e7e0'}`,
                        background: typeContact === k ? '#f0fdf4' : '#fff',
                        color: typeContact === k ? '#0F6E56' : '#1a1a18',
                        fontWeight: typeContact === k ? 600 : 400,
                        fontSize: '0.875rem', cursor: 'pointer',
                      }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 4, fontWeight: 500 }}>
                  Note (projet immobilier)
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Type de bien, timing, critères…"
                  rows={2}
                  maxLength={300}
                  style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: 10, border: '1px solid #e8e7e0',
                    fontSize: '0.875rem', resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Date de relance */}
              <div>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 4, fontWeight: 500 }}>
                  Date de relance
                </div>
                <input
                  type="date"
                  value={dateRelance}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setDateRelance(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: 10, border: '1px solid #e8e7e0',
                    fontSize: '0.875rem', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Fiche contact */}
              <button
                onClick={() => {
                setShowFiche((v) => {
                  // Pré-remplir le nom si nomBoite renseigné
                  if (!v && nomBoite) {
                    setContact((c) => ({ ...c, nom: c.nom || nomBoite }))
                  }
                  return !v
                })
              }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10,
                  border: `1.5px solid ${showFiche ? '#1D9E75' : '#e8e7e0'}`,
                  background: showFiche ? '#f0fdf4' : '#f8f7f4',
                  cursor: 'pointer',
                }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: showFiche ? '#0F6E56' : '#1a1a18' }}>
                  + Créer une fiche contact
                </span>
                <span style={{ color: showFiche ? '#1D9E75' : '#9b9b96' }}>
                  {showFiche ? '▲' : '▼'}
                </span>
              </button>

              {showFiche && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder="Prénom" value={contact.prenom}
                      onChange={(e) => setContact((c) => ({ ...c, prenom: e.target.value }))}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e0', fontSize: '0.875rem' }}
                    />
                    <input placeholder="Nom" value={contact.nom}
                      onChange={(e) => setContact((c) => ({ ...c, nom: e.target.value }))}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e0', fontSize: '0.875rem' }}
                    />
                  </div>
                  <input placeholder="Téléphone 1" type="tel" value={contact.tel1}
                    onChange={(e) => setContact((c) => ({ ...c, tel1: e.target.value }))}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e0', fontSize: '0.875rem' }}
                  />
                  <input placeholder="Téléphone 2 (optionnel)" type="tel" value={contact.tel2}
                    onChange={(e) => setContact((c) => ({ ...c, tel2: e.target.value }))}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e0', fontSize: '0.875rem' }}
                  />
                  <input placeholder="Email 1" type="email" value={contact.email1}
                    onChange={(e) => setContact((c) => ({ ...c, email1: e.target.value }))}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e0', fontSize: '0.875rem' }}
                  />
                  <input placeholder="Email 2 (optionnel)" type="email" value={contact.email2}
                    onChange={(e) => setContact((c) => ({ ...c, email2: e.target.value }))}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e0', fontSize: '0.875rem' }}
                  />
                </div>
              )}

              <button
                onClick={handleSaveContact}
                disabled={saving || !typeContact}
                style={{
                  padding: '14px', borderRadius: 12, border: 'none',
                  background: !typeContact ? '#f0efeb' : saving ? '#9b9b96' : '#1D9E75',
                  color: !typeContact ? '#9b9b96' : '#fff',
                  fontWeight: 700, fontSize: '1rem',
                  cursor: saving || !typeContact ? 'not-allowed' : 'pointer',
                  marginTop: 4,
                }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
