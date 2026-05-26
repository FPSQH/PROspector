'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { ContactPoint } from '@/components/map/ContactsMap'

const ContactsMap = dynamic(() => import('@/components/map/ContactsMap'), { ssr: false })

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  card2:   '#1A1A1E',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.10)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  blue:    '#60A5FA',
  gold:    '#FBBF24',
  green:   '#4ADE80',
  danger:  '#F87171',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
function gmapsLink(lat?: number | null, lon?: number | null, text?: string | null) {
  if (lat && lon) return `https://maps.google.com/?q=${lat},${lon}`
  if (text)       return `https://maps.google.com/?q=${encodeURIComponent(text)}`
  return null
}
function calcEcheance(qualDate: string, horizon: string): string {
  const months: Record<string, number> = { 'moins_6_mois': 6, '6_12_mois': 12, '1_2_ans': 24, 'plus_2_ans': 36 }
  const m = months[horizon]
  if (!m || !qualDate) return ''
  const d = new Date(qualDate); d.setMonth(d.getMonth() + m)
  return d.toISOString().split('T')[0]
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

// ── Form vide ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  prenom: '', nom: '', tel1: '', email1: '',
  type_contact: '', statut_pipeline: 'prospect',
  date_relance: '', notes: '', horizon_vente: '',
  adresse_id:    null as string | null,
  adresse_libre: '',
  adresse_lat:   null as number | null,
  adresse_lon:   null as number | null,
  zone_id:       null as string | null,
  _adresse_text: '',
  _zone_nom:     '',
  _zone_couleur: '',
  horizon_qualification_date: '',
  horizon_echeance_date:      '',
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
    transition: 'all 0.15s',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ContactsPage() {
  const [contacts,       setContacts]       = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [selected,       setSelected]       = useState<any>(null)
  const [filtre,         setFiltre]         = useState('tous')
  const [typeFiltre,     setTypeFiltre]     = useState('')
  const [recherche,      setRecherche]      = useState('')
  const [form,           setForm]           = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM })
  const [saving,         setSaving]         = useState(false)
  const [saveOk,         setSaveOk]         = useState(false)
  const [saveErr,        setSaveErr]        = useState('')
  const [deleting,       setDeleting]       = useState(false)
  const [createMode,     setCreateMode]     = useState(false)
  const [creating,       setCreating]       = useState(false)
  const [createErr,      setCreateErr]      = useState('')
  const [isMobile,       setIsMobile]       = useState(false)
  const [mobileTab,      setMobileTab]      = useState<'list'|'map'|'detail'>('list')

  // Address search
  const [adresseQuery,   setAdresseQuery]   = useState('')
  const [adresseResults, setAdresseResults] = useState<any[]>([])
  const [adresseLoading, setAdresseLoading] = useState(false)
  const [adresseMode,    setAdresseMode]    = useState<'secteur'|'libre'>('secteur')
  const [showAdresseDD,  setShowAdresseDD]  = useState(false)
  const searchTimeout = useRef<any>(null)

  // ── Responsive ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Chargement ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ filtre, recherche, type_contact: typeFiltre })
    const r = await fetch('/api/contacts?' + p)
    const d = await r.json()
    setContacts(d.contacts ?? [])
    setLoading(false)
  }, [filtre, recherche, typeFiltre])

  useEffect(() => { load() }, [load])

  // ── Sélectionner un contact ────────────────────────────────────────────────
  const selectContact = useCallback((c: any) => {
    setSelected(c)
    setCreateMode(false)
    setSaveOk(false); setSaveErr('')
    setAdresseQuery(''); setAdresseResults([]); setShowAdresseDD(false)
    setAdresseMode(c.adresse_id ? 'secteur' : 'libre')
    setForm({
      prenom:          c.prenom          ?? '',
      nom:             c.nom             ?? '',
      tel1:            c.tel1            ?? '',
      email1:          c.email1          ?? '',
      type_contact:    c.type_contact    ?? '',
      statut_pipeline: c.statut_pipeline ?? 'prospect',
      date_relance:    c.date_relance    ?? '',
      notes:           c.notes           ?? '',
      horizon_vente:   c.horizon_vente   ?? '',
      adresse_id:      c.adresse_id      ?? null,
      adresse_libre:   c.adresse_libre   ?? '',
      adresse_lat:     c.adresse_lat     ?? c.adresses?.lat     ?? null,
      adresse_lon:     c.adresse_lon     ?? c.adresses?.lon     ?? null,
      zone_id:         c.zone_id         ?? c.zones_prospection?.id ?? null,
      _adresse_text:   c.adresses        ? addrText(c.adresses) : (c.adresse_libre ?? ''),
      _zone_nom:       c.zones_prospection?.nom     ?? '',
      _zone_couleur:   c.zones_prospection?.couleur ?? C.primary,
      horizon_qualification_date: c.horizon_qualification_date ?? '',
      horizon_echeance_date:      c.horizon_echeance_date      ?? '',
    })
    if (isMobile) setMobileTab('detail')
  }, [isMobile])

  // ── Création manuelle ─────────────────────────────────────────────────────
  const openCreate = () => {
    setSelected(null); setCreateMode(true); setCreateErr('')
    setSaveOk(false)
    setAdresseQuery(''); setAdresseResults([]); setShowAdresseDD(false)
    setAdresseMode('secteur')
    setForm({ ...EMPTY_FORM })
    if (isMobile) setMobileTab('detail')
  }

  // ── Recherche adresse secteur ─────────────────────────────────────────────
  const searchAdresse = (q: string) => {
    setAdresseQuery(q)
    setShowAdresseDD(true)
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
      ...f,
      adresse_id:    a.id,
      adresse_lat:   a.lat  ?? null,
      adresse_lon:   a.lon  ?? null,
      zone_id:       a.zone_id ?? null,
      adresse_libre: '',
      _adresse_text: addrText(a),
      _zone_nom:     zp?.nom     ?? '',
      _zone_couleur: zp?.couleur ?? C.primary,
    }))
    setAdresseQuery(''); setAdresseResults([]); setShowAdresseDD(false)
  }

  const clearAdresse = () => {
    setForm(f => ({ ...f, adresse_id: null, adresse_lat: null, adresse_lon: null, zone_id: null, _adresse_text: '', _zone_nom: '', _zone_couleur: '' }))
    setAdresseQuery(''); setAdresseResults([])
  }

  // ── Enregistrer (PATCH) ───────────────────────────────────────────────────
  const save = async () => {
    if (!selected) return
    setSaving(true); setSaveOk(false); setSaveErr('')
    try {
      const r = await fetch('/api/contacts/' + selected.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom:          form.prenom          || null,
          nom:             form.nom             || null,
          tel1:            form.tel1            || null,
          email1:          form.email1          || null,
          type_contact:    form.type_contact    || null,
          statut_pipeline: form.statut_pipeline || 'prospect',
          date_relance:    form.date_relance    || null,
          notes:           form.notes           || null,
          horizon_vente:   form.horizon_vente   || null,
          adresse_id:      form.adresse_id      || null,
          adresse_libre:   adresseMode === 'libre' ? (form.adresse_libre || null) : null,
          adresse_lat:     form.adresse_lat     ?? null,
          adresse_lon:     form.adresse_lon     ?? null,
          zone_id:         form.zone_id         || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error ?? 'Erreur'); return }
      setSaveOk(true)
      const updated = d.contact
      setContacts(cs => cs.map(c => c.id === updated.id ? updated : c))
      setSelected(updated)
      setForm(f => ({
        ...f,
        horizon_qualification_date: updated.horizon_qualification_date ?? f.horizon_qualification_date,
        horizon_echeance_date:      updated.horizon_echeance_date      ?? f.horizon_echeance_date,
        _zone_nom:     updated.zones_prospection?.nom     ?? f._zone_nom,
        _zone_couleur: updated.zones_prospection?.couleur ?? f._zone_couleur,
      }))
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e: any) { setSaveErr(e.message ?? 'Erreur réseau') }
    finally { setSaving(false) }
  }

  // ── Créer (POST) ──────────────────────────────────────────────────────────
  const create = async () => {
    if (!form.nom && !form.prenom) { setCreateErr('Nom ou prénom requis'); return }
    setCreating(true); setCreateErr('')
    try {
      const r = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom:          form.prenom          || null,
          nom:             form.nom             || null,
          tel1:            form.tel1            || null,
          email1:          form.email1          || null,
          type_contact:    form.type_contact    || null,
          statut_pipeline: form.statut_pipeline || 'prospect',
          date_relance:    form.date_relance    || null,
          notes:           form.notes           || null,
          horizon_vente:   form.horizon_vente   || null,
          adresse_id:      form.adresse_id      || null,
          adresse_libre:   adresseMode === 'libre' ? (form.adresse_libre || null) : null,
          adresse_lat:     form.adresse_lat     ?? null,
          adresse_lon:     form.adresse_lon     ?? null,
          zone_id:         form.zone_id         || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setCreateErr(d.error ?? 'Erreur'); return }
      await load()
      selectContact(d.contact)
      setCreateMode(false)
    } catch (e: any) { setCreateErr(e.message ?? 'Erreur réseau') }
    finally { setCreating(false) }
  }

  // ── Supprimer ─────────────────────────────────────────────────────────────
  const deleteContact = async () => {
    if (!selected || !confirm('Supprimer ce contact définitivement ?')) return
    setDeleting(true)
    await fetch('/api/contacts/' + selected.id, { method: 'DELETE' })
    setContacts(cs => cs.filter(c => c.id !== selected.id))
    setSelected(null)
    setDeleting(false)
    if (isMobile) setMobileTab('list')
  }

  // ── Points carte ──────────────────────────────────────────────────────────
  const contactPoints: ContactPoint[] = contacts.flatMap(c => {
    const lat = c.adresse_lat ?? c.adresses?.lat ?? null
    const lon = c.adresse_lon ?? c.adresses?.lon ?? null
    if (!lat || !lon) return []
    return [{ id: c.id, lat, lon, prenom: c.prenom, nom: c.nom, statut_pipeline: c.statut_pipeline, zone_nom: c.zones_prospection?.nom }]
  })

  // ── Composants réutilisables ──────────────────────────────────────────────
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

  // ── Champ adresse ─────────────────────────────────────────────────────────
  const AdresseField = () => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={sectionLabel}>Adresse</span>
        <button
          onClick={() => { setAdresseMode(m => m === 'secteur' ? 'libre' : 'secteur'); clearAdresse() }}
          style={{ background: 'none', border: 'none', color: C.primary, fontSize: 11, cursor: 'pointer', padding: 0 }}>
          {adresseMode === 'secteur' ? '+ Hors secteur' : '← Retour secteur'}
        </button>
      </div>

      {adresseMode === 'secteur' ? (
        form.adresse_id && form._adresse_text ? (
          /* Adresse sélectionnée */
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(29,158,117,0.1)', border: `1px solid rgba(29,158,117,0.25)` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500, lineHeight: 1.4 }}>{form._adresse_text}</div>
              {form._zone_nom && <div style={{ marginTop: 5 }}><ZoneBadge nom={form._zone_nom} couleur={form._zone_couleur || C.primary} /></div>}
            </div>
            <button onClick={clearAdresse} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>✕</button>
          </div>
        ) : (
          /* Recherche */
          <div style={{ position: 'relative' }}>
            <input
              value={adresseQuery}
              onChange={e => searchAdresse(e.target.value)}
              onFocus={() => adresseQuery.length >= 2 && setShowAdresseDD(true)}
              onBlur={() => setTimeout(() => setShowAdresseDD(false), 200)}
              placeholder="Rechercher une adresse du secteur…"
              style={inp}
            />
            {adresseLoading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.muted }}>…</span>}
            {showAdresseDD && (adresseResults.length > 0 || (adresseQuery.length >= 2 && !adresseLoading)) && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                background: C.card2, border: `1px solid ${C.borderl}`, borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 220, overflowY: 'auto',
              }}>
                {adresseResults.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.muted }}>Aucune adresse trouvée dans votre secteur</div>
                ) : adresseResults.map((a: any) => {
                  const zp = a.zones_prospection
                  return (
                    <div key={a.id} onMouseDown={() => selectAdresseResult(a)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ fontSize: 13, color: C.text }}>{addrText(a)}</div>
                      {zp && <div style={{ marginTop: 3 }}><ZoneBadge nom={zp.nom} couleur={zp.couleur} /></div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      ) : (
        /* Adresse libre */
        <div>
          <input
            value={form.adresse_libre}
            onChange={e => setForm(f => ({ ...f, adresse_libre: e.target.value }))}
            placeholder="Ex : 3 rue de la Paix, 75001 Paris"
            style={inp}
          />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Adresse hors secteur — saisie libre</div>
        </div>
      )}

      {/* Lien Google Maps */}
      {(() => {
        const link = gmapsLink(form.adresse_lat, form.adresse_lon, form.adresse_libre || form._adresse_text)
        return link ? (
          <a href={link} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.primary, textDecoration: 'none', marginTop: 8 }}>
            🗺 Ouvrir dans Google Maps
          </a>
        ) : null
      })()}
    </div>
  )

  // ── Formulaire 4 sections ─────────────────────────────────────────────────
  const FormBody = () => (
    <div style={{ padding: '4px 16px 24px' }}>

      {/* ── 1. Identité ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>👤</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Identité</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={sectionLabel}>Prénom</span>
            <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} style={inp} placeholder="Prénom" />
          </div>
          <div>
            <span style={sectionLabel}>Nom</span>
            <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={inp} placeholder="Nom" />
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <span style={sectionLabel}>Téléphone</span>
          <input value={form.tel1} onChange={e => setForm(f => ({ ...f, tel1: e.target.value }))} style={inp} placeholder="06 00 00 00 00" />
        </div>
        <div>
          <span style={sectionLabel}>Email</span>
          <input value={form.email1} onChange={e => setForm(f => ({ ...f, email1: e.target.value }))} style={inp} placeholder="email@exemple.fr" type="email" />
        </div>
      </div>

      {/* ── 2. Localisation ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>📍</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Localisation</span>
        </div>
        {AdresseField()}
      </div>

      {/* ── 3. Projet ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>🏠</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Projet</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={sectionLabel}>Type de contact</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, type_contact: f.type_contact === v ? '' : v }))}
                style={pill(form.type_contact === v)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={sectionLabel}>Statut pipeline</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(STATUT_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, statut_pipeline: v }))}
                style={pill(form.statut_pipeline === v, STATUT_COLORS[v])}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <span style={sectionLabel}>Horizon de vente</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {Object.entries(HORIZON_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => {
                const newH = form.horizon_vente === v ? '' : v
                const today = new Date().toISOString().split('T')[0]
                const qd = form.horizon_qualification_date || today
                setForm(f => ({
                  ...f,
                  horizon_vente: newH,
                  horizon_qualification_date: newH ? qd : '',
                  horizon_echeance_date:      newH ? calcEcheance(qd, newH) : '',
                }))
              }} style={pill(form.horizon_vente === v, C.gold)}>{l}</button>
            ))}
          </div>
          {form.horizon_vente && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)' }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Qualifié le</div>
                  <div style={{ fontSize: 12, color: C.text }}>{fmtDate(form.horizon_qualification_date || new Date().toISOString().split('T')[0])}</div>
                </div>
                {form.horizon_echeance_date && (
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Échéance estimée</div>
                    <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>{fmtDate(form.horizon_echeance_date)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Suivi ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>📅</span><span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Suivi</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={sectionLabel}>Date de relance</span>
          <input type="date" value={form.date_relance} onChange={e => setForm(f => ({ ...f, date_relance: e.target.value }))}
            style={{ ...inp, colorScheme: 'dark' }} />
        </div>
        <div>
          <span style={sectionLabel}>Notes</span>
          <textarea value={form.notes} rows={4} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Informations sur l'échange, remarques…"
            style={{ ...inp, resize: 'none' as const }} />
        </div>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // PANELS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Panel liste ───────────────────────────────────────────────────────────
  const ListPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.card, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            Contacts <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>({contacts.length})</span>
          </h2>
          <button onClick={openCreate} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: C.primary, color: '#fff', border: 'none', cursor: 'pointer' }}>
            + Nouveau
          </button>
        </div>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher un contact…" style={{ ...inp, marginBottom: 8 }} />
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

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Chargement…</div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
            <div style={{ fontSize: 13, color: C.mid, marginBottom: 14 }}>Aucun contact</div>
            <button onClick={openCreate} style={{ padding: '9px 18px', borderRadius: 8, background: C.primary, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Créer le premier contact
            </button>
          </div>
        ) : contacts.map(c => {
          const isActive = (selected?.id === c.id && !createMode) || false
          const zp = c.zones_prospection
          const addr = c.adresses ? addrText(c.adresses) : (c.adresse_libre ?? '')
          const sc = STATUT_COLORS[c.statut_pipeline ?? 'prospect'] ?? C.mid
          const isLate = c.date_relance && new Date(c.date_relance) < new Date()
          return (
            <div key={c.id} onClick={() => selectContact(c)}
              style={{
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
                    {[c.prenom, c.nom].filter(Boolean).join(' ') || <span style={{ color: C.muted, fontStyle: 'italic' }}>Sans nom</span>}
                  </div>
                  {addr && <div style={{ fontSize: 11, color: C.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{addr}</div>}
                  <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.type_contact && <span style={{ fontSize: 10, color: C.muted, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 }}>{TYPE_LABELS[c.type_contact] ?? c.type_contact}</span>}
                    {zp && <ZoneBadge nom={zp.nom} couleur={zp.couleur} />}
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

  // ── Panel détail ──────────────────────────────────────────────────────────
  const DetailPanel = selected && !createMode ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isMobile && (
            <button onClick={() => setMobileTab('list')} style={{ background: 'none', border: 'none', color: C.mid, fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[selected.prenom, selected.nom].filter(Boolean).join(' ') || 'Contact sans nom'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Modifié {fmtDate(selected.updated_at)}</div>
          </div>
          <button onClick={deleteContact} disabled={deleting}
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(239,68,68,0.1)', color: C.danger, border: '1px solid rgba(239,68,68,0.22)', cursor: 'pointer', flexShrink: 0 }}>
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

  // ── Panel création ────────────────────────────────────────────────────────
  const CreatePanel = createMode ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isMobile && (
            <button onClick={() => { setCreateMode(false); setMobileTab('list') }} style={{ background: 'none', border: 'none', color: C.mid, fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Nouveau contact</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Saisie manuelle — hors session de prospection</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 14 }}>
        {FormBody()}
      </div>
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        {createErr && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>{createErr}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setCreateMode(false); if (isMobile) setMobileTab('list') }}
            style={{ padding: '11px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={create} disabled={creating}
            style={{ flex: 1, padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: creating ? C.dim : C.primary, color: '#fff', border: 'none', cursor: creating ? 'not-allowed' : 'pointer' }}>
            {creating ? 'Création…' : 'Créer le contact'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ── Carte ─────────────────────────────────────────────────────────────────
  const MapPanel = (
    <div style={{ width: '100%', height: '100%' }}>
      {contactPoints.length > 0 ? (
        <ContactsMap
          contacts={contactPoints}
          selectedId={selected?.id ?? null}
          onContactClick={id => { const c = contacts.find(x => x.id === id); if (c) selectContact(c) }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, background: C.card }}>
          <div style={{ fontSize: 32 }}>🗺</div>
          <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', maxWidth: 200 }}>
            {contacts.length === 0 ? 'Aucun contact' : 'Aucun contact géolocalisé dans la sélection'}
          </div>
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE
  // ═══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    const renderTab = () => {
      if (mobileTab === 'list')   return <div style={{ height: '100%' }}>{ListPanel}</div>
      if (mobileTab === 'map')    return <div style={{ height: '100%' }}>{MapPanel}</div>
      if (mobileTab === 'detail') return (
        <div style={{ height: '100%', background: C.card }}>
          {DetailPanel ?? CreatePanel ?? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: C.muted }}>
              <div style={{ fontSize: 32 }}>👤</div>
              <div style={{ fontSize: 13 }}>Sélectionnez un contact</div>
            </div>
          )}
        </div>
      )
      return null
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: C.bg, color: C.text }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>{renderTab()}</div>
        <div style={{ display: 'flex', background: C.card, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          {([['list','📋','Liste'],['map','🗺','Carte'],['detail','👤','Détail']] as [string,string,string][]).map(([tab, icon, label]) => {
            const active   = mobileTab === tab
            const disabled = tab === 'detail' && !selected && !createMode
            return (
              <button key={tab} onClick={() => !disabled && setMobileTab(tab as any)}
                style={{ flex: 1, padding: '10px 4px', background: 'none', border: 'none',
                  color: disabled ? C.dim : active ? C.primary : C.mid,
                  fontWeight: active ? 700 : 400, fontSize: 11, cursor: disabled ? 'not-allowed' : 'pointer',
                  borderTop: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>
                <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP
  // ═══════════════════════════════════════════════════════════════════════════
  const rightContent = DetailPanel ?? CreatePanel

  return (
    <div style={{ display: 'flex', height: '100dvh', background: C.bg, color: C.text, overflow: 'hidden' }}>

      {/* Liste (fixe 360px) */}
      <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {ListPanel}
      </div>

      {/* Zone droite */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Carte — prend tout l'espace disponible */}
        <div style={{ flex: 1, minHeight: 200, position: 'relative' }}>
          {MapPanel}
        </div>

        {/* Détail / Création — hauteur fixe en bas */}
        {rightContent && (
          <div style={{ height: 440, flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {rightContent}
          </div>
        )}
      </div>
    </div>
  )
}
