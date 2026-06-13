'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { ContactPoint } from '@/components/map/ContactsMap'

const ContactsMap = dynamic(() => import('@/components/map/ContactsMap'), { ssr: false })

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg: '#0C0C0E', card: '#141416', card2: '#1A1A1E',
  border: 'rgba(255,255,255,0.06)', borderl: 'rgba(255,255,255,0.10)',
  text: '#F0F0F2', mid: '#9A9AA8', muted: '#6B6B7B', dim: '#4A4A58',
  primary: '#1D9E75', blue: '#60A5FA', gold: '#FBBF24', green: '#4ADE80', danger: '#F87171',
}

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(s?: string | null) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function addrText(a: any) {
  if (!a) return ''
  return [a.numero, a.nom_voie, a.code_postal, a.commune].filter(Boolean).join(' ')
}
function initiales(c: any) {
  return ((c.prenom?.[0] ?? '') + (c.nom?.[0] ?? '')).toUpperCase() || '?'
}
function calcEcheance(qualDate: string, horizon: string): string {
  const months: Record<string, number> = { 'moins_6_mois': 6, '6_12_mois': 12, '1_2_ans': 24, 'plus_2_ans': 36 }
  const m = months[horizon]
  if (!m || !qualDate) return ''
  const d = new Date(qualDate); d.setMonth(d.getMonth() + m)
  return d.toISOString().split('T')[0]!
}

const TYPE_LABELS: Record<string, string> = {
  interet_vente: 'Intérêt vente', projet_moyen: 'Projet moyen', projet_long: 'Projet long',
  voisin_relais: 'Voisin relais', recommandation: 'Recommandation', commercant: 'Commerçant', autre: 'Autre',
}
const STATUT_LABELS: Record<string, string> = {
  prospect: 'Prospect', qualification: 'Qualification', estimation: 'Estimation', mandat: 'Mandat', perdu: 'Perdu',
}
const STATUT_COLORS: Record<string, string> = {
  prospect: C.mid, qualification: C.blue, estimation: C.gold, mandat: C.green, perdu: C.danger,
}
const HORIZON_LABELS: Record<string, string> = {
  'moins_6_mois': '< 6 mois', '6_12_mois': '6–12 mois', '1_2_ans': '1–2 ans', 'plus_2_ans': '> 2 ans',
}

const EMPTY_FORM = {
  prenom: '', nom: '', tel1: '', email1: '',
  type_contact: '', statut_pipeline: 'prospect',
  date_relance: '', notes: '', horizon_vente: '',
  adresse_id: null as string | null, adresse_libre: '',
  adresse_lat: null as number | null, adresse_lon: null as number | null,
  zone_id: null as string | null, _adresse_text: '', _zone_nom: '', _zone_couleur: '',
  horizon_qualification_date: '', horizon_echeance_date: '',
}

const inp: any = {
  background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)`,
  borderRadius: 8, color: C.text, fontSize: 13, padding: '8px 10px',
  width: '100%', boxSizing: 'border-box' as const, outline: 'none',
}
const sectionLabel: any = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase' as const, color: C.muted, marginBottom: 6, display: 'block',
}
function pill(active: boolean, color = C.primary): any {
  return {
    padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? color : 'rgba(255,255,255,0.06)', color: active ? '#fff' : C.mid,
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`, flexShrink: 0,
  }
}

// ═══════════════════════════════════════════════════════════════
export default function ManagerContactsPage() {
  const [contacts,    setContacts]    = useState<any[]>([])
  const [equipe,      setEquipe]      = useState<{ id: string; label: string }[]>([])
  const [filterCid,   setFilterCid]   = useState('')
  const [loading,     setLoading]     = useState(true)
  const [selected,    setSelected]    = useState<any>(null)
  const [filtre,      setFiltre]      = useState('tous')
  const [typeFiltre,  setTypeFiltre]  = useState('')
  const [recherche,   setRecherche]   = useState('')
  const [form,        setForm]        = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM })
  const [saving,      setSaving]      = useState(false)
  const [saveOk,      setSaveOk]      = useState(false)
  const [saveErr,     setSaveErr]     = useState('')
  const [deleting,    setDeleting]    = useState(false)
  const [isMobile,    setIsMobile]    = useState(false)
  const [mobileTab,   setMobileTab]   = useState<'list'|'map'|'detail'>('list')

  const [adresseQuery,   setAdresseQuery]   = useState('')
  const [adresseResults, setAdresseResults] = useState<any[]>([])
  const [adresseLoading, setAdresseLoading] = useState(false)
  const [adresseMode,    setAdresseMode]    = useState<'secteur'|'libre'>('secteur')
  const [showAdresseDD,  setShowAdresseDD]  = useState(false)
  const searchTimeout = useRef<any>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Charger l'équipe pour le filtre
  useEffect(() => {
    fetch('/api/manager/contacts?filtre=tous')
      .then(r => r.json())
      .then(d => {
        const seen = new Map<string, string>()
        ;(d.contacts ?? []).forEach((c: any) => {
          if (!seen.has(c.commercial_id)) seen.set(c.commercial_id, c.commercial_nom ?? c.commercial_id)
        })
        setEquipe([...seen.entries()].map(([id, label]) => ({ id, label })))
      })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ filtre, recherche, type_contact: typeFiltre })
    if (filterCid) p.set('commercial_id', filterCid)
    const r = await fetch('/api/manager/contacts?' + p)
    const d = await r.json()
    setContacts(d.contacts ?? [])
    setLoading(false)
  }, [filtre, recherche, typeFiltre, filterCid])

  useEffect(() => { load() }, [load])

  const selectContact = useCallback((c: any) => {
    setSelected(c); setSaveOk(false); setSaveErr('')
    setAdresseQuery(''); setAdresseResults([]); setShowAdresseDD(false)
    setAdresseMode(c.adresse_id ? 'secteur' : 'libre')
    setForm({
      prenom: c.prenom ?? '', nom: c.nom ?? '', tel1: c.tel1 ?? '', email1: c.email1 ?? '',
      type_contact: c.type_contact ?? '', statut_pipeline: c.statut_pipeline ?? 'prospect',
      date_relance: c.date_relance ?? '', notes: c.notes ?? '', horizon_vente: c.horizon_vente ?? '',
      adresse_id: c.adresse_id ?? null, adresse_libre: c.adresse_libre ?? '',
      adresse_lat: c.adresse_lat ?? c.adresses?.lat ?? null,
      adresse_lon: c.adresse_lon ?? c.adresses?.lon ?? null,
      zone_id: c.zone_id ?? c.adresses?.zone_id ?? null,
      _adresse_text: c.adresses ? addrText(c.adresses) : (c.adresse_libre ?? ''),
      _zone_nom:    (c.zones_prospection ?? c.adresses?.zones_prospection)?.nom     ?? '',
      _zone_couleur:(c.zones_prospection ?? c.adresses?.zones_prospection)?.couleur ?? C.primary,
      horizon_qualification_date: c.horizon_qualification_date ?? '',
      horizon_echeance_date:      c.horizon_echeance_date      ?? '',
    })
    if (isMobile) setMobileTab('detail')
  }, [isMobile])

  const searchAdresse = (q: string) => {
    setAdresseQuery(q); setShowAdresseDD(true)
    clearTimeout(searchTimeout.current)
    if (q.length < 2) { setAdresseResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setAdresseLoading(true)
      try {
        const r = await fetch(`/api/adresses/recherche?q=${encodeURIComponent(q)}`)
        const d = await r.json()
        setAdresseResults(d.adresses ?? [])
      } finally { setAdresseLoading(false) }
    }, 300)
  }

  const selectAdresseResult = (a: any) => {
    const zp = a.zones_prospection
    setForm(f => ({
      ...f, adresse_id: a.id, adresse_lat: a.lat ?? null, adresse_lon: a.lon ?? null,
      zone_id: a.zone_id ?? null, adresse_libre: '',
      _adresse_text: addrText(a), _zone_nom: zp?.nom ?? '', _zone_couleur: zp?.couleur ?? C.primary,
    }))
    setAdresseQuery(''); setAdresseResults([]); setShowAdresseDD(false)
  }

  const clearAdresse = () => {
    setForm(f => ({ ...f, adresse_id: null, adresse_lat: null, adresse_lon: null, zone_id: null, _adresse_text: '', _zone_nom: '', _zone_couleur: '' }))
    setAdresseQuery(''); setAdresseResults([])
  }

  const save = async () => {
    if (!selected) return
    setSaving(true); setSaveOk(false); setSaveErr('')
    try {
      const r = await fetch('/api/contacts/' + selected.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: form.prenom || null, nom: form.nom || null,
          tel1: form.tel1 || null, email1: form.email1 || null,
          type_contact: form.type_contact || null, statut_pipeline: form.statut_pipeline || 'prospect',
          date_relance: form.date_relance || null, notes: form.notes || null,
          horizon_vente: form.horizon_vente || null, adresse_id: form.adresse_id || null,
          adresse_libre: adresseMode === 'libre' ? (form.adresse_libre || null) : null,
          adresse_lat: form.adresse_lat ?? null, adresse_lon: form.adresse_lon ?? null,
          zone_id: form.zone_id || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error ?? 'Erreur'); return }
      setSaveOk(true)
      setContacts(cs => cs.map(c => c.id === d.contact.id ? { ...d.contact, commercial_nom: c.commercial_nom } : c))
      setSelected({ ...d.contact, commercial_nom: selected.commercial_nom })
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e: any) { setSaveErr(e.message ?? 'Erreur réseau') }
    finally { setSaving(false) }
  }

  const deleteContact = async () => {
    if (!selected || !confirm('Supprimer ce contact définitivement ?')) return
    setDeleting(true)
    await fetch('/api/contacts/' + selected.id, { method: 'DELETE' })
    setContacts(cs => cs.filter(c => c.id !== selected.id))
    setSelected(null)
    setDeleting(false)
    if (isMobile) setMobileTab('list')
  }

  const ZoneBadge = ({ nom, couleur }: { nom: string; couleur: string }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: couleur + '22', color: couleur, border: `1px solid ${couleur}44`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: couleur, flexShrink: 0 }} />
      {nom}
    </span>
  )

  const AdresseField = () => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={sectionLabel}>Adresse</span>
        <button onClick={() => { setAdresseMode(m => m === 'secteur' ? 'libre' : 'secteur'); clearAdresse() }}
          style={{ background: 'none', border: 'none', color: C.primary, fontSize: 11, cursor: 'pointer', padding: 0 }}>
          {adresseMode === 'secteur' ? '+ Hors secteur' : '← Retour secteur'}
        </button>
      </div>
      {adresseMode === 'secteur' ? (
        form.adresse_id && form._adresse_text ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.25)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{form._adresse_text}</div>
              {form._zone_nom && <div style={{ marginTop: 5 }}><ZoneBadge nom={form._zone_nom} couleur={form._zone_couleur || C.primary} /></div>}
            </div>
            <button onClick={clearAdresse} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>✕</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input value={adresseQuery} onChange={e => searchAdresse(e.target.value)}
              onFocus={() => adresseQuery.length >= 2 && setShowAdresseDD(true)}
              onBlur={() => setTimeout(() => setShowAdresseDD(false), 200)}
              placeholder="Rechercher une adresse du secteur…" style={inp} />
            {showAdresseDD && adresseResults.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: C.card2, border: `1px solid ${C.borderl}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 200, overflowY: 'auto' }}>
                {adresseResults.map((a: any) => (
                  <div key={a.id} onMouseDown={() => selectAdresseResult(a)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 13, color: C.text }}>{addrText(a)}</div>
                    {a.zones_prospection && <div style={{ marginTop: 3 }}><ZoneBadge nom={a.zones_prospection.nom} couleur={a.zones_prospection.couleur} /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <input value={form.adresse_libre} onChange={e => setForm(f => ({ ...f, adresse_libre: e.target.value }))}
          placeholder="Ex : 3 rue de la Paix, 75001 Paris" style={inp} />
      )}
    </div>
  )

  const FormBody = () => (
    <div style={{ padding: '4px 16px 24px' }}>
      {selected && (
        <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)', fontSize: 12, color: C.mid }}>
          Contact de <strong style={{ color: C.text }}>{selected.commercial_nom}</strong>
        </div>
      )}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>👤</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Identité</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><span style={sectionLabel}>Prénom</span><input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} style={inp} /></div>
          <div><span style={sectionLabel}>Nom</span><input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={inp} /></div>
        </div>
        <div style={{ marginBottom: 8 }}><span style={sectionLabel}>Téléphone</span><input value={form.tel1} onChange={e => setForm(f => ({ ...f, tel1: e.target.value }))} style={inp} /></div>
        <div><span style={sectionLabel}>Email</span><input value={form.email1} onChange={e => setForm(f => ({ ...f, email1: e.target.value }))} style={inp} type="email" /></div>
      </div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>📍</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Localisation</span>
        </div>
        {AdresseField()}
      </div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>🏠</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Projet</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={sectionLabel}>Type de contact</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, type_contact: f.type_contact === v ? '' : v }))} style={pill(form.type_contact === v)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={sectionLabel}>Statut pipeline</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(STATUT_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, statut_pipeline: v }))} style={pill(form.statut_pipeline === v, STATUT_COLORS[v])}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <span style={sectionLabel}>Horizon de vente</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(HORIZON_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => {
                const newH = form.horizon_vente === v ? '' : v
                const today = new Date().toISOString().split('T')[0]!
                const qd = form.horizon_qualification_date || today
                setForm(f => ({ ...f, horizon_vente: newH, horizon_qualification_date: newH ? qd : '', horizon_echeance_date: newH ? calcEcheance(qd, newH) : '' }))
              }} style={pill(form.horizon_vente === v, C.gold)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>📅</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Suivi</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={sectionLabel}>Date de relance</span>
          <input type="date" value={form.date_relance} onChange={e => setForm(f => ({ ...f, date_relance: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
        </div>
        <div>
          <span style={sectionLabel}>Notes</span>
          <textarea value={form.notes} rows={4} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, resize: 'none' as const }} />
        </div>
      </div>
    </div>
  )

  const contactPoints: ContactPoint[] = contacts.flatMap(c => {
    const lat = c.adresse_lat ?? c.adresses?.lat ?? null
    const lon = c.adresse_lon ?? c.adresses?.lon ?? null
    if (!lat || !lon) return []
    return [{ id: c.id, lat, lon, prenom: c.prenom, nom: c.nom, statut_pipeline: c.statut_pipeline, zone_nom: (c.zones_prospection ?? c.adresses?.zones_prospection)?.nom }]
  })

  const ListPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.card, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            Contacts <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>({contacts.length})</span>
          </h2>
        </div>
        {/* Filtre par commercial */}
        {equipe.length > 1 && (
          <select value={filterCid} onChange={e => setFilterCid(e.target.value)}
            style={{ ...inp, marginBottom: 8, fontSize: 12 }}>
            <option value="">Toute l&apos;équipe</option>
            {equipe.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher…" style={{ ...inp, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['tous','Tous'],['relance','À relancer']].map(([v, l]) => (
            <button key={v} onClick={() => setFiltre(v)} style={pill(filtre === v)}>{l}</button>
          ))}
          <select value={typeFiltre} onChange={e => setTypeFiltre(e.target.value)}
            style={{ ...inp, padding: '5px 8px', width: 'auto', fontSize: 12, cursor: 'pointer', flex: 1 }}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Chargement…</div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.mid, fontSize: 13 }}>Aucun contact</div>
        ) : contacts.map(c => {
          const isActive = selected?.id === c.id
          const zp    = c.zones_prospection ?? c.adresses?.zones_prospection ?? null
          const addr  = c.adresses ? addrText(c.adresses) : (c.adresse_libre ?? '')
          const sc    = STATUT_COLORS[c.statut_pipeline ?? 'prospect'] ?? C.mid
          const isLate = c.date_relance && new Date(c.date_relance) < new Date()
          return (
            <div key={c.id} onClick={() => selectContact(c)} style={{
              padding: '11px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
              background: isActive ? 'rgba(29,158,117,0.10)' : 'transparent',
              borderLeft: isActive ? `3px solid ${C.primary}` : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: `${sc}22`, color: sc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                  {initiales(c)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[c.prenom, c.nom].filter(Boolean).join(' ') || <span style={{ color: C.muted }}>Sans nom</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.primary, marginTop: 1 }}>{c.commercial_nom}</div>
                  {addr && <div style={{ fontSize: 11, color: C.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{addr}</div>}
                  <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.type_contact && <span style={{ fontSize: 10, color: C.muted, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 }}>{TYPE_LABELS[c.type_contact] ?? c.type_contact}</span>}
                    {zp && <span style={{ fontSize: 10, background: zp.couleur + '22', color: zp.couleur, padding: '1px 6px', borderRadius: 4 }}>{zp.nom}</span>}
                    {c.statut_pipeline && c.statut_pipeline !== 'prospect' && <span style={{ fontSize: 10, fontWeight: 600, color: sc }}>{STATUT_LABELS[c.statut_pipeline]}</span>}
                  </div>
                </div>
                {c.date_relance && (
                  <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 4 }}>
                    <div style={{ fontSize: 10, color: C.muted }}>Relance</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isLate ? C.danger : C.gold }}>{fmtDate(c.date_relance)}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const DetailPanel = selected ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isMobile && <button onClick={() => setMobileTab('list')} style={{ background: 'none', border: 'none', color: C.mid, fontSize: 20, cursor: 'pointer', padding: 0 }}>←</button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[selected.prenom, selected.nom].filter(Boolean).join(' ') || 'Contact sans nom'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Modifié {fmtDate(selected.updated_at)}</div>
          </div>
          <button onClick={deleteContact} disabled={deleting}
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(239,68,68,0.1)', color: C.danger, border: '1px solid rgba(239,68,68,0.22)', cursor: 'pointer' }}>
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 14 }}>
        {FormBody()}
      </div>
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        {saveErr && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>{saveErr}</div>}
        {saveOk  && <div style={{ fontSize: 12, color: C.green,  marginBottom: 8 }}>✓ Enregistré</div>}
        <button onClick={save} disabled={saving}
          style={{ width: '100%', padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: saving ? C.dim : C.primary, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  ) : null

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: C.bg, color: C.text }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {mobileTab === 'list'   && <div style={{ height: '100%' }}>{ListPanel}</div>}
          {mobileTab === 'map'    && <div style={{ height: '100%', width: '100%' }}><ContactsMap contacts={contactPoints} selectedId={selected?.id ?? null} onContactClick={id => { const c = contacts.find(x => x.id === id); if (c) selectContact(c) }} /></div>}
          {mobileTab === 'detail' && <div style={{ height: '100%', background: C.card }}>{DetailPanel ?? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>Sélectionnez un contact</div>}</div>}
        </div>
        <div style={{ display: 'flex', background: C.card, borderTop: `1px solid ${C.border}` }}>
          {(['list','map','detail'] as const).map((tab, i) => {
            const labels = ['📋 Liste', '🗺 Carte', '👤 Détail']
            const active = mobileTab === tab
            return <button key={tab} onClick={() => setMobileTab(tab)} style={{ flex: 1, padding: '10px 4px', background: 'none', border: 'none', color: active ? C.primary : C.mid, fontWeight: active ? 700 : 400, fontSize: 11, cursor: 'pointer', borderTop: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{labels[i]}</button>
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', background: C.bg, color: C.text, overflow: 'hidden' }}>
      <div style={{ width: 380, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {ListPanel}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 200, position: 'relative' }}>
          <ContactsMap contacts={contactPoints} selectedId={selected?.id ?? null} onContactClick={id => { const c = contacts.find(x => x.id === id); if (c) selectContact(c) }} />
        </div>
        {DetailPanel && (
          <div style={{ height: 460, flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {DetailPanel}
          </div>
        )}
      </div>
    </div>
  )
}
