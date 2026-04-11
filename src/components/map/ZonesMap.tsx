'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Zone {
  id: string; nom: string; couleur: string; numero: number
  nb_adresses: number; nb_prospectables: number
  polygone_geojson?: any; centroide_geojson?: any
}
interface Adresse {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string; type_bien?: string
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
  itineraire?:     Adresse[]
  chevauchements?: Chevauchement[]
  onZoneClick?:    (zone: Zone) => void
  showDpeRecents?: boolean
  dpeAdresses?:    DpeAdresse[]
}

function dpeColor(etiquette?: string | null): string {
  switch (etiquette?.toUpperCase()) {
    case 'A': return '#16a34a'; case 'B': return '#4ade80'
    case 'C': return '#84cc16'; case 'D': return '#facc15'
    case 'E': return '#f97316'; case 'F': return '#ef4444'
    case 'G': return '#b91c1c'; default:   return '#f59e0b'
  }
}

// Types de bien pour la qualification rapide
const TYPE_BIEN_OPTIONS = [
  { key: 'maison',       label: 'Habitat individuel', color: '#4CAF50', icon: '🏠' },
  { key: 'appartement',  label: 'Habitat collectif',  color: '#2196F3', icon: '🏢' },
  { key: 'commerce',     label: 'Commerce',           color: '#FF9800', icon: '🏪' },
  { key: 'inconnu',      label: 'Autre',              color: '#9E9E9E', icon: '❓' },
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
  const [allAddr,    setAllAddr]    = useState<any[]>([])
  const [dpePoints,  setDpePoints]  = useState<any[]>([])
  const [loadingOv,  setLoadingOv]  = useState(false)

  // Qualification rapide d'une adresse
  const [qualifyPopup, setQualifyPopup] = useState<{
    id: string; lat: number; lon: number; type_bien?: string; has_commerce?: boolean
    x: number; y: number
  } | null>(null)

  const conflictIds = new Set(
    chevauchements.flatMap((c) => [c.zone_a_id, c.zone_b_id])
  )

  // ── Init MapLibre ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    let map: any

    const initMap = async () => {
      const maplibre = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')

      const OSM_STYLE = {
        version: 8 as const,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster' as const,
            tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'],
            tileSize: 256,
          },
          satellite: {
            type: 'raster' as const,
            tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'],
            tileSize: 256,
          },
        },
        layers: [
          { id: 'osm-layer',       type: 'raster' as const, source: 'osm',       layout: { visibility: 'visible' } },
          { id: 'satellite-layer', type: 'raster' as const, source: 'satellite', layout: { visibility: 'none'    } },
        ],
      }

      map = new maplibre.Map({
        container: mapContainer.current!,
        style:     OSM_STYLE,
        center:    [-3.0, 48.5],
        zoom:      10,
      })
      mapRef.current = map

      map.on('load', () => {
        // Sources zones
        map.addSource('zones-fill',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-outline',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-conflict', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('labels',         { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('adresses',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('hors-zone',      { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('dpe-recents',    { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        // Sources overlay
        map.addSource('all-addr',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('dpe-overlay',    { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        // Layers zones
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
        map.addLayer({ id: 'dpe-recents-layer', type: 'circle', source: 'dpe-recents',
          layout: { visibility: 'none' },
          paint: { 'circle-radius': 6, 'circle-color': ['get', 'dpeColor'], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9 } })

        // Layers overlay adresses secteur
        map.addLayer({ id: 'all-addr-layer', type: 'circle', source: 'all-addr',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 5,
            'circle-color': ['match', ['get', 'type_bien'],
              'maison', '#4CAF50', 'appartement', '#2196F3',
              'commerce', '#FF9800', '#9E9E9E'],
            'circle-opacity': 0.8,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          }
        })
        // Layer overlay DPE secteur
        map.addLayer({ id: 'dpe-overlay-layer', type: 'circle', source: 'dpe-overlay',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 6,
            'circle-color': ['match', ['get', 'anciennete'],
              'chaud', '#E63946', 'tiede', '#FF9800', '#FFD54F'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          }
        })

        // Interactivite zones
        map.on('click', 'zones-fill-layer', (e: any) => {
          const props = e.features?.[0]?.properties
          if (!props) return
          const zone = zones.find(z => z.id === props.id)
          if (zone) onZoneClick?.(zone)
        })
        map.on('mouseenter', 'zones-fill-layer', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'zones-fill-layer', () => { map.getCanvas().style.cursor = '' })

        // Clic sur adresse overlay → popup de qualification
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
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [])

  // ── Satellite toggle ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.setLayoutProperty('osm-layer',       'visibility', satellite ? 'none'    : 'visible')
    map.setLayoutProperty('satellite-layer', 'visibility', satellite ? 'visible' : 'none')
  }, [satellite, mapLoaded])

  // ── Données zones ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !zones.length) return

    const fillFeatures   = zones.filter(z => z.polygone_geojson).map(z => ({
      type: 'Feature' as const,
      geometry: z.polygone_geojson,
      properties: { id: z.id, couleur: z.couleur, selected: z.id === selectedZoneId, conflict: conflictIds.has(z.id) },
    }))
    const labelFeatures  = zones.filter(z => z.centroide_geojson).map(z => ({
      type: 'Feature' as const,
      geometry: z.centroide_geojson,
      properties: { id: z.id, label: z.numero + ' · ' + z.nb_adresses + ' adr.' },
    }))

    ;(map.getSource('zones-fill')    as any)?.setData({ type: 'FeatureCollection', features: fillFeatures })
    ;(map.getSource('zones-outline') as any)?.setData({ type: 'FeatureCollection', features: fillFeatures })
    ;(map.getSource('labels')        as any)?.setData({ type: 'FeatureCollection', features: labelFeatures })

    if (zones.length > 0 && fillFeatures.length > 0) {
      const lats = zones.flatMap(z => z.centroide_geojson ? [z.centroide_geojson.coordinates[1]] : [])
      const lons = zones.flatMap(z => z.centroide_geojson ? [z.centroide_geojson.coordinates[0]] : [])
      if (lats.length) {
        map.fitBounds([
          [Math.min(...lons) - 0.05, Math.min(...lats) - 0.05],
          [Math.max(...lons) + 0.05, Math.max(...lats) + 0.05],
        ], { padding: 40, duration: 800 })
      }
    }
  }, [zones, selectedZoneId, mapLoaded])

  // ── DPE recents (prop externe) ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const features = dpeAdresses.map(a => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      properties: { dpeColor: dpeColor(a.dpe_etiquette) },
    }))
    ;(map.getSource('dpe-recents') as any)?.setData({ type: 'FeatureCollection', features })
    map.setLayoutProperty('dpe-recents-layer', 'visibility', showDpeRecents && dpeAdresses.length ? 'visible' : 'none')
  }, [dpeAdresses, showDpeRecents, mapLoaded])

  // ── Toggle overlay adresses secteur ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!showAddr) { map.setLayoutProperty('all-addr-layer', 'visibility', 'none'); return }
    if (allAddr.length > 0) { map.setLayoutProperty('all-addr-layer', 'visibility', 'visible'); return }
    setLoadingOv(true)
    fetch('/api/adresses/secteur').then(r => r.json()).then(data => {
      if (!data.adresses) return
      setAllAddr(data.adresses)
      const fc = { type: 'FeatureCollection' as const, features: data.adresses.map((a: any) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: { id: a.id, type_bien: a.type_bien ?? 'inconnu', has_commerce: a.has_commerce ?? false }
      }))}
      ;(map.getSource('all-addr') as any)?.setData(fc)
      map.setLayoutProperty('all-addr-layer', 'visibility', 'visible')
    }).finally(() => setLoadingOv(false))
  }, [showAddr, mapLoaded])

  // ── Toggle overlay DPE secteur ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!showDpe) { map.setLayoutProperty('dpe-overlay-layer', 'visibility', 'none'); return }
    if (dpePoints.length > 0) { map.setLayoutProperty('dpe-overlay-layer', 'visibility', 'visible'); return }
    setLoadingOv(true)
    fetch('/api/dpe/secteur?mois=12').then(r => r.json()).then(data => {
      if (!data.points) return
      setDpePoints(data.points)
      const fc = { type: 'FeatureCollection' as const, features: data.points.map((p: any) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { anciennete: p.anciennete }
      }))}
      ;(map.getSource('dpe-overlay') as any)?.setData(fc)
      map.setLayoutProperty('dpe-overlay-layer', 'visibility', 'visible')
    }).finally(() => setLoadingOv(false))
  }, [showDpe, mapLoaded])

  // ── Qualification adresse ───────────────────────────────────────────────
  const qualifyAdresse = useCallback(async (id: string, type_bien: string, has_commerce: boolean) => {
    setQualifyPopup(null)
    await fetch('/api/adresses/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_bien, has_commerce }),
    })
    setAllAddr(prev => prev.map(a => a.id === id ? { ...a, type_bien, has_commerce } : a))
    const map = mapRef.current
    if (!map) return
    const fc = { type: 'FeatureCollection' as const, features: allAddr.map((a: any) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      properties: { id: a.id, type_bien: a.id === id ? type_bien : (a.type_bien ?? 'inconnu') }
    }))}
    ;(map.getSource('all-addr') as any)?.setData(fc)
  }, [allAddr])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Controles en haut à gauche */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Satellite */}
        <button onClick={() => setSatellite(v => !v)} title="Vue satellite" style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: satellite ? '#1a1a18' : 'rgba(255,255,255,0.95)',
          color: satellite ? '#fff' : '#2C2C2A',
          border: '1.5px solid ' + (satellite ? '#1a1a18' : '#E8E6DF'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>🛰 Satellite</button>

        {/* Adresses */}
        <button onClick={() => setShowAddr(v => !v)} title="Afficher toutes les adresses" style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: showAddr ? '#1D9E75' : 'rgba(255,255,255,0.95)',
          color: showAddr ? '#fff' : '#2C2C2A',
          border: '1.5px solid ' + (showAddr ? '#1D9E75' : '#E8E6DF'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>{loadingOv && showAddr ? '...' : '🏠 Adresses'}</button>

        {/* DPE */}
        <button onClick={() => setShowDpe(v => !v)} title="Afficher les DPE recents" style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: showDpe ? '#E63946' : 'rgba(255,255,255,0.95)',
          color: showDpe ? '#fff' : '#2C2C2A',
          border: '1.5px solid ' + (showDpe ? '#E63946' : '#E8E6DF'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>{loadingOv && showDpe ? '...' : '📋 DPE recents'}</button>

        {/* Legende */}
        {showAddr && (
          <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 6, padding: '4px 8px', fontSize: 11, lineHeight: 1.7 }}>
            <div><span style={{color:'#4CAF50'}}>●</span> Maison</div>
            <div><span style={{color:'#2196F3'}}>●</span> Appartement</div>
            <div><span style={{color:'#FF9800'}}>●</span> Commerce</div>
            <div><span style={{color:'#9E9E9E'}}>●</span> Autre</div>
          </div>
        )}
        {showDpe && (
          <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 6, padding: '4px 8px', fontSize: 11, lineHeight: 1.7 }}>
            <div><span style={{color:'#E63946'}}>●</span> &lt;6 mois</div>
            <div><span style={{color:'#FF9800'}}>●</span> 6-12 mois</div>
          </div>
        )}
      </div>

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
            {/* Checkbox has_commerce — visible seulement pour appartement */}
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
                  🏪 Commerce en rez-de-chaussee
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
