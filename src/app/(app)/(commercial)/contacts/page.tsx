'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

/* ── Design tokens ───────────────────────────────────────────────── */
const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.10)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  success: '#22C55E',
  danger:  '#EF4444',
  gold:    '#D97706',
}

const TYPE_LABELS: Record<string,string> = {
  interet_vente:  'Intérêt vente',
  projet_moyen:   'Projet moyen terme',
  projet_long:    'Projet long terme',
  voisin_relais:  'Voisin relais',
  recommandation: 'Recommandation',
  commercant:     'Commerçant',
  autre:          'Autre',
}

const STATUT: Record<string,{label:string;color:string;bg:string}> = {
  prospect:      { label:'Prospect',   color:'#9A9AA8', bg:'rgba(255,255,255,0.06)' },
  qualification: { label:'Découverte', color:'#60A5FA', bg:'rgba(59,130,246,0.12)'  },
  estimation:    { label:'Estimation', color:'#FBBF24', bg:'rgba(251,191,36,0.12)'  },
  mandat:        { label:'Mandat',     color:'#4ADE80', bg:'rgba(34,197,94,0.12)'   },
  perdu:         { label:'Perdu',      color:'#F87171', bg:'rgba(239,68,68,0.12)'   },
}

function addr(a: any) {
  return a ? [a.numero, a.nom_voie, a.code_postal, a.commune].filter(Boolean).join(' ') : ''
}
function st(s: string) { return STATUT[s] ?? STATUT.prospect }

function buildMailto(c: any): string {
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'
  const adrStr = addr(c.adresses)
  const relanceDateLabel = c.date_relance
    ? new Date(c.date_relance + 'T12:00:00').toLocaleDateString('fr-FR') : ''
  const subject = c.date_relance
    ? 'Relance contact Prospector pour le ' + relanceDateLabel
    : 'Fiche contact – ' + nom
  const body = [
    'Contact : ' + nom,
    adrStr         ? 'Adresse : '  + adrStr : '',
    c.tel1         ? 'Tél : '      + c.tel1 : '',
    c.email1       ? 'Email : '    + c.email1 : '',
    c.type_contact ? 'Type : '     + (TYPE_LABELS[c.type_contact] ?? c.type_contact) : '',
    c.statut_pipeline ? 'Statut : '  + (STATUT[c.statut_pipeline]?.label ?? c.statut_pipeline) : '',
    c.notes        ? 'Notes : '    + c.notes : '',
    relanceDateLabel ? 'Relance le : ' + relanceDateLabel : '',
    '', '---', 'Envoyé depuis PROspector',
  ].filter(Boolean).join('\n')
  return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)
}

function downloadICS(c: any) {
  if (!c.date_relance) return
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ')
  const dateStr = c.date_relance.replace(/-/g, '')
  const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'
  const description = [
    'Prospect : ' + nom,
    'Adresse : ' + (addr(c.adresses) || 'Non renseignée'),
    'Tél : ' + (c.tel1 || 'Non renseigné'),
    'Type : ' + (TYPE_LABELS[c.type_contact] ?? ''),
    'Notes : ' + (c.notes || ''),
  ].join('\n')
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PROspector//FR',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:relance-' + c.id + '@prospector','DTSTAMP:' + now,
    'DTSTART;VALUE=DATE:' + dateStr,'DTEND;VALUE=DATE:' + dateStr,
    'SUMMARY:Relance – ' + nom,
    'DESCRIPTION:' + description.replace(/\n/g,'\\n'),
    'LOCATION:' + (addr(c.adresses) || ''),
    'END:VEVENT','END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'relance-' + nom.toLowerCase().replace(/\s+/g,'-') + '.ics'
  link.click(); URL.revokeObjectURL(link.href)
}

export default function ContactsPage() {
  const searchParams = useSearchParams()

  const inp: React.CSSProperties = {
    width:'100%', padding:'9px 12px', borderRadius:9,
    border:`1.5px solid ${C.borderl}`,
    fontSize:14, outline:'none', boxSizing:'border-box',
    background:'rgba(255,255,255,0.05)', color: C.text,
  }

  const [contacts,    setContacts]   = useState<any[]>([])
  const [loading,     setLoading]    = useState(true)
  const [selected,    setSelected]   = useState<any|null>(null)
  const [filtre,      setFiltre]     = useState<string>(() => {
    const f = searchParams.get('filtre')
    return (f === 'relance' || f === 'tous') ? (f ?? 'tous') : 'tous'
  })
  const [typeFiltre,  setTypeFiltre] = useState('')
  const [recherche,   setRecherche]  = useState('')
  const [form,        setForm]       = useState<any>({})
  const [saving,      setSaving]     = useState(false)
  const [saveOk,      setSaveOk]     = useState(false)
  const [saveErr,     setSaveErr]    = useState('')
  const [isMobile,    setIsMobile]   = useState(false)
  const [mobileView,  setMobileView] = useState<'list'|'detail'>('list')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadContacts = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ filtre, recherche })
    if (typeFiltre) p.set('type_contact', typeFiltre)
    fetch('/api/contacts?' + p)
      .then(r => r.json())
      .then(d => { setContacts(d.contacts ?? []); setLoading(false) })
      .catch(()  => { setContacts([]); setLoading(false) })
  }, [filtre, typeFiltre, recherche])

  useEffect(() => { loadContacts() }, [loadContacts])

  const selectContact = (c: any) => {
    setSelected(c)
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
    })
    setSaveOk(false); setSaveErr('')
    if (isMobile) setMobileView('detail')
  }

  const isRelance = (c: any) => c.date_relance && c.date_relance <= new Date().toISOString().split('T')[0]
  const nbRelance = contacts.filter(isRelance).length

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
        }),
      })
      const d = await r.json()
      if (!r.ok || d.error) {
        setSaveErr(d.error ?? 'Erreur de sauvegarde')
      } else if (d.contact) {
        const updated = { ...selected, ...d.contact }
        setForm({
          prenom:          updated.prenom          ?? '',
          nom:             updated.nom             ?? '',
          tel1:            updated.tel1            ?? '',
          email1:          updated.email1          ?? '',
          type_contact:    updated.type_contact    ?? '',
          statut_pipeline: updated.statut_pipeline ?? 'prospect',
          date_relance:    updated.date_relance    ?? '',
          notes:           updated.notes           ?? '',
          horizon_vente:   updated.horizon_vente   ?? '',
        })
        setSelected(updated)
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
        setSaveOk(true)
        setTimeout(() => setSaveOk(false), 2500)
      }
    } catch(e) {
      setSaveErr('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const del = async () => {
    if (!selected || !confirm('Supprimer ce contact ?')) return
    await fetch('/api/contacts/' + selected.id, { method: 'DELETE' })
    setContacts(prev => prev.filter(c => c.id !== selected.id))
    setSelected(null)
    if (isMobile) setMobileView('list')
  }

  /* ── Panel liste ─────────────────────────────────────────────────── */
  const listPanel = (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background: C.card }}>
      {/* Header */}
      <div style={{ padding:'16px 16px 10px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h1 style={{ fontSize:18, fontWeight:700, margin:0, color: C.text }}>Contacts</h1>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {nbRelance > 0 && (
              <span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(249,115,22,0.12)', color:'#F97316', border:'1px solid rgba(249,115,22,0.25)' }}>
                🔔 {nbRelance}
              </span>
            )}
            <span style={{ fontSize:12, color: C.muted }}>{contacts.length}</span>
          </div>
        </div>
        <input placeholder="Rechercher…" value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ ...inp, marginBottom:8 }} />
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[['tous','Tous'],['relance','À relancer']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltre(k)}
              style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:'none', background:filtre===k ? C.primary : 'rgba(255,255,255,0.06)', color:filtre===k?'#fff': C.muted }}>
              {v}
            </button>
          ))}
          <select value={typeFiltre} onChange={e => setTypeFiltre(e.target.value)}
            style={{ padding:'3px 8px', borderRadius:20, fontSize:12, border:`1.5px solid ${C.borderl}`, background: C.card, color: C.mid, cursor:'pointer', outline:'none' }}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color: C.muted }}>Chargement…</div>
        ) : contacts.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color: C.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>👤</div>
            <div>Aucun contact</div>
          </div>
        ) : contacts.map(c => {
          const r = isRelance(c)
          const s = st(c.statut_pipeline)
          const isSelected = selected?.id === c.id
          return (
            <div key={c.id} onClick={() => selectContact(c)}
              style={{ padding:'12px 16px', cursor:'pointer', borderBottom:`1px solid ${C.border}`, background: isSelected ? 'rgba(29,158,117,0.06)' : r ? 'rgba(249,115,22,0.04)' : 'transparent', borderLeft: isSelected ? `3px solid ${C.primary}` : r ? '3px solid #F97316' : '3px solid transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <div style={{ flex:1, fontWeight:600, fontSize:14, color: C.text }}>{c.prenom} {c.nom}</div>
                <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:s.bg, color:s.color, flexShrink:0 }}>{s.label}</span>
              </div>
              <div style={{ fontSize:12, color: C.mid, marginBottom:2 }}>{TYPE_LABELS[c.type_contact] ?? c.type_contact ?? ''}</div>
              <div style={{ fontSize:11, color: C.muted }}>{addr(c.adresses) || 'Adresse non renseignée'}</div>
              {c.date_relance && (
                <div style={{ fontSize:11, color:r?'#F97316': C.muted, marginTop:3 }}>
                  📞 Relance : {new Date(c.date_relance + 'T12:00:00').toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  /* ── Panel détail ────────────────────────────────────────────────── */
  const detailPanel = selected ? (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background: C.card }}>
      {/* Header */}
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onClick={() => { setSelected(null); if(isMobile) setMobileView('list') }}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color: C.mid, padding:0, flexShrink:0 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: C.text }}>
            {[selected.prenom, selected.nom].filter(Boolean).join(' ') || 'Contact sans nom'}
          </div>
          <div style={{ fontSize:11, color: C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {addr(selected.adresses) || 'Adresse non renseignée'}
          </div>
        </div>
        <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:20, background:st(form.statut_pipeline || selected.statut_pipeline).bg, color:st(form.statut_pipeline || selected.statut_pipeline).color, flexShrink:0 }}>
          {st(form.statut_pipeline || selected.statut_pipeline).label}
        </span>
      </div>

      {/* Formulaire */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Bouton mail */}
        <a href={buildMailto({ ...selected, ...form })}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:9, fontWeight:600, fontSize:13, background:'rgba(29,158,117,0.1)', color: C.primary, border:'1.5px solid rgba(29,158,117,0.3)', textDecoration:'none' }}>
          ✉️ Envoyer par mail
        </a>

        {/* Identité */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>PRÉNOM</div>
            <input style={inp} value={form.prenom} onChange={e => setForm((f:any) => ({ ...f, prenom: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>NOM</div>
            <input style={inp} value={form.nom} onChange={e => setForm((f:any) => ({ ...f, nom: e.target.value }))} />
          </div>
        </div>

        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>TÉLÉPHONE</div>
          <input style={inp} type="tel" value={form.tel1} onChange={e => setForm((f:any) => ({ ...f, tel1: e.target.value }))} />
        </div>

        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>EMAIL</div>
          <input style={inp} type="email" value={form.email1} onChange={e => setForm((f:any) => ({ ...f, email1: e.target.value }))} />
        </div>

        {/* Qualification */}
        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>TYPE DE CONTACT</div>
          <select style={inp} value={form.type_contact} onChange={e => setForm((f:any) => ({ ...f, type_contact: e.target.value }))}>
            <option value="">— Non renseigné</option>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>STATUT PIPELINE</div>
          <select style={inp} value={form.statut_pipeline} onChange={e => setForm((f:any) => ({ ...f, statut_pipeline: e.target.value }))}>
            {Object.entries(STATUT).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>HORIZON DE VENTE</div>
          <select style={inp} value={form.horizon_vente} onChange={e => setForm((f:any) => ({ ...f, horizon_vente: e.target.value }))}>
            <option value="">— Non renseigné</option>
            <option value="moins_6_mois">Moins de 6 mois</option>
            <option value="6_12_mois">6 à 12 mois</option>
            <option value="1_2_ans">1 à 2 ans</option>
            <option value="plus_2_ans">Plus de 2 ans</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>DATE DE RELANCE</div>
          <input style={inp} type="date" value={form.date_relance} onChange={e => setForm((f:any) => ({ ...f, date_relance: e.target.value }))} />
        </div>

        <div>
          <div style={{ fontSize:11, color: C.muted, fontWeight:600, marginBottom:4 }}>NOTES</div>
          <textarea style={{ ...inp, minHeight:90, resize:'vertical', fontFamily:'inherit' } as React.CSSProperties}
            value={form.notes} onChange={e => setForm((f:any) => ({ ...f, notes: e.target.value }))} />
          <div style={{ fontSize:11, color: C.dim, marginTop:4 }}>Note limitée au projet immobilier (RGPD)</div>
        </div>

        {/* Calendrier si relance */}
        {form.date_relance && (
          <button onClick={() => downloadICS({ ...selected, ...form })}
            style={{ padding:'9px', borderRadius:9, fontSize:13, fontWeight:600, background:'rgba(29,158,117,0.1)', color: C.success, border:'1.5px solid rgba(29,158,117,0.3)', cursor:'pointer' }}>
            📅 Ajouter au calendrier
          </button>
        )}
      </div>

      {/* Feedback + Actions */}
      {saveErr && (
        <div style={{ padding:'8px 16px', background:'rgba(239,68,68,0.12)', color:'#F87171', fontSize:12, fontWeight:600, flexShrink:0 }}>
          ⚠️ {saveErr}
        </div>
      )}

      <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8, flexShrink:0 }}>
        <button onClick={save} disabled={saving}
          style={{ flex:1, padding:'11px', borderRadius:9, fontWeight:700, fontSize:14, border:'none', cursor:saving?'not-allowed':'pointer', background: saveOk ? '#0F6E56' : saving ? C.dim : C.primary, color:'#fff', transition:'background 0.2s' }}>
          {saveOk ? '✓ Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={del}
          style={{ padding:'11px 16px', borderRadius:9, fontSize:13, fontWeight:600, background:'rgba(239,68,68,0.08)', color:'#EF4444', border:'1.5px solid rgba(239,68,68,0.3)', cursor:'pointer' }}>
          Supprimer
        </button>
      </div>
    </div>
  ) : null

  /* ── Rendu final ─────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ height:'100dvh', overflow:'hidden', background: C.bg }}>
        {mobileView === 'list' || !selected
          ? <div style={{ height:'100%' }}>{listPanel}</div>
          : <div style={{ height:'100%' }}>{detailPanel}</div>
        }
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100dvh', overflow:'hidden', background: C.bg }}>
      <div style={{ width:selected?380:520, maxWidth:selected?380:680, flexShrink:0, borderRight:`1px solid ${C.border}`, height:'100%' }}>
        {listPanel}
      </div>
      {selected && (
        <div style={{ flex:1, height:'100%', overflow:'hidden' }}>
          {detailPanel}
        </div>
      )}
    </div>
  )
}
