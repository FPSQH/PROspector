'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { generateLetterHTML } from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'
import type { TemplateV2 } from '@/lib/lettres/templateEngine'
import { generatePreviewHTMLV2 } from '@/lib/lettres/previewV2'

// ── Design tokens ─────────────────────────────────────────────────────────────
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
}

// ── Couleurs DPE ──────────────────────────────────────────────────────────────
const DPE_COLORS: Record<string, string> = {
  A: '#319834', B: '#51A351', C: '#B0CC30', D: '#F0D30A',
  E: '#F0A500', F: '#E06029', G: '#CC1016',
}
const DPE_ORDER = ['A','B','C','D','E','F','G']

// ── Utils ─────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

type SortField = 'date' | 'ville' | 'type'

export default function CourriersPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'list'|'map'|'detail'>('list')
  const mapRef    = useRef<HTMLDivElement>(null)
  const mapInst   = useRef<maplibregl.Map | null>(null)
  const markers   = useRef<maplibregl.Marker[]>([])
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const searchParams = useSearchParams()
  const [dateDebut, setDateDebut] = useState(() => searchParams.get('date_debut') ?? daysAgo(90))
  const [dateFin,   setDateFin]   = useState(() => searchParams.get('date_fin')   ?? today())
  const [adresses,  setAdresses]  = useState<DpeAdresseData[]>([])
  const [stats,     setStats]     = useState<any>(null)
  const [loading,   setLoading]   = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [selected,  setSelected]  = useState<DpeAdresseData | null>(null)
  const [checked,   setChecked]   = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('date')
  const [filterVille, setFilterVille] = useState('')
  const [filterType,  setFilterType]  = useState('')
  const [generating,       setGenerating]       = useState(false)
  const [letterHTML,       setLetterHTML]       = useState('')
  const [templates,        setTemplates]        = useState<TemplateV2[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [templateDropdown, setTemplateDropdown] = useState(false)
  const [tourneeModal,  setTourneeModal]  = useState(false)
  const [tourneeName,   setTourneeName]   = useState('')
  const [tourneeDate,   setTourneeDate]   = useState(today())
  const [tourneeSaving, setTourneeSaving] = useState(false)
  const [tourneeTarget, setTourneeTarget] = useState<'selection'|'tous'|string>('tous')

  // Fermer le dropdown template au clic extérieur
  useEffect(() => {
    if (!templateDropdown) return
    const handler = () => setTemplateDropdown(false)
    window.addEventListener('click', handler, { capture: true })
    return () => window.removeEventListener('click', handler, { capture: true })
  }, [templateDropdown])

  // ── Autoload depuis dashboard (param ?autoload=1) ────────────────────────────
  useEffect(() => {
    if (searchParams.get('autoload') === '1') load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Charger les templates v2 ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/courriers/template')
      .then(r => r.json())
      .then(d => {
        const list: TemplateV2[] = d.templates ?? []
        setTemplates(list)
        const def = list.find(t => t.is_default) ?? list[0] ?? null
        if (def) setActiveTemplateId(def.id)
      })
      .catch(() => {})
  }, [])

  // ── Charger les DPE ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setChecked(new Set())
    setSelected(null)

    // ── 1. Sync ADEME pour la plage demandée ────────────────────────
    setSyncing(true)
    try {
      await fetch('/api/dpe/sync-secteur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_debut: dateDebut }),
      })
    } catch (_) {}
    setSyncing(false)

    // ── 2. Charger les résultats ────────────────────────────────────
    setLoading(true)
    try {
      const p = new URLSearchParams({ date_debut: dateDebut, date_fin: dateFin, limit: '500' })
      const r = await fetch('/api/courriers?' + p)
      if (!r.ok) { console.error('API error', r.status); return }
      const d = await r.json()
      setAdresses(d.adresses ?? [])
      setStats(d.stats ?? null)
    } finally { setLoading(false) }
  }, [dateDebut, dateFin])

  // ── Init carte ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8 as const,
        sources: {
          osm: {
            type: 'raster' as const,
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          }
        },
        layers: [{ id: 'osm-tiles', type: 'raster' as const, source: 'osm' }],
      },
      center: [-3.0, 48.5],
      zoom: 10,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapInst.current = map
    map.on('load', () => setMapReady(true))
    return () => { map.remove(); mapInst.current = null }
  }, [])

  // ── Mettre à jour les marqueurs ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInst.current
    if (!map || !map.loaded()) return
    markers.current.forEach(m => m.remove())
    markers.current = []
    const filtered = getFiltered()
    if (!filtered.length) return
    const bounds = new maplibregl.LngLatBounds()
    for (const a of filtered) {
      if (!a.lat || !a.lon) continue
      const dpe = (a.dpe_etiquette ?? '?').toUpperCase()
      const color = DPE_COLORS[dpe] ?? '#999'
      const el = document.createElement('div')
      el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <text x="14" y="17" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="bold" fill="white" font-family="Arial">${dpe}</text>
      </svg>`
      el.style.cssText = 'cursor:pointer;width:28px;height:36px'
      el.addEventListener('click', () => { setSelected(a) })
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([a.lon, a.lat])
        .addTo(map)
      markers.current.push(marker)
      bounds.extend([a.lon, a.lat])
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
  }, [adresses, filterVille, filterType, mapReady])

  // ── Lettre ────────────────────────────────────────────────────────────────────
  const renderLetter = useCallback((data: DpeAdresseData) => {
    const tpl = templates.find(t => t.id === activeTemplateId) ?? null
    return tpl ? generatePreviewHTMLV2(data, tpl) : generateLetterHTML(data, null)
  }, [templates, activeTemplateId])

  useEffect(() => {
    if (selected) setLetterHTML(renderLetter(selected))
  }, [selected, renderLetter])

  // ── Filtrage + tri ────────────────────────────────────────────────────────────
  const getFiltered = () => {
    let list = [...adresses]
    if (filterVille) list = list.filter(a => (a.nom_commune ?? '').toLowerCase().includes(filterVille.toLowerCase()))
    if (filterType)  list = list.filter(a => (a.type_bien ?? '') === filterType)
    list.sort((a, b) => {
      if (sortField === 'date') return (b.latest_dpe_date ?? '') < (a.latest_dpe_date ?? '') ? -1 : 1
      if (sortField === 'ville') return (a.nom_commune ?? '').localeCompare(b.nom_commune ?? '')
      return (a.type_bien ?? '').localeCompare(b.type_bien ?? '')
    })
    return list
  }

  // ── Sélection ─────────────────────────────────────────────────────────────────
  const toggleCheck = (id: string) => {
    setChecked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const toggleAll = () => {
    const filtered = getFiltered()
    setChecked(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(a => a.id)))
  }

  // ── Génération DOCX ───────────────────────────────────────────────────────────
  const generateDocx = async (ids?: string[]) => {
    const filtered = getFiltered()
    const toGen = ids ? filtered.filter(a => ids.includes(a.id)) : checked.size > 0 ? filtered.filter(a => checked.has(a.id)) : filtered
    if (!toGen.length) return
    setGenerating(true)
    try {
      const letters = toGen.map(a => ({ ...a }))
      const r = await fetch('/api/courriers/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letters, date_debut: dateDebut, date_fin: dateFin, template_id: activeTemplateId }),
      })
      if (!r.ok) throw new Error('Erreur génération DOCX')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `courriers-dpe-${dateDebut}-${dateFin}.docx`
      a.click(); URL.revokeObjectURL(url)
    } catch(e) { console.error(e) }
    finally { setGenerating(false) }
  }

  // ── Création tournée DPE ────────────────────────────────────────────────────
  const openTourneeModal = (target: 'selection'|'tous'|string) => {
    setTourneeTarget(target)
    setTourneeName('')
    setTourneeDate(today())
    setTourneeModal(true)
  }

  const createTournee = async () => {
    const filtered = getFiltered()
    // Stocke dpe_logement.id — sessions/[id] charge directement depuis dpe_logement
    let source: DpeAdresseData[]
    if (tourneeTarget === 'selection') source = filtered.filter(a => checked.has(a.id))
    else if (tourneeTarget === 'tous') source = filtered
    else source = adresses.filter(a => a.id === tourneeTarget)

    const ids: string[] = source.map(a => a.id)
    if (!ids.length) return
    setTourneeSaving(true)
    try {
      const r = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_session: 'dpe',
          statut:       'preparee',
          nom_tournee:  tourneeName.trim() || `Tournée DPE — ${new Date(tourneeDate).toLocaleDateString('fr-FR')}`,
          date_session: tourneeDate,
          adresse_ids:  ids,
        }),
      })
      if (!r.ok) throw new Error('Erreur création tournée')
      setTourneeModal(false)
      // Feedback utilisateur
      const nb = ids.length
      alert(`✅ Tournée créée avec ${nb} adresse${nb > 1 ? 's' : ''}.\nRetrouvez-la dans la page Terrain pour la démarrer.`)
    } catch(e) { console.error(e); alert('Erreur lors de la création de la tournée.') }
    finally { setTourneeSaving(false) }
  }

  const filtered = getFiltered()
  const villes = [...new Set(adresses.map(a => a.nom_commune).filter(Boolean))] as string[]
  const types   = [...new Set(adresses.map(a => a.type_bien).filter(Boolean))] as string[]

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '5px 8px',
    border: `1px solid ${C.borderl}`, borderRadius: 6,
    fontSize: '0.8rem', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', color: C.text, outline: 'none',
  }
  const selectStyle: React.CSSProperties = {
    flex: 1, padding: '5px 6px', fontSize: '0.72rem',
    border: `1px solid ${C.borderl}`, borderRadius: 6,
    background: 'rgba(255,255,255,0.05)', color: C.text, outline: 'none',
  }

  // ── Barre de navigation mobile ────────────────────────────────────────────────
  const mobileNavBar = isMobile ? (
    <div style={{ display:'flex', background: C.card, borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
      {[
        { key:'list',   label:'📋 Liste' },
        { key:'map',    label:'🗺 Carte' },
        { key:'detail', label:'📄 Détail', disabled: !selected },
      ].map(tab => (
        <button key={tab.key} onClick={() => { if(!(tab as any).disabled) setMobileView(tab.key as any) }}
          disabled={(tab as any).disabled}
          style={{
            flex:1, padding:'10px 4px', border:'none', background:'transparent',
            fontSize:12, fontWeight:600, cursor:(tab as any).disabled?'not-allowed':'pointer',
            color: mobileView===tab.key ? C.primary : (tab as any).disabled ? C.dim : C.muted,
            borderTop: mobileView===tab.key ? `2px solid ${C.primary}` : '2px solid transparent',
          }}>
          {tab.label}
        </button>
      ))}
    </div>
  ) : null

  return (
    <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', height:'100dvh', overflow:'hidden', background: C.bg }}>

      {/* ── Panel gauche ───────────────────────────────────────────────── */}
      <div style={{
        width: isMobile ? '100%' : 340, flexShrink:0,
        display: isMobile && mobileView !== 'list' ? 'none' : 'flex',
        flexDirection:'column',
        borderRight:`1px solid ${C.border}`,
        background: C.card,
        height: isMobile ? 'calc(100dvh - 44px)' : '100%',
        overflow:'hidden',
      }}>

        {/* Header */}
        <div style={{ padding:'16px 16px 12px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:'1.2rem' }}>✉️</span>
              <div>
                <div style={{ fontWeight:700, fontSize:'0.9375rem', color: C.text }}>Courriers DPE</div>
                <div style={{ fontSize:'0.72rem', color: C.muted }}>{filtered.length} DPE sur {adresses.length} total</div>
              </div>
            </div>
            {/* Sélecteur de template */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setTemplateDropdown(v => !v)}
                style={{ fontSize:'0.72rem', color: activeTemplateId ? C.primary : C.muted, padding:'4px 8px', borderRadius:6, border:`1px solid ${activeTemplateId ? 'rgba(29,158,117,0.3)' : C.border}`, background: activeTemplateId ? 'rgba(29,158,117,0.08)' : 'transparent', cursor:'pointer' }}>
                {activeTemplateId ? `✓ ${templates.find(t=>t.id===activeTemplateId)?.name ?? 'Template'}` : '⚙ Templates'}
              </button>
              {templateDropdown && (
                <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:50, background:C.card, border:`1px solid ${C.borderl}`, borderRadius:8, minWidth:180, boxShadow:'0 8px 24px rgba(0,0,0,0.5)', padding:'6px' }}>
                  {templates.length === 0 && (
                    <div style={{ fontSize:12, color:C.muted, padding:'6px 8px' }}>Aucun template</div>
                  )}
                  {templates.map(t => (
                    <button key={t.id} onClick={() => { setActiveTemplateId(t.id); setTemplateDropdown(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:6, border:'none', background: activeTemplateId===t.id ? 'rgba(29,158,117,0.1)' : 'transparent', color: activeTemplateId===t.id ? C.primary : C.text, fontSize:12, fontWeight: activeTemplateId===t.id ? 600 : 400, cursor:'pointer', textAlign:'left' }}>
                      <span style={{ flex:1 }}>{t.name}</span>
                      {t.is_default && <span style={{ fontSize:9, color:C.primary }}>défaut</span>}
                    </button>
                  ))}
                  <div style={{ borderTop:`1px solid ${C.border}`, marginTop:4, paddingTop:4 }}>
                    <Link href="/courriers/templates" style={{ display:'block', padding:'7px 10px', borderRadius:6, fontSize:12, color:C.muted, textDecoration:'none' }}
                      onClick={() => setTemplateDropdown(false)}>
                      ⚙ Gérer les templates →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'0.7rem', color: C.muted, marginBottom:2 }}>Du</div>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'0.7rem', color: C.muted, marginBottom:2 }}>Au</div>
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Boutons rapides */}
          <div style={{ display:'flex', gap:4, marginBottom:10 }}>
            {[['1 mois', 30], ['3 mois', 90], ['6 mois', 180]].map(([label, days]) => (
              <button key={label as string} onClick={() => { setDateDebut(daysAgo(days as number)); setDateFin(today()) }}
                style={{ flex:1, padding:'5px 0', fontSize:'0.72rem', fontWeight:600, border:`1px solid ${C.borderl}`, borderRadius:6, background:'rgba(255,255,255,0.06)', cursor:'pointer', color: C.mid }}>
                {label}
              </button>
            ))}
            <button onClick={load} disabled={loading || syncing}
              style={{ flex:1, padding:'5px 0', fontSize:'0.72rem', fontWeight:600, border:'none', borderRadius:6, background: (loading || syncing) ? C.dim : C.primary, cursor: (loading || syncing) ? 'not-allowed' : 'pointer', color:'#fff' }}>
              {syncing ? '↻ Sync ADEME...' : loading ? '...' : 'Chercher'}
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px', marginBottom:10, border:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
                {DPE_ORDER.map(l => stats.byLettre[l] > 0 && (
                  <span key={l} style={{ background:DPE_COLORS[l], color:'#fff', borderRadius:4, padding:'2px 6px', fontSize:'0.7rem', fontWeight:700 }}>
                    {l}: {stats.byLettre[l]}
                  </span>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, fontSize:'0.7rem', color: C.muted, flexWrap:'wrap' }}>
                <span>🔍 {stats.nbAudit} audits</span>
                {stats.nbSansAudit > 0 && <span style={{ color:'#FCA5A5' }}>⚠️ {stats.nbSansAudit} sans audit E/F/G</span>}
                {stats.nbHorsZone > 0 && <span>📍 {stats.nbHorsZone} hors zone</span>}
              </div>
            </div>
          )}

          {/* Filtres */}
          <div style={{ display:'flex', gap:4, marginBottom:6 }}>
            <select value={filterVille} onChange={e => setFilterVille(e.target.value)} style={selectStyle}>
              <option value="">Toutes villes</option>
              {villes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
              <option value="">Tous types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortField} onChange={e => setSortField(e.target.value as SortField)} style={selectStyle}>
              <option value="date">↓ Date</option>
              <option value="ville">A-Z Ville</option>
              <option value="type">A-Z Type</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:4, paddingBottom:2 }}>
            <button onClick={toggleAll}
              style={{ flex:1, padding:'6px 0', fontSize:'0.72rem', fontWeight:600, border:`1px solid ${C.borderl}`, borderRadius:6, background:'rgba(255,255,255,0.06)', cursor:'pointer', color: C.mid }}>
              {checked.size === filtered.length && filtered.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <button onClick={() => generateDocx()} disabled={generating || filtered.length === 0}
              style={{ flex:1, padding:'6px 0', fontSize:'0.72rem', fontWeight:600, border:'none', borderRadius:6, background: generating ? C.dim : C.primary, cursor: generating || filtered.length === 0 ? 'not-allowed' : 'pointer', color:'#fff' }}>
              {generating ? 'Génération...' : checked.size > 0 ? `DOCX (${checked.size})` : `DOCX (tous)`}
            </button>
          </div>
          <button
            onClick={() => openTourneeModal(checked.size > 0 ? 'selection' : 'tous')}
            disabled={filtered.length === 0}
            style={{ width:'100%', padding:'6px 0', fontSize:'0.72rem', fontWeight:600, border:`1px solid rgba(251,191,36,0.3)`, borderRadius:6, background:'rgba(251,191,36,0.08)', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', color:'#FBBF24' }}>
            🚶 Préparer une tournée{checked.size > 0 ? ` (${checked.size})` : ` (${filtered.length})`}
          </button>
        </div>

        {/* Liste DPE */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <div style={{ padding:20, textAlign:'center', color: C.muted, fontSize:'0.85rem' }}>Chargement...</div>}
          {!loading && filtered.length === 0 && adresses.length === 0 && (
            <div style={{ padding:20, textAlign:'center', color: C.muted, fontSize:'0.85rem' }}>
              <div>Aucun DPE sur cette période.</div>
              <div style={{ marginTop:8, fontSize:'0.75rem' }}>Essayez d&apos;élargir la période ou cliquez sur <strong style={{ color: C.mid }}>6 mois</strong>.</div>
            </div>
          )}
          {!loading && filtered.length === 0 && adresses.length > 0 && (
            <div style={{ padding:20, textAlign:'center', color: C.muted, fontSize:'0.85rem' }}>Aucun résultat avec ces filtres</div>
          )}
          {filtered.map(a => {
            const dpe = (a.dpe_etiquette ?? '?').toUpperCase()
            const isSelected = selected?.id === a.id
            const isChecked  = checked.has(a.id)
            return (
              <div key={a.id} style={{
                display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderBottom:`1px solid ${C.border}`, cursor:'pointer',
                background: isSelected ? 'rgba(29,158,117,0.10)' : 'transparent',
              }}>
                <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(a.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ marginTop:4, flexShrink:0, accentColor: C.primary }} />
                <div style={{ flex:1, minWidth:0 }} onClick={() => {
                  setSelected(a); if(isMobile) setMobileView('detail')
                  const map = mapInst.current
                  if (map && a.lat && a.lon) map.flyTo({ center: [a.lon, a.lat], zoom: 16, duration: 600 })
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ background:DPE_COLORS[dpe]??'#999', color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:'0.7rem', fontWeight:700 }}>{dpe}</span>
                    <span style={{ fontSize:'0.7rem', color: C.muted }}>{a.type_bien ?? 'inconnu'}</span>
                    {(a as any).has_audit && (
                      <span style={{ fontSize:'0.65rem', background:'rgba(34,197,94,0.1)', color:'#4ADE80', borderRadius:8, padding:'1px 5px' }}>Audit ✓</span>
                    )}
                    {(a as any).needs_audit && (
                      <span style={{ fontSize:'0.65rem', background:'rgba(239,68,68,0.1)', color:'#FCA5A5', borderRadius:8, padding:'1px 5px' }}>Sans audit</span>
                    )}
                    {(a as any).hors_zone && (
                      <span style={{ fontSize:'0.65rem', background:'rgba(255,255,255,0.06)', color: C.muted, borderRadius:8, padding:'1px 5px' }}>Hors zone</span>
                    )}
                    {(a as any).zone_nom && (
                      <span style={{ fontSize:'0.65rem', background:'rgba(59,130,246,0.12)', color:'#93C5FD', borderRadius:8, padding:'1px 5px' }}>{(a as any).zone_nom}</span>
                    )}
                    {(a as any).deja_contacte && (
                      <span style={{ fontSize:'0.65rem', background:(a as any).deja_contacte.avant_dpe ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)', color:(a as any).deja_contacte.avant_dpe ? '#FBBF24' : '#4ADE80', borderRadius:8, padding:'1px 5px' }}>
                        {(a as any).deja_contacte.avant_dpe ? '⚠️ Contacté avant DPE' : '✓ Contacté'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:'0.8rem', fontWeight:500, color: C.text, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.adresse_brute}
                  </div>
                  <div style={{ fontSize:'0.7rem', color: C.muted, marginTop:2, display:'flex', gap:8 }}>
                    <span>{a.code_postal} {(a as any).nom_commune}</span>
                    {a.latest_dpe_date && <span>{new Date(a.latest_dpe_date).toLocaleDateString('fr-FR')}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Partie droite (carte + detail) ───────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Carte */}
        <div ref={mapRef} style={{ flex: isMobile ? '1' : '0 0 40%', position:'relative', display: isMobile && mobileView !== 'map' ? 'none' : undefined }}>
          {adresses.length === 0 && !loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(12,12,14,0.85)', zIndex:1 }}>
              <span style={{ color: C.muted, fontSize:'0.85rem' }}>Lancez une recherche pour afficher les DPE sur la carte</span>
            </div>
          )}
        </div>

        {/* Detail */}
        <div style={{ flex:1, overflowY:'auto', borderTop:`1px solid ${C.border}`, background: C.bg, display: isMobile && mobileView !== 'detail' ? 'none' : undefined }}>
          {!selected ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color: C.muted }}>
              <span style={{ fontSize:'2rem' }}>👆</span>
              <span style={{ fontSize:'0.85rem' }}>Cliquez sur un DPE pour voir le détail et la lettre</span>
            </div>
          ) : (
            <div style={{ maxWidth:720, margin:'0 auto', padding:'24px 32px' }}>
              {/* Toolbar detail */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ background:DPE_COLORS[selected.dpe_etiquette?.toUpperCase()??'?']??'#999', color:'#fff', borderRadius:4, padding:'2px 8px', fontWeight:700, fontSize:'0.85rem' }}>
                      DPE {selected.dpe_etiquette?.toUpperCase()}
                    </span>
                    <span style={{ fontSize:'0.85rem', color: C.mid }}>{selected.adresse_brute}</span>
                  </div>
                  <div style={{ fontSize:'0.75rem', color: C.muted }}>
                    {(selected as any).nom_commune} · {selected.type_bien} · {selected.surface_habitable ? selected.surface_habitable + ' m²' : ''}
                    {(selected as any).hors_zone ? ' · Hors zone de prospection' : (selected as any).zone_nom ? ` · Zone: ${(selected as any).zone_nom}` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => generateDocx([selected.id])} disabled={generating}
                    style={{ padding:'7px 14px', borderRadius:7, border:'none', background: generating ? C.dim : C.primary, color:'#fff', fontSize:'0.8rem', fontWeight:600, cursor: generating ? 'not-allowed' : 'pointer' }}>
                    🖨️ DOCX
                  </button>
                  <button onClick={() => openTourneeModal(selected.id)}
                    style={{ padding:'7px 14px', borderRadius:7, border:`1px solid rgba(251,191,36,0.35)`, background:'rgba(251,191,36,0.08)', color:'#FBBF24', fontSize:'0.8rem', fontWeight:600, cursor:'pointer' }}>
                    🚶 Tournée
                  </button>
                </div>
              </div>

              {/* Info DPE */}
              {(selected.conso_ep_m2 || selected.cout_annuel) && (
                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, border:`1px solid ${C.border}` }}>
                  {selected.conso_ep_m2 && <div><span style={{ fontSize:'0.7rem', color: C.muted }}>Consommation</span><br/><strong style={{ fontSize:'0.85rem', color: C.text }}>{selected.conso_ep_m2} kWhep/m²/an</strong></div>}
                  {selected.cout_annuel && <div><span style={{ fontSize:'0.7rem', color: C.muted }}>Coût annuel</span><br/><strong style={{ fontSize:'0.85rem', color: C.text }}>{Math.round(selected.cout_annuel).toLocaleString('fr-FR')} €</strong></div>}
                  {selected.energie_principale && <div><span style={{ fontSize:'0.7rem', color: C.muted }}>Énergie</span><br/><strong style={{ fontSize:'0.85rem', color: C.text }}>{selected.energie_principale}</strong></div>}
                  {selected.ges_m2 && <div><span style={{ fontSize:'0.7rem', color: C.muted }}>GES</span><br/><strong style={{ fontSize:'0.85rem', color: C.text }}>{selected.ges_m2} kgeqCO₂/m²/an</strong></div>}
                </div>
              )}

              {/* Info audit manquant */}
              {(selected as any).needs_audit && (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:'0.8rem', color:'#FCA5A5' }}>
                  ⚠️ Ce bien est classé {selected.dpe_etiquette?.toUpperCase()} mais <strong>aucun audit énergétique</strong> n&apos;a été réalisé ou enregistré.
                </div>
              )}
              {(selected as any).has_audit && (selected as any).audit && (
                <div style={{ background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#4ADE80', marginBottom:6 }}>Audit énergétique n° {(selected as any).audit.n_audit}</div>
                  {((selected as any).audit.scenarios ?? []).filter((s: any) => !/états*initial/i.test(s.categorie ?? '')).slice(0,3).map((sc: any, i: number) => (
                    <div key={i} style={{ fontSize:'0.75rem', color: C.mid, marginBottom:4 }}>
                      → <strong style={{ color: C.text }}>{(sc.categorie ?? '').replace(/principale?/gi,'').trim()}</strong> : atteindre DPE <strong style={{ color: C.text }}>{sc.classe_apres ?? '?'}</strong>
                      {sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} €` : ''}
                      {sc.gain_pct ? ` — gain : ${sc.gain_pct}%` : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* Prévisualisation lettre (fond blanc intentionnel — rendu print) */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20 }}>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color: C.dim, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:12 }}>Prévisualisation courrier</div>
                <div style={{ background:'#fff', borderRadius:8, padding:'32px 40px', boxShadow:'0 2px 12px rgba(0,0,0,0.3)', fontFamily:'Georgia, serif' }}
                  dangerouslySetInnerHTML={{ __html: letterHTML }} />
              </div>
            </div>
          )}
        </div>
      </div>
      {mobileNavBar}

      {/* ── Modal Tournée DPE ──────────────────────────────────────────── */}
      {tourneeModal && (() => {
        const sourceItems: DpeAdresseData[] =
          tourneeTarget === 'selection' ? filtered.filter(a => checked.has(a.id))
          : tourneeTarget === 'tous'    ? filtered
          : adresses.filter(a => a.id === tourneeTarget)
        const targetIds: string[] = sourceItems.map(a => a.id)
        const nbAdresses = targetIds.length
        const nbTotal    = sourceItems.length
        const isTooMany  = nbAdresses > 50
        return (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)' }}
            onClick={e => { if (e.target === e.currentTarget) setTourneeModal(false) }}>
            <div style={{ background: C.card, borderRadius:16, padding:'28px', width:'100%', maxWidth:440, border:`1px solid ${C.borderl}`, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem', color: C.text }}>🚶 Préparer une tournée DPE</div>
                  <div style={{ fontSize:'0.75rem', color: C.muted, marginTop:3 }}>
                    {nbAdresses} adresse{nbAdresses > 1 ? 's' : ''} appariée{nbAdresses > 1 ? 's' : ''}
                    {nbTotal !== nbAdresses && <span> / {nbTotal} DPE</span>}
                  </div>
                </div>
                <button onClick={() => setTourneeModal(false)} style={{ background:'none', border:'none', fontSize:22, color: C.muted, cursor:'pointer' }}>✕</button>
              </div>

              {/* Avertissement > 50 */}
              {isTooMany && (
                <div style={{ background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:'0.8rem', color:'#FBBF24' }}>
                  ⚠️ Vous avez sélectionné {nbAdresses} adresses. Pour une tournée efficace, nous recommandons moins de 50 adresses. Vous pouvez filtrer la liste ou n&apos;utiliser que les cochées.
                </div>
              )}

              {/* Nom */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color: C.muted, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>Nom de la tournée</div>
                <input
                  type="text"
                  value={tourneeName}
                  onChange={e => setTourneeName(e.target.value)}
                  placeholder={`Tournée DPE — ${new Date(tourneeDate).toLocaleDateString('fr-FR')}`}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.06)', color: C.text, fontSize:'0.875rem', boxSizing:'border-box', outline:'none' }}
                />
              </div>

              {/* Date */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color: C.muted, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>Date prévue</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input
                    type="date"
                    value={tourneeDate}
                    onChange={e => setTourneeDate(e.target.value)}
                    min={today()}
                    style={{ flex:1, padding:'9px 12px', borderRadius:8, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.06)', color: C.text, fontSize:'0.875rem', outline:'none' }}
                  />
                  <button onClick={() => setTourneeDate(today())}
                    style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${C.borderl}`, background: tourneeDate === today() ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.06)', color: tourneeDate === today() ? C.primary : C.mid, fontSize:'0.78rem', fontWeight:600, cursor:'pointer' }}>
                    Aujourd&apos;hui
                  </button>
                </div>
              </div>

              {/* Récap */}
              <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:'0.8rem', color: C.mid, border:`1px solid ${C.border}` }}>
                📍 <strong style={{ color: C.text }}>{nbAdresses}</strong> adresse{nbAdresses > 1 ? 's' : ''} DPE &nbsp;·&nbsp;
                📅 <strong style={{ color: C.text }}>{new Date(tourneeDate + 'T12:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</strong>
              </div>

              {/* Boutons */}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setTourneeModal(false)}
                  style={{ flex:1, padding:'11px', borderRadius:10, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.06)', color: C.mid, fontWeight:600, fontSize:'0.875rem', cursor:'pointer' }}>
                  Annuler
                </button>
                <button onClick={createTournee} disabled={tourneeSaving}
                  style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background: tourneeSaving ? C.dim : '#FBBF24', color:'#0C0C0E', fontWeight:700, fontSize:'0.875rem', cursor: tourneeSaving ? 'not-allowed' : 'pointer' }}>
                  {tourneeSaving ? 'Création...' : `Créer la tournée (${nbAdresses})`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
