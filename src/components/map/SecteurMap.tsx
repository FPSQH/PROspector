'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  communesInsee: string[]
  height?: number | string
}

type ColorMode = 'type_bien' | 'dpe_classe' | 'statut' | 'score'

interface EnrichedAddr {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string
  type_bien?: string
  classe_bilan_dpe?: string | null
  statut_prospection?: string
}

const TYPE_COLORS: Record<string, string> = {
  maison:          '#22c55e',
  appartement:     '#3b82f6',
  commerce:        '#f59e0b',
  logement_social: '#6b7280',
  inconnu:         '#d1d5db',
}

function dpeColor(classe?: string | null): string {
  switch (classe?.toUpperCase()) {
    case 'A': return '#16a34a'; case 'B': return '#4ade80'
    case 'C': return '#84cc16'; case 'D': return '#facc15'
    case 'E': return '#f97316'; case 'F': return '#ef4444'
    case 'G': return '#b91c1c'; default:  return '#cbd5e1'
  }
}

function statutColor(statut?: string): string {
  switch (statut) {
    case 'mandat_signe': return '#10b981'
    case 'estimation':   return '#8b5cf6'
    case 'rdv_pris':     return '#f59e0b'
    case 'contact':      return '#34d399'
    case 'visite':       return '#60a5fa'
    default:             return '#94a3b8'
  }
}

function computeScore(a: EnrichedAddr): number {
  let s = 0
  if (a.type_bien && a.type_bien !== 'inconnu') s += 2
  switch (a.classe_bilan_dpe?.toUpperCase()) {
    case 'F': case 'G': s += 4; break
    case 'D': case 'E': s += 2; break
    case 'B': case 'C': s += 1; break
  }
  switch (a.statut_prospection) {
    case 'contact':    s += 3; break
    case 'jamais_vue': s += 2; break
    case 'visite':     s += 1; break
    case 'rdv_pris':   s += 1; break
  }
  return Math.min(s, 9)
}

function scoreColor(score: number): string {
  if (score >= 7) return '#ef4444'
  if (score >= 5) return '#f97316'
  if (score >= 3) return '#facc15'
  return '#94a3b8'
}

function adresseColor(a: EnrichedAddr, mode: ColorMode): string {
  switch (mode) {
    case 'type_bien': return TYPE_COLORS[a.type_bien ?? 'inconnu'] ?? TYPE_COLORS.inconnu
    case 'dpe_classe': return dpeColor(a.classe_bilan_dpe)
    case 'statut':     return statutColor(a.statut_prospection)
    case 'score':      return scoreColor(computeScore(a))
  }
}

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
  return result
}

const DPE_CLASSES  = ['A','B','C','D','E','F','G']
const TYPE_OPTIONS = ['maison','appartement','commerce','logement_social','inconnu']
const STATUT_OPTIONS = [
  { key: 'jamais_vue',   label: 'Jamais visité', color: '#94a3b8' },
  { key: 'visite',       label: 'Visité',         color: '#60a5fa' },
  { key: 'contact',      label: 'Contact',        color: '#34d399' },
  { key: 'rdv_pris',     label: 'RDV pris',       color: '#f59e0b' },
  { key: 'estimation',   label: 'Estimation',     color: '#8b5cf6' },
  { key: 'mandat_signe', label: 'Mandat signé',   color: '#10b981' },
]
const COLOR_MODES: { key: ColorMode; label: string; icon: string }[] = [
  { key: 'type_bien',  label: 'Type',   icon: '🏠' },
  { key: 'dpe_classe', label: 'DPE',    icon: '⚡' },
  { key: 'statut',     label: 'Statut', icon: '📍' },
  { key: 'score',      label: 'Score',  icon: '🎯' },
]

export function SecteurMap({ communesInsee, height = 500 }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<any>(null)
  const [mapLoaded,    setMapLoaded]    = useState(false)
  const [rawAdresses,  setRawAdresses]  = useState<EnrichedAddr[]>([])
  const [loading,      setLoading]      = useState(false)
  const loadedCodesRef = useRef<string>('')

  const [colorMode,    setColorMode]    = useState<ColorMode>('type_bien')
  const [showFilters,  setShowFilters]  = useState(false)
  const [filterTypes,  setFilterTypes]  = useState<string[]>([])
  const [filterDpe,    setFilterDpe]    = useState<string[]>([])
  const [filterStatut, setFilterStatut] = useState<string[]>([])

  const toggleFilter = (list: string[], val: string, setter: (v: string[]) => void) =>
    setter(list.includes(val) ? list.filter(x => x !== val) : [...list, val])

  const activeFilterCount = filterTypes.length + filterDpe.length + filterStatut.length

  // ── Filtrage + coloration ─────────────────────────────────────────────────
  const filteredFeatures = useMemo(() => {
    return rawAdresses
      .filter(a => {
        if (filterTypes.length  && !filterTypes.includes(a.type_bien ?? 'inconnu'))               return false
        if (filterDpe.length    && !filterDpe.includes(a.classe_bilan_dpe?.toUpperCase() ?? 'N/A')) return false
        if (filterStatut.length && !filterStatut.includes(a.statut_prospection ?? 'jamais_vue'))   return false
        return true
      })
      .map(a => ({
        type: 'Feature' as const,
        properties: {
          id:        a.id,
          type_bien: a.type_bien ?? 'inconnu',
          label:     `${a.numero ?? ''} ${a.nom_voie ?? ''}`.trim(),
          couleur:   adresseColor(a, colorMode),
        },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      }))
  }, [rawAdresses, colorMode, filterTypes, filterDpe, filterStatut])

  // ── Initialisation carte ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: any

    const init = async () => {
      const ml = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')
      ;(window as any).maplibregl = ml

      map = new ml.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256, attribution: '© OpenStreetMap', maxzoom: 19,
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [2.5, 46.8], zoom: 5,
        attributionControl: false,
      })
      map.addControl(new ml.NavigationControl(), 'top-right')

      map.on('load', () => {
        map.addSource('adresses', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true, clusterRadius: 40, clusterMaxZoom: 14,
        })

        map.addLayer({
          id: 'clusters', type: 'circle', source: 'adresses',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#1D9E75',
            'circle-radius': ['step', ['get', 'point_count'], 18, 50, 24, 200, 30],
            'circle-opacity': 0.85,
          },
        })
        map.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'adresses',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
          paint: { 'text-color': '#fff' },
        })
        map.addLayer({
          id: 'adresses-points', type: 'circle', source: 'adresses',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'couleur'],
            'circle-radius': 5,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        })

        map.on('click', 'adresses-points', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          const [lon, lat] = (f.geometry as any).coordinates
          new (window as any).maplibregl.Popup({ offset: 10 })
            .setLngLat([lon, lat])
            .setHTML(`<div style="font-size:0.8rem;padding:4px 6px">${f.properties.label || f.properties.type_bien}</div>`)
            .addTo(map)
        })
        map.on('click', 'clusters', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          ;(map.getSource('adresses') as any).getClusterExpansionZoom(
            f.properties.cluster_id,
            (_: any, zoom: number) => map.easeTo({ center: (f.geometry as any).coordinates, zoom })
          )
        })

        mapRef.current = map
        setMapLoaded(true)
      })
    }

    init()
    return () => { if (map) map.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Chargement adresses enrichies ─────────────────────────────────────────
  const loadAdresses = useCallback(async (codesInsee: string[]) => {
    if (!codesInsee.length) return
    setLoading(true)
    try {
      const supabase = createClient()
      const allAdresses: any[] = []

      for (const batchInsee of chunk(codesInsee, 5)) {
        let from = 0
        while (true) {
          const { data, error } = await supabase
            .from('adresses')
            .select('id, lat, lon, type_bien, numero, nom_voie, batiment_groupe_id')
            .in('code_insee', batchInsee)
            .not('lat', 'is', null)
            .not('lon', 'is', null)
            .range(from, from + 999)
          const rows = data as any[] | null
          if (error || !rows || rows.length === 0) break
          allAdresses.push(...rows)
          if (rows.length < 1000) break
          from += 1000
        }
      }

      if (!allAdresses.length) { setLoading(false); return }

      // Classe DPE depuis BDNB
      const batimentIds = Array.from(new Set<string>(
        allAdresses.filter(a => a.batiment_groupe_id).map(a => a.batiment_groupe_id as string)
      ))
      const bdnbMap = new Map<string, string>()
      if (batimentIds.length) {
        for (const batch of chunk(batimentIds, 500)) {
          const { data } = await supabase
            .from('bdnb_batiment_groupe')
            .select('batiment_groupe_id, classe_bilan_dpe')
            .in('batiment_groupe_id', batch)
            .not('classe_bilan_dpe', 'is', null)
          for (const b of (data ?? []) as any[]) {
            if (b.classe_bilan_dpe) bdnbMap.set(b.batiment_groupe_id, b.classe_bilan_dpe)
          }
        }
      }

      // Statut de prospection (dernière interaction)
      const adresseIds = allAdresses.map(a => a.id)
      const statutMap = new Map<string, string>()
      for (const batch of chunk(adresseIds, 500)) {
        const { data } = await supabase
          .from('interactions')
          .select('adresse_id, statut_adresse, created_at')
          .in('adresse_id', batch)
          .order('created_at', { ascending: false })
        for (const row of (data ?? []) as any[]) {
          if (!statutMap.has(row.adresse_id) && row.statut_adresse) {
            statutMap.set(row.adresse_id, row.statut_adresse)
          }
        }
      }

      const enriched: EnrichedAddr[] = allAdresses.map(a => ({
        id:              a.id,
        lat:             a.lat,
        lon:             a.lon,
        numero:          a.numero,
        nom_voie:        a.nom_voie,
        type_bien:       a.type_bien ?? 'inconnu',
        classe_bilan_dpe: a.batiment_groupe_id ? (bdnbMap.get(a.batiment_groupe_id) ?? null) : null,
        statut_prospection: statutMap.get(a.id) ?? 'jamais_vue',
      }))

      setRawAdresses(enriched)

      // Centrage carte
      const map = mapRef.current
      if (map) {
        const lons = enriched.map(a => a.lon)
        const lats = enriched.map(a => a.lat)
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 40, duration: 500 }
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Mise à jour source carte ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    try {
      ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features: filteredFeatures })
    } catch (e) {}
  }, [filteredFeatures, mapLoaded])

  // ── Rechargement quand communes changent ──────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || communesInsee.length === 0) return
    const codesSorted = [...communesInsee].sort().join(',')
    if (codesSorted === loadedCodesRef.current) return
    loadedCodesRef.current = codesSorted
    loadAdresses(communesInsee)
  }, [mapLoaded, communesInsee, loadAdresses])

  // ── Légende ───────────────────────────────────────────────────────────────
  const renderLegend = () => {
    switch (colorMode) {
      case 'type_bien':
        return Object.entries({
          maison: 'Maison', appartement: 'Appartement',
          commerce: 'Commerce', logement_social: 'Log. social',
        }).map(([k, label]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[k] }}/>
            <span>{label}</span>
          </div>
        ))
      case 'dpe_classe':
        return [...DPE_CLASSES, null].map(c => (
          <div key={c ?? 'na'} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dpeColor(c) }}/>
            <span>{c ?? 'N/A'}</span>
          </div>
        ))
      case 'statut':
        return STATUT_OPTIONS.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }}/>
            <span>{s.label}</span>
          </div>
        ))
      case 'score':
        return [
          { label: 'Très haute (7-9)', color: '#ef4444' },
          { label: 'Haute (5-6)',       color: '#f97316' },
          { label: 'Moyenne (3-4)',     color: '#facc15' },
          { label: 'Faible (0-2)',      color: '#94a3b8' },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }}/>
            <span>{r.label}</span>
          </div>
        ))
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Sélecteur mode couleur (haut gauche) */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {COLOR_MODES.map(m => (
            <button key={m.key} onClick={() => setColorMode(m.key)} title={m.label} style={{
              padding: '4px 7px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: colorMode === m.key ? '#1D9E75' : 'rgba(255,255,255,0.95)',
              color: colorMode === m.key ? '#fff' : '#2C2C2A',
              border: '1.5px solid ' + (colorMode === m.key ? '#1D9E75' : '#E8E6DF'),
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            }}>{m.icon} {m.label}</button>
          ))}
        </div>

        {/* Bouton filtres */}
        <button onClick={() => setShowFilters(v => !v)} style={{
          padding: '4px 9px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: showFilters || activeFilterCount > 0 ? '#7c3aed' : 'rgba(255,255,255,0.95)',
          color: showFilters || activeFilterCount > 0 ? '#fff' : '#2C2C2A',
          border: '1.5px solid ' + (showFilters || activeFilterCount > 0 ? '#7c3aed' : '#E8E6DF'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}>🔍 Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</button>

        {/* Panneau filtres */}
        {showFilters && (
          <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 200, fontSize: 12 }}>
            {/* Type */}
            <div style={{ marginBottom: 10 }}>
              <div style={sectionTitle}>Type de bien</div>
              {TYPE_OPTIONS.map(t => (
                <label key={t} style={filterRowStyle}>
                  <input type="checkbox" checked={filterTypes.includes(t)} onChange={() => toggleFilter(filterTypes, t, setFilterTypes)} style={{ accentColor: TYPE_COLORS[t] }} />
                  <span style={{ color: TYPE_COLORS[t] }}>●</span> {t}
                </label>
              ))}
            </div>
            {/* DPE */}
            <div style={{ marginBottom: 10 }}>
              <div style={sectionTitle}>Classe DPE</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {DPE_CLASSES.map(c => (
                  <button key={c} onClick={() => toggleFilter(filterDpe, c, setFilterDpe)} style={{
                    width: 28, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: filterDpe.includes(c) ? dpeColor(c) : '#f1f5f9',
                    color: filterDpe.includes(c) ? '#fff' : '#475569',
                    border: '1.5px solid ' + (filterDpe.includes(c) ? dpeColor(c) : '#e2e8f0'),
                  }}>{c}</button>
                ))}
              </div>
            </div>
            {/* Statut */}
            <div style={{ marginBottom: activeFilterCount > 0 ? 8 : 0 }}>
              <div style={sectionTitle}>Statut prospection</div>
              {STATUT_OPTIONS.map(s => (
                <label key={s.key} style={filterRowStyle}>
                  <input type="checkbox" checked={filterStatut.includes(s.key)} onChange={() => toggleFilter(filterStatut, s.key, setFilterStatut)} style={{ accentColor: s.color }} />
                  <span style={{ color: s.color }}>●</span> {s.label}
                </label>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilterTypes([]); setFilterDpe([]); setFilterStatut([]) }}
                style={{ width: '100%', padding: '4px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                ✕ Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* Compteur bas-gauche */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
        borderRadius: 8, padding: '5px 10px',
        fontSize: '0.75rem', color: '#5F5E5A',
        border: '1px solid #e8e7e0', pointerEvents: 'none',
      }}>
        {loading ? '⏳ Chargement…' : `📍 ${filteredFeatures.length.toLocaleString('fr-FR')}${activeFilterCount > 0 ? ` / ${rawAdresses.length.toLocaleString('fr-FR')}` : ''} adresses`}
      </div>

      {/* Légende bas-droite */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
        borderRadius: 8, padding: '8px 12px',
        fontSize: '0.72rem', color: '#5F5E5A',
        border: '1px solid #e8e7e0', pointerEvents: 'none',
        maxHeight: 200, overflowY: 'auto',
      }}>
        {renderLegend()}
      </div>

      {!mapLoaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', fontSize: '0.875rem', color: '#9b9b96' }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 10, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
}
const filterRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 2,
}
