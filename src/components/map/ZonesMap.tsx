'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

interface Zone {
  id: string; nom: string; couleur: string; numero: number
  nb_adresses: number; nb_prospectables: number
  polygone_geojson?: any; centroide_geojson?: any
}
interface EnrichedAddr {
  id: string; lat: number; lon: number
  type_bien?: string; has_commerce?: boolean
  classe_bilan_dpe?: string | null
  statut_prospection?: string
}
interface DpeAdresse {
  id: string; lat: number; lon: number
  dpe_etiquette?: string | null; dpe_date?: string | null
}
interface Chevauchement {
  zone_a_id: string; zone_b_id: string; nb_adresses: number
}
interface ZonesMapProps {
  zones:           Zone[]
  selectedZoneId?: string | null
  itineraire?:     EnrichedAddr[]
  chevauchements?: Chevauchement[]
  onZoneClick?:    (zone: Zone) => void
  showDpeRecents?: boolean
  dpeAdresses?:    DpeAdresse[]
}

type ColorMode = 'type_bien' | 'dpe_classe' | 'statut' | 'score'

function dpeColor(etiquette?: string | null): string {
  switch (etiquette?.toUpperCase()) {
    case 'A': return '#16a34a'; case 'B': return '#4ade80'
    case 'C': return '#84cc16'; case 'D': return '#facc15'
    case 'E': return '#f97316'; case 'F': return '#ef4444'
    case 'G': return '#b91c1c'; default:   return '#cbd5e1'
  }
}

function statutColor(statut?: string): string {
  switch (statut) {
    case 'mandat_signe': return '#10b981'
    case 'estimation':   return '#8b5cf6'
    case 'rdv_pris':     return '#f59e0b'
    case 'contact':      return '#34d399'
    case 'visite':       return '#60a5fa'
    default:             return '#94a3b8' // jamais_vue
  }
}

function computeScore(addr: EnrichedAddr): number {
  let s = 0
  if (addr.type_bien && addr.type_bien !== 'inconnu') s += 2
  switch (addr.classe_bilan_dpe?.toUpperCase()) {
    case 'F': case 'G': s += 4; break
    case 'D': case 'E': s += 2; break
    case 'B': case 'C': s += 1; break
  }
  switch (addr.statut_prospection) {
    case 'contact':   s += 3; break
    case 'jamais_vue': s += 2; break
    case 'visite':    s += 1; break
    case 'rdv_pris':  s += 1; break
  }
  return Math.min(s, 9)
}

function scoreColor(score: number): string {
  if (score >= 7) return '#ef4444'
  if (score >= 5) return '#f97316'
  if (score >= 3) return '#facc15'
  return '#94a3b8'
}

function adresseColor(addr: EnrichedAddr, mode: ColorMode): string {
  switch (mode) {
    case 'type_bien':
      switch (addr.type_bien) {
        case 'maison':      return '#4CAF50'
        case 'appartement': return '#2196F3'
        case 'commerce':    return '#FF9800'
        default:            return '#9E9E9E'
      }
    case 'dpe_classe': return dpeColor(addr.classe_bilan_dpe)
    case 'statut':     return statutColor(addr.statut_prospection)
    case 'score':      return scoreColor(computeScore(addr))
  }
}

const TYPE_BIEN_OPTIONS = [
  { key: 'maison',       label: 'Habitat individuel', color: '#4CAF50', icon: '🏠' },
  { key: 'appartement',  label: 'Habitat collectif',  color: '#2196F3', icon: '🏢' },
  { key: 'commerce',     label: 'Commerce',           color: '#FF9800', icon: '🏪' },
  { key: 'inconnu',      label: 'Autre',              color: '#9E9E9E', icon: '❓' },
]

const DPE_CLASSES = ['A','B','C','D','E','F','G']
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

export default function ZonesMap({
  zones, selectedZoneId, itineraire = [], chevauchements = [], onZoneClick,
  showDpeRecents = false, dpeAdresses = [],
}: ZonesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const [mapLoaded,  setMapLoaded]  = useState(false)
  const [satellite,  setSatellite]  = useState(false)
  const [showAddr,   setShowAddr]   = useState(false)
  const [showDpe,    setShowDpe]    = useState(false)
  const [allAddr,    setAllAddr]    = useState<EnrichedAddr[]>([])
  const [dpePoints,  setDpePoints]  = useState<any[]>([])
  const [loadingOv,  setLoadingOv]  = useState(false)
  const [colorMode,  setColorMode]  = useState<ColorMode>('type_bien')
  const [showFilters, setShowFilters] = useState(false)
  const [filterTypes,  setFilterTypes]  = useState<string[]>([])
  const [filterDpe,    setFilterDpe]    = useState<string[]>([])
  const [filterStatut, setFilterStatut] = useState<string[]>([])

  const [qualifyPopup, setQualifyPopup] = useState<{
    id: string; lat: number; lon: number; type_bien?: string; has_commerce?: boolean
    x: number; y: number
  } | null>(null)

  const conflictIds = new Set(
    chevauchements.flatMap((c) => [c.zone_a_id, c.zone_b_id])
  )

  // ── Filtrage + coloration ────────────────────────────────────────────────
  const filteredFeatures = useMemo(() => {
    return allAddr
      .filter(a => {
        if (filterTypes.length  && !filterTypes.includes(a.type_bien ?? 'inconnu'))           return false
        if (filterDpe.length    && !filterDpe.includes(a.classe_bilan_dpe?.toUpperCase() ?? 'N/A')) return false
        if (filterStatut.length && !filterStatut.includes(a.statut_prospection ?? 'jamais_vue')) return false
        return true
      })
      .map(a => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: {
          id:           a.id,
          type_bien:    a.type_bien ?? 'inconnu',
          has_commerce: a.has_commerce ?? false,
          couleur:      adresseColor(a, colorMode),
          score:        computeScore(a),
          classe_bilan_dpe: a.classe_bilan_dpe ?? null,
          statut_prospection: a.statut_prospection ?? 'jamais_vue',
        },
      }))
  }, [allAddr, colorMode, filterTypes, filterDpe, filterStatut])

  // ── Init MapLibre ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    let map: any

    const initMap = async () => {
      const maplibre = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')

      const OSM_STYLE: any = {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            attribution: '© OpenStreetMap contributors',
            tileSize: 256,
            maxzoom: 19
          },
          satellite: {
            type: 'raster',
            tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'],
            tileSize: 256,
            maxzoom: 20
          }
        },
        layers: [
          { id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 },
          { id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 22, layout: { visibility: 'none' } }
        ]
      }

      map = new maplibre.Map({
        container: mapContainer.current!,
        style:     OSM_STYLE,
        center:    [-3.0, 48.5],
        zoom:      10,
      })
      mapRef.current = map

      map.on('load', () => {
        map.addSource('zones-fill',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-outline',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-conflict', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('labels',         { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('adresses',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('hors-zone',      { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('dpe-recents',    { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('all-addr',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('dpe-overlay',    { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        map.addLayer({ id: 'zones-fill-layer', type: 'fill', source: 'zones-fill',
          paint: { 'fill-color': ['get', 'couleur'], 'fill-opacity': ['case', ['get', 'selected'], 0.35, 0.15] } })
        map.addLayer({ id: 'zones-outline-layer', type: 'line', source: 'zones-outline',
          paint: { 'line-color': ['get', 'couleur'], 'line-width': ['case', ['get', 'selected'], 3, 1.5], 'line-opacity': 0.9 } })
        map.addLayer({ id: 'zones-conflict-layer', type: 'line', source: 'zones-conflict',
          paint: { 'line-color': '#ff0000', 'line-width': 2, 'line-dasharray': [4, 2] } })
        map.addLayer({ id: 'zones-label', type: 'symbol', source: 'labels',
          layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-font': ['Open Sans Bold'] },
          paint:  { 'text-color': '#2C2C2A', 'text-halo-color': '#fff', 'text-halo-width': 2 } })
        map.addLayer({ id: 'itineraire-layer', type: 'line', source: 'itineraire',
          paint: { 'line-color': '#1D9E75', 'line-width': 2, 'line-dasharray': [4, 2] } })
        map.addLayer({ id: 'adresses-layer', type: 'circle', source: 'adresses',
          paint: { 'circle-radius': 4, 'circle-color': ['get', 'couleur'], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } })
        map.addLayer({ id: 'hors-zone-layer', type: 'circle', source: 'hors-zone',
          paint: { 'circle-radius': 3, 'circle-color': '#9E9E9E', 'circle-opacity': 0.5 } })
        map.addLayer({ id: 'dpe-aura-zone', type: 'circle', source: 'dpe-recents',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': ['case',
              ['==', ['get', 'dpe_signal'], 'hot'],    22,
              ['==', ['get', 'dpe_signal'], 'warm'],   18,
              ['==', ['get', 'dpe_signal'], 'recent'], 14,
              10
            ],
            'circle-color': ['case',
              ['==', ['get', 'dpe_signal'], 'hot'],    '#F59E0B',
              ['==', ['get', 'dpe_signal'], 'warm'],   '#F97316',
              '#ef4444'
            ],
            'circle-opacity': 0.35,
            'circle-stroke-width': 0,
          }
        })
        map.addLayer({ id: 'dpe-recents-layer', type: 'circle', source: 'dpe-recents',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': ['case',
              ['==', ['get', 'dpe_signal'], 'hot'],    14,
              ['==', ['get', 'dpe_signal'], 'warm'],   12,
              ['==', ['get', 'dpe_signal'], 'recent'], 10,
              8
            ],
            'circle-color': '#22c55e',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.95
          }
        })
        // all-addr: couleur calculée dans les properties
        map.addLayer({ id: 'all-addr-layer', type: 'circle', source: 'all-addr',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 5,
            'circle-color': ['get', 'couleur'],
            'circle-opacity': 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          }
        })
        map.addLayer({ id: 'dpe-overlay-layer', type: 'circle', source: 'dpe-overlay',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 6,
            'circle-color': ['match', ['get', 'anciennete'],
              'chaud', '#22c55e', 'tiede', '#86efac', '#fb923c'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          }
        })

        map.on('click', 'zones-fill-layer', (e: any) => {
          const props = e.features?.[0]?.properties
          if (!props) return
          const zone = zones.find(z => z.id === props.id)
          if (zone) onZoneClick?.(zone)
        })
        map.on('mouseenter', 'zones-fill-layer', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'zones-fill-layer', () => { map.getCanvas().style.cursor = '' })

        map.on('click', 'all-addr-layer', (e: any) => {
          const feat = e.features?.[0]
          if (!feat) return
          e.originalEvent.stopPropagation()
          const { id, type_bien, has_commerce } = feat.properties
          const { x, y } = e.point
          setQualifyPopup({ id, lat: feat.geometry.coordinates[1], lon: feat.geometry.coordinates[0], type_bien, has_commerce, x, y })
          map.getCanvas().style.cursor = 'default'
        })
        map.on('mouseenter', 'all-addr-layer', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'all-addr-layer', () => { map.getCanvas().style.cursor = '' })

        setMapLoaded(true)
      })
    }

    initMap()
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line

  // ── Satellite toggle ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.setLayoutProperty('osm-tiles', 'visibility', satellite ? 'none'    : 'visible')
    map.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none')
  }, [satellite, mapLoaded])

  // ── Données zones ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (!zones.length) {
      ;(map.getSource('zones-fill')    as any)?.setData({ type: 'FeatureCollection', features: [] })
      ;(map.getSource('zones-outline') as any)?.setData({ type: 'FeatureCollection', features: [] })
      ;(map.getSource('labels')        as any)?.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const parseGeo = (v: any) => {
      if (!v) return null
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
      return v
    }

    const fillFeatures = zones.filter(z => z.polygone_geojson).map(z => ({
      type: 'Feature' as const,
      geometry: parseGeo(z.polygone_geojson),
      properties: { id: z.id, couleur: z.couleur, selected: z.id === selectedZoneId, conflict: conflictIds.has(z.id) },
    })).filter(f => f.geometry)

    const labelFeatures = zones.filter(z => z.centroide_geojson).map(z => ({
      type: 'Feature' as const,
      geometry: parseGeo(z.centroide_geojson),
      properties: { id: z.id, label: z.numero + ' · ' + z.nb_adresses + ' adr.' },
    })).filter(f => f.geometry)

    ;(map.getSource('zones-fill')    as any)?.setData({ type: 'FeatureCollection', features: fillFeatures })
    ;(map.getSource('zones-outline') as any)?.setData({ type: 'FeatureCollection', features: fillFeatures })
    ;(map.getSource('labels')        as any)?.setData({ type: 'FeatureCollection', features: labelFeatures })

    if (fillFeatures.length > 0) {
      const lats = zones.flatMap(z => z.centroide_geojson ? [parseGeo(z.centroide_geojson)?.coordinates?.[1]].filter(Boolean) : [])
      const lons = zones.flatMap(z => z.centroide_geojson ? [parseGeo(z.centroide_geojson)?.coordinates?.[0]].filter(Boolean) : [])
      if (lats.length && lons.length) {
        map.fitBounds([
          [Math.min(...lons) - 0.05, Math.min(...lats) - 0.05],
          [Math.max(...lons) + 0.05, Math.max(...lats) + 0.05],
        ], { padding: 40, duration: 800 })
      }
    }
  }, [zones, selectedZoneId, mapLoaded]) // eslint-disable-line

  // ── DPE recents (prop externe) ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const features = dpeAdresses.map(a => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      properties: {
        dpeColor: dpeColor(a.dpe_etiquette),
        dpe_signal: (() => {
          const dateStr = (a as any).date || null
          if (!dateStr) return (a as any).anciennete === 'chaud' ? 'hot' : 'recent'
          const d = new Date(dateStr)
          const days = (Date.now() - d.getTime()) / 86400000
          if (days <= 30)  return 'hot'
          if (days <= 90)  return 'warm'
          if (days <= 365) return 'recent'
          return null
        })()
      },
    }))
    ;(map.getSource('dpe-recents') as any)?.setData({ type: 'FeatureCollection', features })
    map.setLayoutProperty('dpe-recents-layer', 'visibility', showDpeRecents && dpeAdresses.length ? 'visible' : 'none')
    map.setLayoutProperty('dpe-aura-zone',     'visibility', showDpeRecents && dpeAdresses.length ? 'visible' : 'none')
  }, [dpeAdresses, showDpeRecents, mapLoaded])

  // ── Toggle overlay adresses secteur ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!showAddr) {
      map.setLayoutProperty('all-addr-layer', 'visibility', 'none')
      return
    }
    if (allAddr.length > 0) {
      map.setLayoutProperty('all-addr-layer', 'visibility', 'visible')
      return
    }
    setLoadingOv(true)
    fetch('/api/adresses/secteur').then(r => r.json()).then(data => {
      if (!data.adresses) return
      setAllAddr(data.adresses)
      map.setLayoutProperty('all-addr-layer', 'visibility', 'visible')
    }).finally(() => setLoadingOv(false))
  }, [showAddr, mapLoaded])

  // ── Mise à jour source carte quand filtres / mode couleur / données changent
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !showAddr) return
    ;(map.getSource('all-addr') as any)?.setData({
      type: 'FeatureCollection',
      features: filteredFeatures,
    })
  }, [filteredFeatures, mapLoaded, showAddr])

  // ── Toggle overlay DPE secteur ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!showDpe) {
      map.setLayoutProperty('dpe-overlay-layer', 'visibility', 'none')
      return
    }
    if (dpePoints.length > 0) {
      map.setLayoutProperty('dpe-overlay-layer', 'visibility', 'visible')
      return
    }
    setLoadingOv(true)
    fetch('/api/dpe/secteur?mois=12').then(r => r.json()).then(data => {
      if (!data.points) return
      setDpePoints(data.points)
      const fc = {
        type: 'FeatureCollection' as const,
        features: data.points.map((p: any) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
          properties: { anciennete: p.anciennete }
        }))
      }
      ;(map.getSource('dpe-overlay') as any)?.setData(fc)
      map.setLayoutProperty('dpe-overlay-layer', 'visibility', 'visible')
    }).finally(() => setLoadingOv(false))
  }, [showDpe, mapLoaded])

  // ── Qualification adresse ────────────────────────────────────────────────
  const qualifyAdresse = useCallback(async (id: string, type_bien: string, has_commerce: boolean = false) => {
    setQualifyPopup(null)
    await fetch('/api/adresses/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_bien, has_commerce }),
    })
    setAllAddr(prev => prev.map(a => a.id === id ? { ...a, type_bien, has_commerce } : a))
  }, [])

  // ── Légende selon le mode ────────────────────────────────────────────────
  const renderLegend = () => {
    if (!showAddr) return null
    switch (colorMode) {
      case 'type_bien':
        return (
          <div style={legendStyle}>
            <div style={legendTitle}>Type</div>
            <div><span style={{color:'#4CAF50'}}>●</span> Maison</div>
            <div><span style={{color:'#2196F3'}}>●</span> Appartement</div>
            <div><span style={{color:'#FF9800'}}>●</span> Commerce</div>
            <div><span style={{color:'#9E9E9E'}}>●</span> Inconnu</div>
          </div>
        )
      case 'dpe_classe':
        return (
          <div style={legendStyle}>
            <div style={legendTitle}>Classe DPE</div>
            {DPE_CLASSES.map(c => (
              <div key={c}><span style={{color: dpeColor(c)}}>●</span> {c}</div>
            ))}
            <div><span style={{color:'#cbd5e1'}}>●</span> N/A</div>
          </div>
        )
      case 'statut':
        return (
          <div style={legendStyle}>
            <div style={legendTitle}>Statut</div>
            {STATUT_OPTIONS.map(s => (
              <div key={s.key}><span style={{color: s.color}}>●</span> {s.label}</div>
            ))}
          </div>
        )
      case 'score':
        return (
          <div style={legendStyle}>
            <div style={legendTitle}>Score priorité</div>
            <div><span style={{color:'#ef4444'}}>●</span> Très haute (7-9)</div>
            <div><span style={{color:'#f97316'}}>●</span> Haute (5-6)</div>
            <div><span style={{color:'#facc15'}}>●</span> Moyenne (3-4)</div>
            <div><span style={{color:'#94a3b8'}}>●</span> Faible (0-2)</div>
          </div>
        )
    }
  }

  const toggleFilter = (list: string[], val: string, setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter(x => x !== val) : [...list, val])
  }

  const activeFilterCount = filterTypes.length + filterDpe.length + filterStatut.length

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Controles */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => setSatellite(v => !v)} style={ctrlBtn(satellite, '#1a1a18')}>🛰 Satellite</button>

        <button onClick={() => setShowAddr(v => !v)} style={ctrlBtn(showAddr, '#1D9E75')}>
          {loadingOv && showAddr ? '...' : '🏠 Adresses'}
        </button>

        {showAddr && (
          <>
            {/* Sélecteur mode couleur */}
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
              ...ctrlBtn(showFilters || activeFilterCount > 0, '#7c3aed'),
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🔍 Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>

            {/* Panneau filtres */}
            {showFilters && (
              <div style={{
                background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '10px 12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 200, fontSize: 12,
              }}>
                {/* Filtre type_bien */}
                <div style={filterSection}>
                  <div style={filterSectionTitle}>Type de bien</div>
                  {TYPE_BIEN_OPTIONS.map(opt => (
                    <label key={opt.key} style={filterRow}>
                      <input type="checkbox" checked={filterTypes.includes(opt.key)}
                        onChange={() => toggleFilter(filterTypes, opt.key, setFilterTypes)}
                        style={{ accentColor: opt.color }} />
                      <span style={{color: opt.color}}>●</span> {opt.label}
                    </label>
                  ))}
                </div>

                {/* Filtre DPE */}
                <div style={filterSection}>
                  <div style={filterSectionTitle}>Classe DPE</div>
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

                {/* Filtre statut */}
                <div style={filterSection}>
                  <div style={filterSectionTitle}>Statut prospection</div>
                  {STATUT_OPTIONS.map(s => (
                    <label key={s.key} style={filterRow}>
                      <input type="checkbox" checked={filterStatut.includes(s.key)}
                        onChange={() => toggleFilter(filterStatut, s.key, setFilterStatut)}
                        style={{ accentColor: s.color }} />
                      <span style={{color: s.color}}>●</span> {s.label}
                    </label>
                  ))}
                </div>

                {activeFilterCount > 0 && (
                  <button onClick={() => { setFilterTypes([]); setFilterDpe([]); setFilterStatut([]) }}
                    style={{ marginTop: 6, width: '100%', padding: '4px', borderRadius: 6,
                      border: '1px solid #E8E6DF', background: '#fef2f2', cursor: 'pointer',
                      fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                    ✕ Effacer les filtres
                  </button>
                )}
              </div>
            )}

            {renderLegend()}
          </>
        )}

        <button onClick={() => setShowDpe(v => !v)} style={ctrlBtn(showDpe, '#E63946')}>
          {loadingOv && showDpe ? '...' : '📋 DPE récents'}
        </button>

        {showDpe && (
          <div style={legendStyle}>
            <div><span style={{color:'#22c55e'}}>●</span> &lt;1 mois</div>
            <div><span style={{color:'#86efac'}}>●</span> 1–12 mois</div>
            <div><span style={{color:'#fb923c'}}>●</span> &gt;12 mois</div>
          </div>
        )}
      </div>

      {/* Compteur adresses filtrées */}
      {showAddr && activeFilterCount > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, zIndex: 10,
          background: 'rgba(124,58,237,0.9)', color: '#fff',
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        }}>
          {filteredFeatures.length} / {allAddr.length} adresses
        </div>
      )}

      {/* Popup qualification adresse */}
      {qualifyPopup && (
        <div
          onClick={() => setQualifyPopup(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: Math.min(qualifyPopup.x + 10, window.innerWidth - 220),
              top:  Math.min(qualifyPopup.y + 10, window.innerHeight - 200),
              background: '#fff', borderRadius: 12, padding: '12px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              minWidth: 200, zIndex: 21,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2C2A', marginBottom: 10 }}>
              Qualifier cette adresse
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TYPE_BIEN_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => qualifyAdresse(qualifyPopup.id, opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1.5px solid',
                    borderColor: qualifyPopup.type_bien === opt.key ? opt.color : '#E8E6DF',
                    background: qualifyPopup.type_bien === opt.key ? opt.color + '22' : '#fff',
                    color: '#2C2C2A', fontSize: 13, fontWeight: qualifyPopup.type_bien === opt.key ? 700 : 400,
                  }}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                  {qualifyPopup.type_bien === opt.key && <span style={{ marginLeft: 'auto', color: opt.color }}>✓</span>}
                </button>
              ))}
            </div>
            {qualifyPopup.type_bien === 'appartement' && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
                padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1.5px solid ' + (qualifyPopup.has_commerce ? '#FF9800' : '#E8E6DF'),
                background: qualifyPopup.has_commerce ? '#FFF3E0' : '#F8F7F4',
              }}>
                <input
                  type="checkbox"
                  checked={qualifyPopup.has_commerce ?? false}
                  onChange={e => setQualifyPopup(p => p ? { ...p, has_commerce: e.target.checked } : p)}
                  style={{ accentColor: '#FF9800', width: 15, height: 15, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: '#2C2C2A' }}>
                  🏪 Commerce en rez-de-chaussée
                </span>
              </label>
            )}
            <button
              onClick={() => setQualifyPopup(null)}
              style={{ marginTop: 8, width: '100%', padding: '5px', borderRadius: 6, border: '1px solid #E8E6DF', background: '#F8F7F4', cursor: 'pointer', fontSize: 12, color: '#5F5E5A' }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles utilitaires ───────────────────────────────────────────────────────

function ctrlBtn(active: boolean, activeColor: string): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? activeColor : 'rgba(255,255,255,0.95)',
    color: active ? '#fff' : '#2C2C2A',
    border: '1.5px solid ' + (active ? activeColor : '#E8E6DF'),
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  }
}

const legendStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)', borderRadius: 6, padding: '6px 10px', fontSize: 11, lineHeight: 1.8,
}
const legendTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
}
const filterSection: React.CSSProperties = {
  marginBottom: 10,
}
const filterSectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
}
const filterRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 2,
}
