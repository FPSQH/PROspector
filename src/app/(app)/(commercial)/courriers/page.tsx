'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { generateLetterHTML, generateLetterText } from '@/lib/lettres/generator'
import type { DpeAdresseData } from '@/lib/lettres/generator'

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
  const mapRef    = useRef<HTMLDivElement>(null)
  const mapInst   = useRef<maplibregl.Map | null>(null)
  const markers   = useRef<maplibregl.Marker[]>([])

  const [dateDebut, setDateDebut] = useState(daysAgo(30))
  const [dateFin,   setDateFin]   = useState(today())
  const [adresses,  setAdresses]  = useState<DpeAdresseData[]>([])
  const [stats,     setStats]     = useState<any>(null)
  const [loading,   setLoading]   = useState(false)
  const [selected,  setSelected]  = useState<DpeAdresseData | null>(null)
  const [checked,   setChecked]   = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('date')
  const [filterVille, setFilterVille] = useState('')
  const [filterType,  setFilterType]  = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [letterHTML,  setLetterHTML]  = useState('')

  // ── Charger les DPE ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setChecked(new Set())
    setSelected(null)
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
      style: 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.png',
      center: [-3.0, 48.5],
      zoom: 10,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [])

  // ── Mettre à jour les marqueurs ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInst.current
    if (!map) return
    markers.current.forEach(m => m.remove())
    markers.current = []
    const filtered = getFiltered()
    if (!filtered.length) return
    const bounds = new maplibregl.LngLatBounds()
    for (const a of filtered) {
      if (!a.lat || !a.lon) continue
      const dpe = (a.dpe_etiquette ?? '?').toUpperCase()
      const color = DPE_COLORS[dpe] ?? '#999'
      // Pin SVG coloré par étiquette DPE
      const el = document.createElement('div')
      el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <text x="14" y="17" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="bold" fill="white" font-family="Arial">${dpe}</text>
      </svg>`
      el.style.cssText = 'cursor:pointer;width:28px;height:36px'
      el.addEventListener('click', () => { setSelected(a); setLetterHTML(generateLetterHTML(a)) })
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([a.lon, a.lat])
        .addTo(map)
      markers.current.push(marker)
      bounds.extend([a.lon, a.lat])
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
  }, [adresses, filterVille, filterType])

  // ── Lettre ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selected) setLetterHTML(generateLetterHTML(selected))
  }, [selected])

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
      const letters = toGen.map(a => ({ adresse: a.adresse_brute, html: generateLetterHTML(a) }))
      const r = await fetch('/api/courriers/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letters, date_debut: dateDebut, date_fin: dateFin }),
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

  const filtered = getFiltered()
  const villes = [...new Set(adresses.map(a => a.nom_commune).filter(Boolean))] as string[]
  const types   = [...new Set(adresses.map(a => a.type_bien).filter(Boolean))] as string[]

  // ── Rendu ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'100dvh', overflow:'hidden', background:'#f8f7f4' }}>

      {/* ── Panel gauche ───────────────────────────────────────────────── */}
      <div style={{ width:340, flexShrink:0, display:'flex', flexDirection:'column', borderRight:'1px solid #E8E6DF', background:'#fff', height:'100%', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'16px 16px 0', borderBottom:'1px solid #E8E6DF', paddingBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:'1.2rem' }}>✉️</span>
            <div>
              <div style={{ fontWeight:700, fontSize:'0.9375rem', color:'#1a1a18' }}>Courriers DPE</div>
              <div style={{ fontSize:'0.72rem', color:'#9b9b96' }}>{filtered.length} DPE sur {adresses.length} total</div>
            </div>
          </div>

          {/* Dates */}
          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'0.7rem', color:'#9b9b96', marginBottom:2 }}>Du</div>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #E8E6DF', borderRadius:6, fontSize:'0.8rem', boxSizing:'border-box' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'0.7rem', color:'#9b9b96', marginBottom:2 }}>Au</div>
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #E8E6DF', borderRadius:6, fontSize:'0.8rem', boxSizing:'border-box' }} />
            </div>
          </div>

          {/* Boutons rapides */}
          <div style={{ display:'flex', gap:4, marginBottom:10 }}>
            {[['2 sem', 14], ['1 mois', 30], ['2 mois', 60]].map(([label, days]) => (
              <button key={label as string} onClick={() => { setDateDebut(daysAgo(days as number)); setDateFin(today()) }}
                style={{ flex:1, padding:'5px 0', fontSize:'0.72rem', fontWeight:600, border:'1px solid #E8E6DF', borderRadius:6, background:'#F8F7F4', cursor:'pointer', color:'#5F5E5A' }}>
                {label}
              </button>
            ))}
            <button onClick={load} disabled={loading}
              style={{ flex:1, padding:'5px 0', fontSize:'0.72rem', fontWeight:600, border:'none', borderRadius:6, background:'#1D9E75', cursor:'pointer', color:'#fff' }}>
              {loading ? '...' : 'Chercher'}
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ background:'#F8F7F4', borderRadius:8, padding:'8px 10px', marginBottom:10 }}>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
                {DPE_ORDER.map(l => stats.byLettre[l] > 0 && (
                  <span key={l} style={{ background:DPE_COLORS[l], color:'#fff', borderRadius:4, padding:'2px 6px', fontSize:'0.7rem', fontWeight:700 }}>
                    {l}: {stats.byLettre[l]}
                  </span>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, fontSize:'0.7rem', color:'#5F5E5A', flexWrap:'wrap' }}>
                <span>🔍 {stats.nbAudit} audits</span>
                {stats.nbSansAudit > 0 && <span style={{ color:'#E24B4A' }}>⚠️ {stats.nbSansAudit} sans audit E/F/G</span>}
                {stats.nbHorsZone > 0 && <span>📍 {stats.nbHorsZone} hors zone</span>}
              </div>
            </div>
          )}

          {/* Filtres */}
          <div style={{ display:'flex', gap:4, marginBottom:6 }}>
            <select value={filterVille} onChange={e => setFilterVille(e.target.value)}
              style={{ flex:1, padding:'5px 6px', fontSize:'0.72rem', border:'1px solid #E8E6DF', borderRadius:6, background:'#fff' }}>
              <option value="">Toutes villes</option>
              {villes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ flex:1, padding:'5px 6px', fontSize:'0.72rem', border:'1px solid #E8E6DF', borderRadius:6, background:'#fff' }}>
              <option value="">Tous types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortField} onChange={e => setSortField(e.target.value as SortField)}
              style={{ flex:1, padding:'5px 6px', fontSize:'0.72rem', border:'1px solid #E8E6DF', borderRadius:6, background:'#fff' }}>
              <option value="date">↓ Date</option>
              <option value="ville">A-Z Ville</option>
              <option value="type">A-Z Type</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:4, paddingBottom:10 }}>
            <button onClick={toggleAll}
              style={{ flex:1, padding:'6px 0', fontSize:'0.72rem', fontWeight:600, border:'1px solid #E8E6DF', borderRadius:6, background:'#fff', cursor:'pointer', color:'#5F5E5A' }}>
              {checked.size === filtered.length && filtered.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <button onClick={() => generateDocx()} disabled={generating || filtered.length === 0}
              style={{ flex:1, padding:'6px 0', fontSize:'0.72rem', fontWeight:600, border:'none', borderRadius:6, background: generating ? '#B4B2A9' : '#1D9E75', cursor:'pointer', color:'#fff' }}>
              {generating ? 'Génération...' : checked.size > 0 ? `DOCX (${checked.size})` : `DOCX (tous)`}
            </button>
          </div>
        </div>

        {/* Liste DPE */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <div style={{ padding:20, textAlign:'center', color:'#9b9b96', fontSize:'0.85rem' }}>Chargement...</div>}
          {!loading && filtered.length === 0 && adresses.length === 0 && (
            <div style={{ padding:20, textAlign:'center', color:'#9b9b96', fontSize:'0.85rem' }}>
              Choisissez une période et cliquez sur Chercher
            </div>
          )}
          {!loading && filtered.length === 0 && adresses.length > 0 && (
            <div style={{ padding:20, textAlign:'center', color:'#9b9b96', fontSize:'0.85rem' }}>Aucun résultat avec ces filtres</div>
          )}
          {filtered.map(a => {
            const dpe = (a.dpe_etiquette ?? '?').toUpperCase()
            const isSelected = selected?.id === a.id
            const isChecked  = checked.has(a.id)
            return (
              <div key={a.id} style={{
                display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderBottom:'1px solid #F2F1EE', cursor:'pointer',
                background: isSelected ? '#F0FDF4' : 'transparent',
              }}>
                <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(a.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ marginTop:4, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }} onClick={() => setSelected(a)}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ background:DPE_COLORS[dpe]??'#999', color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:'0.7rem', fontWeight:700 }}>{dpe}</span>
                    <span style={{ fontSize:'0.7rem', color:'#9b9b96' }}>{a.type_bien ?? 'inconnu'}</span>
                    {(a as any).has_audit && <span style={{ fontSize:'0.65rem', background:'#E8F7F2', color:'#0F6E56', borderRadius:8, padding:'1px 5px' }}>Audit ✓</span>}
                    {(a as any).needs_audit && <span style={{ fontSize:'0.65rem', background:'#FEF2F2', color:'#B91C1C', borderRadius:8, padding:'1px 5px' }}>Sans audit</span>}
                    {(a as any).hors_zone && <span style={{ fontSize:'0.65rem', background:'#F3F4F6', color:'#6B7280', borderRadius:8, padding:'1px 5px' }}>Hors zone</span>}
                    {(a as any).zone_nom && <span style={{ fontSize:'0.65rem', background:'#EEF2FF', color:'#4338CA', borderRadius:8, padding:'1px 5px' }}>{(a as any).zone_nom}</span>}
                    {(a as any).deja_contacte && (
                      <span style={{ fontSize:'0.65rem', background:(a as any).deja_contacte.avant_dpe ? '#FEF9C3' : '#DCFCE7', color:(a as any).deja_contacte.avant_dpe ? '#92400E' : '#14532D', borderRadius:8, padding:'1px 5px' }}>
                        {(a as any).deja_contacte.avant_dpe ? '⚠️ Contacté avant DPE' : '✓ Contacté'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:'0.8rem', fontWeight:500, color:'#1a1a18', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.adresse_brute}
                  </div>
                  <div style={{ fontSize:'0.7rem', color:'#9b9b96', marginTop:2, display:'flex', gap:8 }}>
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
        <div ref={mapRef} style={{ flex:'0 0 40%', position:'relative' }}>
          {adresses.length === 0 && !loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', zIndex:1 }}>
              <span style={{ color:'#9b9b96', fontSize:'0.85rem' }}>Lancez une recherche pour afficher les DPE sur la carte</span>
            </div>
          )}
        </div>

        {/* Detail */}
        <div style={{ flex:1, overflowY:'auto', borderTop:'1px solid #E8E6DF' }}>
          {!selected ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'#9b9b96' }}>
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
                    <span style={{ fontSize:'0.85rem', color:'#5F5E5A' }}>{selected.adresse_brute}</span>
                  </div>
                  <div style={{ fontSize:'0.75rem', color:'#9b9b96' }}>
                    {(selected as any).nom_commune} · {selected.type_bien} · {selected.surface_habitable ? selected.surface_habitable + ' m²' : ''}
                    {(selected as any).hors_zone ? ' · Hors zone de prospection' : (selected as any).zone_nom ? ` · Zone: ${(selected as any).zone_nom}` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => generateDocx([selected.id])} disabled={generating}
                    style={{ padding:'7px 14px', borderRadius:7, border:'none', background:'#1D9E75', color:'#fff', fontSize:'0.8rem', fontWeight:600, cursor:'pointer' }}>
                    🖨️ DOCX
                  </button>
                </div>
              </div>

              {/* Info DPE */}
              {(selected.conso_ep_m2 || selected.cout_annuel) && (
                <div style={{ background:'#F8F7F4', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {selected.conso_ep_m2 && <div><span style={{ fontSize:'0.7rem', color:'#9b9b96' }}>Consommation</span><br/><strong style={{ fontSize:'0.85rem' }}>{selected.conso_ep_m2} kWhep/m²/an</strong></div>}
                  {selected.cout_annuel && <div><span style={{ fontSize:'0.7rem', color:'#9b9b96' }}>Coût annuel</span><br/><strong style={{ fontSize:'0.85rem' }}>{Math.round(selected.cout_annuel).toLocaleString('fr-FR')} €</strong></div>}
                  {selected.energie_principale && <div><span style={{ fontSize:'0.7rem', color:'#9b9b96' }}>Énergie</span><br/><strong style={{ fontSize:'0.85rem' }}>{selected.energie_principale}</strong></div>}
                  {selected.ges_m2 && <div><span style={{ fontSize:'0.7rem', color:'#9b9b96' }}>GES</span><br/><strong style={{ fontSize:'0.85rem' }}>{selected.ges_m2} kgeqCO₂/m²/an</strong></div>}
                </div>
              )}

              {/* Info audit */}
              {(selected as any).needs_audit && (
                <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:'0.8rem', color:'#B91C1C' }}>
                  ⚠️ Ce bien est classé {selected.dpe_etiquette?.toUpperCase()} mais <strong>aucun audit énergétique</strong> n&apos;a été réalisé ou enregistré.
                </div>
              )}
              {(selected as any).has_audit && (selected as any).audit && (
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#0F6E56', marginBottom:6 }}>Audit énergétique n° {(selected as any).audit.n_audit}</div>
                  {((selected as any).audit.scenarios ?? []).filter((s: any) => !/états*initial/i.test(s.categorie ?? '')).slice(0,3).map((sc: any, i: number) => (
                    <div key={i} style={{ fontSize:'0.75rem', color:'#1a1a18', marginBottom:4 }}>
                      → <strong>{(sc.categorie ?? '').replace(/principale?/gi,'').trim()}</strong> : atteindre DPE <strong>{sc.classe_apres ?? '?'}</strong>
                      {sc.cout_travaux ? ` pour ~${Number(sc.cout_travaux).toLocaleString('fr-FR')} €` : ''}
                      {sc.gain_pct ? ` — gain : ${sc.gain_pct}%` : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* Prévisualisation lettre */}
              <div style={{ borderTop:'1px solid #E8E6DF', paddingTop:20 }}>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#B4B2A9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:12 }}>Prévisualisation courrier</div>
                <div style={{ background:'#fff', borderRadius:8, padding:'32px 40px', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', fontFamily:'Georgia, serif' }}
                  dangerouslySetInnerHTML={{ __html: letterHTML }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
