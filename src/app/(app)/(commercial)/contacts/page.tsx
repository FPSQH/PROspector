'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────
interface Adresse { id?: string; numero?: string; nom_voie?: string; code_postal?: string; commune?: string }
interface Contact {
  id: string; nom: string; prenom: string
  tel1?: string; email1?: string
  type_contact: string; statut_pipeline: string
  notes?: string; date_relance?: string
  created_at: string; updated_at: string
  adresses?: Adresse
}

// ── Constantes ───────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string,string> = {
  interet_vente:  'Interet vente',
  projet_moyen:   'Projet moyen terme',
  projet_long:    'Projet long terme',
  voisin_relais:  'Voisin relais',
  recommandation: 'Recommandation',
  commerçant:     'Commercant',
  autre:          'Autre',
}
const STATUT_LABELS: Record<string,{ label: string; color: string; bg: string }> = {
  prospect:    { label: 'Prospect',     color: '#0369a1', bg: '#e0f2fe' },
  qualification:{ label: 'Qualification',color: '#92400e', bg: '#fef3c7' },
  estimation:  { label: 'Estimation',  color: '#7c3aed', bg: '#ede9fe' },
  mandat:      { label: 'Mandat',      color: '#065f46', bg: '#d1fae5' },
  perdu:       { label: 'Perdu',       color: '#6b7280', bg: '#f3f4f6' },
}

function adresseLabel(a?: Adresse): string {
  if (!a) return ''
  return [a.numero, a.nom_voie, a.code_postal, a.commune].filter(Boolean).join(' ')
}

function isRelance(c: Contact): boolean {
  if (!c.date_relance) return false
  return c.date_relance <= new Date().toISOString().split('T')[0]
}

function formatDate(s?: string): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('fr-FR')
}

// ── Composant fiche contact (panel droit) ────────────────────────────────
function ContactPanel({
  contact, onSave, onDelete, onClose
}: {
  contact: Contact; onSave: (c: Contact) => void
  onDelete: (id: string) => void; onClose: () => void
}) {
  const [form, setForm] = useState<Partial<Contact>>({ ...contact })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/contacts/' + contact.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    setSaving(false)
    if (data.contact) onSave(data.contact)
  }

  const del = async () => {
    setDeleting(true)
    await fetch('/api/contacts/' + contact.id, { method: 'DELETE' })
    onDelete(contact.id)
  }

  const inp = (style?: any) => ({
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: '1.5px solid #E8E6DF', fontSize: 13, background: '#fff',
    outline: 'none', ...style
  })

  const statut = STATUT_LABELS[form.statut_pipeline ?? 'prospect']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E6DF', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{contact.prenom} {contact.nom}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{adresseLabel(contact.adresses)}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: statut.bg, color: statut.color }}>
          {statut.label}
        </span>
      </div>

      {/* Champs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Nom / Prenom */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>PRENOM</label>
            <input style={inp()} value={form.prenom ?? ''} onChange={e => set('prenom', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>NOM</label>
            <input style={inp()} value={form.nom ?? ''} onChange={e => set('nom', e.target.value)} />
          </div>
        </div>

        {/* Telephone */}
        <div>
          <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>TELEPHONE</label>
          <input style={inp()} value={form.tel1 ?? ''} onChange={e => set('tel1', e.target.value)} placeholder="06 xx xx xx xx" />
        </div>

        {/* Email */}
        <div>
          <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>EMAIL</label>
          <input style={inp()} value={form.email1 ?? ''} onChange={e => set('email1', e.target.value)} placeholder="contact@email.com" />
        </div>

        {/* Type contact */}
        <div>
          <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>TYPE DE CONTACT</label>
          <select style={inp()} value={form.type_contact ?? ''} onChange={e => set('type_contact', e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Statut pipeline */}
        <div>
          <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>STATUT PIPELINE</label>
          <select style={inp()} value={form.statut_pipeline ?? ''} onChange={e => set('statut_pipeline', e.target.value)}>
            {Object.entries(STATUT_LABELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Date de relance */}
        <div>
          <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>DATE DE RELANCE</label>
          <input type="date" style={inp()} value={form.date_relance ?? ''} onChange={e => set('date_relance', e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 }}>NOTES</label>
          <textarea
            style={{ ...inp(), minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
            placeholder="Notes sur le projet immobilier..."
          />
        </div>

        <div style={{ fontSize: 11, color: '#d4b896', padding: '6px 10px', background: '#fffbf5', borderRadius: 6, border: '1px solid #f5e6d0' }}>
          ⚠️ Notes strictement limitées au projet immobilier (RGPD)
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #E8E6DF', display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{
          flex: 1, padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13,
          background: saving ? '#E8E6DF' : '#1D9E75', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer'
        }}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {confirmDel ? (
          <button onClick={del} disabled={deleting} style={{ padding: '9px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, background: '#E24B4A', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Confirmer
          </button>
        ) : (
          <button onClick={() => setConfirmDel(true)} style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, background: '#fff', color: '#E24B4A', border: '1.5px solid #E24B4A', cursor: 'pointer' }}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

// ── Carte contact dans la liste ──────────────────────────────────────────
function ContactCard({ contact, selected, onClick }: { contact: Contact; selected: boolean; onClick: () => void }) {
  const relance = isRelance(contact)
  const statut  = STATUT_LABELS[contact.statut_pipeline] ?? STATUT_LABELS.prospect

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #F0EDE6',
        background: selected ? '#f0fdf4' : relance ? '#fff7ed' : '#fff',
        borderLeft: selected ? '3px solid #1D9E75' : relance ? '3px solid #f97316' : '3px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
          {contact.prenom} {contact.nom}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: statut.bg, color: statut.color, flexShrink: 0 }}>
          {statut.label}
        </span>
        {relance && <span style={{ fontSize: 11, color: '#f97316', flexShrink: 0 }}>🔔</span>}
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
        {TYPE_LABELS[contact.type_contact] ?? contact.type_contact}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>
        {adresseLabel(contact.adresses) || 'Adresse non renseignee'}
      </div>
      {contact.date_relance && (
        <div style={{ fontSize: 11, color: relance ? '#f97316' : '#9ca3af', marginTop: 4 }}>
          Relance : {formatDate(contact.date_relance)}
        </div>
      )}
    </div>
  )
}

// ── Page principale ──────────────────────────────────────────────────────
export default function ContactsPage() {
  const [contacts, setContacts]     = useState<Contact[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Contact | null>(null)
  const [filtre, setFiltre]         = useState('tous')
  const [typeFiltre, setTypeFiltre] = useState('')
  const [recherche, setRecherche]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ filtre, recherche })
    if (typeFiltre) params.set('type_contact', typeFiltre)
    const r = await fetch('/api/contacts?' + params.toString())
    const d = await r.json()
    setContacts(d.contacts ?? [])
    setLoading(false)
  }, [filtre, typeFiltre, recherche])

  useEffect(() => { load() }, [load])

  const nbRelance = contacts.filter(isRelance).length
  const nbTotal   = contacts.length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8F7F4', fontFamily: '-apple-system, sans-serif' }}>

      {/* ── Colonne gauche : liste ── */}
      <div style={{ width: selected ? 360 : '100%', maxWidth: selected ? 360 : 720, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E8E6DF', background: '#fff' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #E8E6DF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Contacts</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              {nbRelance > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa' }}>
                  🔔 {nbRelance} a relancer
                </span>
              )}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{nbTotal} contact{nbTotal > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Recherche */}
          <input
            placeholder="Rechercher un contact..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E8E6DF', fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
          />

          {/* Filtres */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['tous','Tous'],['relance','🔔 A relancer']].map(([k,v]) => (
              <button key={k} onClick={() => setFiltre(k)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filtre === k ? '#1D9E75' : '#F0EDE6',
                color: filtre === k ? '#fff' : '#5F5E5A', border: 'none'
              }}>{v}</button>
            ))}
            <select value={typeFiltre} onChange={e => setTypeFiltre(e.target.value)} style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 12, border: '1.5px solid #E8E6DF',
              background: typeFiltre ? '#1D9E75' : '#fff', color: typeFiltre ? '#fff' : '#5F5E5A', cursor: 'pointer'
            }}>
              <option value="">Tous types</option>
              {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Chargement...</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
              <div>Aucun contact</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Les contacts apparaissent lors des sessions de prospection</div>
            </div>
          ) : (
            contacts.map(c => (
              <ContactCard
                key={c.id} contact={c}
                selected={selected?.id === c.id}
                onClick={() => setSelected(c)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Colonne droite : fiche ── */}
      {selected && (
        <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ContactPanel
            contact={selected}
            onSave={updated => {
              setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
              setSelected(prev => prev ? { ...prev, ...updated } : prev)
            }}
            onDelete={id => {
              setContacts(prev => prev.filter(c => c.id !== id))
              setSelected(null)
            }}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  )
}
