'use client'

import { useEffect, useState, useCallback } from 'react'

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
  prospect:      { label:'Prospect',   color:'#6b7280', bg:'#f3f4f6' },
  qualification: { label:'Découverte', color:'#1d4ed8', bg:'#dbeafe' },
  estimation:    { label:'Estimation', color:'#92400e', bg:'#fef3c7' },
  mandat:        { label:'Mandat',     color:'#065f46', bg:'#d1fae5' },
  perdu:         { label:'Perdu',      color:'#b91c1c', bg:'#fee2e2' },
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
  const [contacts,    setContacts]   = useState<any[]>([])
  const [loading,     setLoading]    = useState(true)
  const [selected,    setSelected]   = useState<any|null>(null)
  const [filtre,      setFiltre]     = useState('tous')
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

  // ── Sauvegarde ────────────────────────────────────────────────────────────
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
        // ✅ Mettre à jour form, selected ET la liste
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

  // ── Styles communs ────────────────────────────────────────────────────────
  const inp: any = {
    width:'100%', padding:'9px 12px', borderRadius:9, border:'1.5px solid #E8E6DF',
    fontSize:14, outline:'none', boxSizing:'border-box', background:'#fff',
  }

  // ── Panel liste ───────────────────────────────────────────────────────────
  const listPanel = (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff' }}>
      {/* Header */}
      <div style={{ padding:'16px 16px 10px', borderBottom:'1px solid #E8E6DF', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h1 style={{ fontSize:18, fontWeight:700, margin:0 }}>Contacts</h1>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {nbRelance > 0 && (
              <span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#fff7ed', color:'#f97316', border:'1px solid #fed7aa' }}>
                🔔 {nbRelance}
              </span>
            )}
            <span style={{ fontSize:12, color:'#9ca3af' }}>{contacts.length}</span>
          </div>
        </div>
        <input placeholder="Rechercher…" value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ ...inp, marginBottom:8 }} />
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[['tous','Tous'],['relance','À relancer']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltre(k)}
              style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:'none', background:filtre===k?'#1D9E75':'#F0EDE6', color:filtre===k?'#fff':'#5F5E5A' }}>
              {v}
            </button>
          ))}
          <select value={typeFiltre} onChange={e => setTypeFiltre(e.target.value)}
            style={{ padding:'3px 8px', borderRadius:20, fontSize:12, border:'1.5px solid #E8E6DF', background:'#fff', cursor:'pointer' }}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Chargement…</div>
        ) : contacts.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>👤</div>
            <div>Aucun contact</div>
          </div>
        ) : contacts.map(c => {
          const r = isRelance(c)
          const s = st(c.statut_pipeline)
          const isSelected = selected?.id === c.id
          return (
            <div key={c.id} onClick={() => selectContact(c)}
              style={{ padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid #F0EDE6', background: isSelected ? '#f0fdf4' : r ? '#fff7ed' : '#fff', borderLeft: isSelected ? '3px solid #1D9E75' : r ? '3px solid #f97316' : '3px solid transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <div style={{ flex:1, fontWeight:600, fontSize:14 }}>{c.prenom} {c.nom}</div>
                {/* ✅ Badge statut mis à jour immédiatement */}
                <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:s.bg, color:s.color, flexShrink:0 }}>{s.label}</span>
              </div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:2 }}>{TYPE_LABELS[c.type_contact] ?? c.type_contact ?? ''}</div>
              <div style={{ fontSize:11, color:'#9ca3af' }}>{addr(c.adresses) || 'Adresse non renseignée'}</div>
              {c.date_relance && (
                <div style={{ fontSize:11, color:r?'#f97316':'#9ca3af', marginTop:3 }}>
                  📞 Relance : {new Date(c.date_relance + 'T12:00:00').toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Panel détail ──────────────────────────────────────────────────────────
  const detailPanel = selected ? (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff' }}>
      {/* Header */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6DF', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onClick={() => { setSelected(null); if(isMobile) setMobileView('list') }}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#9ca3af', padding:0, flexShrink:0 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {[selected.prenom, selected.nom].filter(Boolean).join(' ') || 'Contact sans nom'}
          </div>
          <div style={{ fontSize:11, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {addr(selected.adresses) || 'Adresse non renseignée'}
          </div>
        </div>
        {/* ✅ Badge statut reflète form.statut_pipeline en temps réel */}
        <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:20, background:st(form.statut_pipeline || selected.statut_pipeline).bg, color:st(form.statut_pipeline || selected.statut_pipeline).color, flexShrink:0 }}>
          {st(form.statut_pipeline || selected.statut_pipeline).label}
        </span>
      </div>

      {/* Formulaire */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Bouton mail */}
        <a href={buildMailto({ ...selected, ...form })}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:9, fontWeight:600, fontSize:13, background:'#f0fdf4', color:'#1D9E75', border:'1.5px solid #bbf7d0', textDecoration:'none' }}>
          ✉️ Envoyer par mail
        </a>

        {/* Identité */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>PRÉNOM</div>
            <input style={inp} value={form.prenom} onChange={e => setForm((f:any) => ({ ...f, prenom: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>NOM</div>
            <input style={inp} value={form.nom} onChange={e => setForm((f:any) => ({ ...f, nom: e.target.value }))} />
          </div>
        </div>

        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>TÉLÉPHONE</div>
          <input style={inp} type="tel" value={form.tel1} onChange={e => setForm((f:any) => ({ ...f, tel1: e.target.value }))} />
        </div>

        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>EMAIL</div>
          <input style={inp} type="email" value={form.email1} onChange={e => setForm((f:any) => ({ ...f, email1: e.target.value }))} />
        </div>

        {/* Qualification */}
        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>TYPE DE CONTACT</div>
          <select style={inp} value={form.type_contact} onChange={e => setForm((f:any) => ({ ...f, type_contact: e.target.value }))}>
            <option value="">— Non renseigné</option>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>STATUT PIPELINE</div>
          <select style={inp} value={form.statut_pipeline} onChange={e => setForm((f:any) => ({ ...f, statut_pipeline: e.target.value }))}>
            {Object.entries(STATUT).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>HORIZON DE VENTE</div>
          <select style={inp} value={form.horizon_vente} onChange={e => setForm((f:any) => ({ ...f, horizon_vente: e.target.value }))}>
            <option value="">— Non renseigné</option>
            <option value="moins_6_mois">Moins de 6 mois</option>
            <option value="6_12_mois">6 à 12 mois</option>
            <option value="1_2_ans">1 à 2 ans</option>
            <option value="plus_2_ans">Plus de 2 ans</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>DATE DE RELANCE</div>
          <input style={inp} type="date" value={form.date_relance} onChange={e => setForm((f:any) => ({ ...f, date_relance: e.target.value }))} />
        </div>

        <div>
          <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>NOTES</div>
          <textarea style={{ ...inp, minHeight:90, resize:'vertical', fontFamily:'inherit' }}
            value={form.notes} onChange={e => setForm((f:any) => ({ ...f, notes: e.target.value }))} />
          <div style={{ fontSize:11, color:'#d4b896', marginTop:4 }}>Note limitée au projet immobilier (RGPD)</div>
        </div>

        {/* Calendrier si relance */}
        {form.date_relance && (
          <button onClick={() => downloadICS({ ...selected, ...form })}
            style={{ padding:'9px', borderRadius:9, fontSize:13, fontWeight:600, background:'#f0fdf4', color:'#15803d', border:'1.5px solid #bbf7d0', cursor:'pointer' }}>
            📅 Ajouter au calendrier
          </button>
        )}
      </div>

      {/* Feedback + Actions */}
      {saveErr && (
        <div style={{ padding:'8px 16px', background:'#fee2e2', color:'#b91c1c', fontSize:12, fontWeight:600, flexShrink:0 }}>
          ⚠️ {saveErr}
        </div>
      )}

      <div style={{ padding:'12px 16px', borderTop:'1px solid #E8E6DF', display:'flex', gap:8, flexShrink:0 }}>
        <button onClick={save} disabled={saving}
          style={{ flex:1, padding:'11px', borderRadius:9, fontWeight:700, fontSize:14, border:'none', cursor:saving?'not-allowed':'pointer', background: saveOk ? '#0F6E56' : saving ? '#E8E6DF' : '#1D9E75', color:'#fff', transition:'background 0.2s' }}>
          {saveOk ? '✓ Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={del}
          style={{ padding:'11px 16px', borderRadius:9, fontSize:13, fontWeight:600, background:'#fff', color:'#E24B4A', border:'1.5px solid #E24B4A', cursor:'pointer' }}>
          Supprimer
        </button>
      </div>
    </div>
  ) : null

  // ── RENDU FINAL ───────────────────────────────────────────────────────────
  // Mobile : vue liste OU vue détail (plein écran)
  if (isMobile) {
    return (
      <div style={{ height:'100dvh', overflow:'hidden', background:'#F8F7F4', fontFamily:'-apple-system,sans-serif' }}>
        {mobileView === 'list' || !selected ? (
          <div style={{ height:'100%' }}>{listPanel}</div>
        ) : (
          <div style={{ height:'100%' }}>{detailPanel}</div>
        )}
      </div>
    )
  }

  // Desktop : split panel
  return (
    <div style={{ display:'flex', height:'100dvh', overflow:'hidden', background:'#F8F7F4', fontFamily:'-apple-system,sans-serif' }}>
      <div style={{ width:selected?380:520, maxWidth:selected?380:680, flexShrink:0, borderRight:'1px solid #E8E6DF', height:'100%' }}>
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
