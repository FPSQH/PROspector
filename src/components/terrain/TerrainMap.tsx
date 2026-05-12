'use client'

import { useEffect, useRef, useState } from 'react'

interface Adresse {
  id: string; lat: number; lon: number; numero?: string; nom_voie?: string
  type_bien?: string; prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite'
  ordre: number; score?: number; latest_dpe_date?: string | null
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  nom_syndic?: string; nb_bal?: number
}

const STATUT_COLOR: Record<string, string> = {
  a_faire: '#ef4444', boite: '#3b82f6', contact: '#22c55e', visite: '#9b9b96',
}

interface Props {
  adresses:           Adresse[]
  zonePolygon:        any
  prochaineAdresseId: string | null
  onAdresseClick:     (adresse: Adresse) => void
  dpeFlags?:          string[]
  dpeFilterFrom?:     string
  dpeFilterTo?:       string
  // Mode placement adresse manuelle
  placementMode?:     boolean
  onPlacementClick?:  (lat: number, lon: number) => void
  placementCoords?:   { lat: number; lon: number } | null
}

export default function TerrainMap({
  adresses, zonePolygon, prochaineAdresseId, onAdresseClick,
  dpeFlags = [], dpeFilterFrom, dpeFilterTo,
  placementMode = false, onPlacementClick, placementCoords,
}: Props) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<any>(null)
  const adressesRef    = useRef<Adresse[]>([])
  const onClickRef     = useRef<(a: Adresse) => void>(onAdresseClick)
  const placementRef   = useRef(placementMode)
  const onPlaceRef     = useRef(onPlacementClick)
  const watchIdRef     = useRef<number | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [gpsActive, setGpsActive] = useState(false)
  const [gpsError, setGpsError]   = useState(false)

  useEffect(() => { adressesRef.current  = adresses },         [adresses])
  useEffect(() => { onClickRef.current   = onAdresseClick },   [onAdresseClick])
  useEffect(() => { placementRef.current = placementMode },    [placementMode])
  useEffect(() => { onPlaceRef.current   = onPlacementClick }, [onPlacementClick])

  // ── Init carte ────────────────────────────────────────────────
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
            osm:       { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap', maxzoom: 19 },
            satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
          },
          layers: [
            { id: 'osm',       type: 'raster', source: 'osm' },
            { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
          ],
        },
        center: [2.5, 46.8], zoom: 14,
        attributionControl: false,
      })

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        mapRef.current = map

        // Sources
        map.addSource('adresses',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('gps',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire',{ type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('placement', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        // Layers itinéraire
        map.addLayer({ id: 'itineraire-line', type: 'line', source: 'itineraire', paint: { 'line-color': '#9b9b96', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.6 } })

        // Layers adresses
        map.addLayer({ id: 'adresses-touch', type: 'circle', source: 'adresses', paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-opacity': 0 } })
        map.addLayer({ id: 'dpe-aura', type: 'circle', source: 'adresses', filter: ['in', ['get', 'dpe_signal'], ['literal', ['hot', 'warm', 'recent']]], paint: { 'circle-radius': ['case', ['==', ['get', 'dpe_signal'], 'hot'], 22, ['==', ['get', 'dpe_signal'], 'warm'], 18, 14], 'circle-color': ['case', ['==', ['get', 'dpe_signal'], 'hot'], '#F97316', '#ef4444'], 'circle-opacity': 0.35 } })
        map.addLayer({ id: 'dpe-flag-ring', type: 'circle', source: 'adresses', filter: ['==', ['get', 'flagged'], true], paint: { 'circle-radius': 20, 'circle-color': '#f59e0b', 'circle-opacity': 0.5, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#d97706' } })
        map.addLayer({ id: 'adresses-circle', type: 'circle', source: 'adresses', paint: { 'circle-radius': ['case', ['==', ['get', 'prochaine'], true], 16, ['==', ['get', 'dpe_signal'], 'hot'], 14, ['==', ['get', 'dpe_signal'], 'warm'], 12, ['==', ['get', 'dpe_signal'], 'recent'], 10, ['>=', ['get', 'score'], 80], 9, 8], 'circle-color': ['case', ['==', ['get', 'dpe_signal'], 'hot'], '#22c55e', ['==', ['get', 'dpe_signal'], 'warm'], '#22c55e', ['==', ['get', 'dpe_signal'], 'recent'], '#22c55e', ['get', 'couleur']], 'circle-stroke-width': ['case', ['==', ['get', 'prochaine'], true], 3, 2], 'circle-stroke-color': '#fff', 'circle-opacity': ['case', ['==', ['get', 'prospectable'], false], 0.4, 1] } })
        map.addLayer({ id: 'adresses-prochaine-pulse', type: 'circle', source: 'adresses', filter: ['==', ['get', 'prochaine'], true], paint: { 'circle-radius': 20, 'circle-color': '#ef4444', 'circle-opacity': 0.2 } })

        // Layer GPS
        map.addLayer({ id: 'gps-pulse', type: 'circle', source: 'gps', paint: { 'circle-radius': 12, 'circle-color': '#3b82f6', 'circle-opacity': 0.2 } })
        map.addLayer({ id: 'gps-dot',   type: 'circle', source: 'gps', paint: { 'circle-radius': 6, 'circle-color': '#3b82f6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })

        // Layer placement — marqueur orange pulsant
        map.addLayer({ id: 'placement-pulse',  type: 'circle', source: 'placement', paint: { 'circle-radius': 28, 'circle-color': '#ea580c', 'circle-opacity': 0.2 } })
        map.addLayer({ id: 'placement-circle', type: 'circle', source: 'placement', paint: { 'circle-radius': 14, 'circle-color': '#ea580c', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff', 'circle-opacity': 1 } })

        // Click sur adresse
        map.on('click', 'adresses-touch', (e: any) => {
          if (placementRef.current) return // ignorer en mode placement
          const f = e.features?.[0]
          if (!f) return
          const adresse = adressesRef.current.find((a) => a.id === f.properties.id)
          if (adresse) onClickRef.current(adresse)
        })

        // Click sur la carte (mode placement)
        map.on('click', (e: any) => {
          if (!placementRef.current) return
          const { lat, lng } = e.lngLat
          onPlaceRef.current?.(lat, lng)
        })

        map.on('mouseenter', 'adresses-touch', () => { if (!placementRef.current) map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'adresses-touch', () => { if (!placementRef.current) map.getCanvas().style.cursor = '' })

        setMapLoaded(true)
      })
    }

    init()
    return () => {
      if (map) map.remove()
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Curseur selon le mode ──────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    mapRef.current.getCanvas().style.cursor = placementMode ? 'crosshair' : ''
  }, [mapLoaded, placementMode])

  // ── Marqueur de placement ──────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const source = mapRef.current.getSource('placement') as any
    if (!source) return
    if (placementCoords) {
      source.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [placementCoords.lon, placementCoords.lat] } }] })
      mapRef.current.flyTo({ center: [placementCoords.lon, placementCoords.lat], zoom: 18, duration: 500 })
    } else {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [mapLoaded, placementCoords])

  // ── Adresses ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const pId = prochaineAdresseId
    const features = adresses.filter((a) => a.lat && a.lon).map((a) => ({
      type: 'Feature' as const,
      properties: {
        id: a.id, statut: a.statut_carte, couleur: STATUT_COLOR[a.statut_carte] ?? '#9b9b96',
        prospectable: a.prospectable !== false, label: [a.numero, a.nom_voie].filter(Boolean).join(' '),
        prochaine: a.id === pId, score: a.score ?? 50, flagged: dpeFlags.includes(a.id),
        dpe_signal: (() => {
          if (!a.latest_dpe_date) return null
          const dpeMs = new Date(a.latest_dpe_date).getTime()
          if (dpeFilterFrom) {
            const from = new Date(dpeFilterFrom).getTime(); const to = dpeFilterTo ? new Date(dpeFilterTo).getTime() : Date.now()
            return (dpeMs >= from && dpeMs <= to) ? 'hot' : null
          }
          return (Date.now() - dpeMs) / 86400000 <= 30 ? 'hot' : null
        })(),
      },
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
    }))
    ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features })

    // Centrage
    const withCoords = adresses.filter((a) => a.lat && a.lon)
    if (!gpsActive && !placementMode && withCoords.length > 0) {
      if (prochaineAdresseId) {
        const p = adresses.find((a) => a.id === prochaineAdresseId)
        if (p?.lat && p?.lon) map.easeTo({ center: [p.lon, p.lat], zoom: 17, duration: 500 })
      } else {
        const lons = withCoords.map((a) => a.lon); const lats = withCoords.map((a) => a.lat)
        map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 17, duration: 800 })
      }
    }

    // Itinéraire
    const sorted = [...adresses].filter((a) => a.lat && a.lon).sort((a, b) => a.ordre - b.ordre)
    if (sorted.length >= 2) {
      ;(map.getSource('itineraire') as any)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: sorted.map((a) => [a.lon, a.lat]) } }] })
    }
  }, [mapLoaded, adresses, dpeFlags, prochaineAdresseId])

  // ── Satellite ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    mapRef.current.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none')
    mapRef.current.setLayoutProperty('osm',       'visibility', satellite ? 'none'    : 'visible')
  }, [mapLoaded, satellite])

  // ── GPS ────────────────────────────────────────────────────────
  const startGPS = () => {
    if (!navigator.geolocation) { setGpsError(true); return }
    setGpsActive(true); setGpsError(false)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords
        if (!mapRef.current) return
        ;(mapRef.current.getSource('gps') as any)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [longitude, latitude] } }] })
        mapRef.current.panTo([longitude, latitude], { duration: 500 })
      },
      () => { setGpsError(true); setGpsActive(false) },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }
  const stopGPS = () => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
    setGpsActive(false)
    ;(mapRef.current?.getSource('gps') as any)?.setData({ type: 'FeatureCollection', features: [] })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Indicateur mode placement */}
      {placementMode && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(234,88,12,0.92)', color: '#fff', borderRadius: 20, padding: '6px 16px', fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
          📍 Tapez sur la carte pour placer l'adresse
        </div>
      )}

      {/* Boutons flottants (masqués en mode placement) */}
      {!placementMode && (
        <div style={{ position: 'absolute', bottom: 24, right: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10 }}>
          <button onClick={gpsActive ? stopGPS : startGPS} style={{ width: 44, height: 44, borderRadius: '50%', background: gpsError ? '#fef2f2' : gpsActive ? '#3b82f6' : '#fff', border: `1px solid ${gpsError ? '#fecaca' : gpsActive ? '#3b82f6' : '#e8e7e0'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={gpsError ? '#dc2626' : gpsActive ? '#fff' : '#5F5E5A'} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
          </button>
          <button onClick={() => setSatellite((v) => !v)} style={{ width: 44, height: 44, borderRadius: '50%', background: satellite ? '#1a1a18' : '#fff', border: `1px solid ${satellite ? '#1a1a18' : '#e8e7e0'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={satellite ? '#fff' : '#5F5E5A'} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </button>
        </div>
      )}

      {!mapLoaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', fontSize: '0.875rem', color: '#9b9b96' }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  )
}
