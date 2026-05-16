'use client'

import { useEffect, useRef, useState } from 'react'

interface Adresse {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string; type_bien?: string; prospectable?: boolean
  // ✅ 'supprimee' ajouté
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite' | 'supprimee'
  ordre: number; score?: number; latest_dpe_date?: string | null
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  nom_syndic?: string; nb_bal?: number
}

// ✅ '#1a1a18' ajouté pour 'supprimee'
const STATUT_COLOR: Record<string, string> = {
  a_faire:   '#ef4444',
  boite:     '#3b82f6',
  contact:   '#22c55e',
  visite:    '#9b9b96',
  supprimee: '#1a1a18',
}

interface Props {
  adresses:           Adresse[]
  zonePolygon:        any
  prochaineAdresseId: string | null
  onAdresseClick:     (adresse: Adresse) => void
  dpeFlags?:          string[]
  dpeFilterFrom?:     string
  dpeFilterTo?:       string
}

export default function TerrainMap({ adresses, zonePolygon, prochaineAdresseId, onAdresseClick, dpeFlags = [], dpeFilterFrom, dpeFilterTo }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const adressesRef  = useRef<Adresse[]>([])
  const onClickRef   = useRef<(a: Adresse) => void>(onAdresseClick)
  const watchIdRef   = useRef<number | null>(null)
  const [mapLoaded,  setMapLoaded]  = useState(false)
  const [satellite,  setSatellite]  = useState(false)
  const [gpsActive,  setGpsActive]  = useState(false)
  const [gpsError,   setGpsError]   = useState(false)

  useEffect(() => { adressesRef.current = adresses },     [adresses])
  useEffect(() => { onClickRef.current  = onAdresseClick }, [onAdresseClick])

  // ── Init carte ──────────────────────────────────────────────────────────────
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
            satellite: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256, maxzoom: 19,
            },
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
        map.addSource('adresses',   { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('gps',        { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        // Itinéraire (ligne pointillée)
        map.addLayer({
          id: 'itineraire-line', type: 'line', source: 'itineraire',
          paint: { 'line-color': '#9b9b96', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.6 },
        })

        // Zone tactile large (click)
        map.addLayer({
          id: 'adresses-touch', type: 'circle', source: 'adresses',
          paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-opacity': 0 },
        })

        // Aura DPE récent
        map.addLayer({
          id: 'dpe-aura', type: 'circle', source: 'adresses',
          filter: ['in', ['get', 'dpe_signal'], ['literal', ['hot', 'warm', 'recent']]],
          paint: {
            'circle-radius': ['case', ['==', ['get', 'dpe_signal'], 'hot'], 22, ['==', ['get', 'dpe_signal'], 'warm'], 18, 14],
            'circle-color':  ['case', ['==', ['get', 'dpe_signal'], 'hot'], '#F97316', '#ef4444'],
            'circle-opacity': 0.35, 'circle-stroke-width': 0,
          },
        })

        // Halo DPE flagué (filtre utilisateur)
        map.addLayer({
          id: 'dpe-flag-ring', type: 'circle', source: 'adresses',
          filter: ['==', ['get', 'flagged'], true],
          paint: { 'circle-radius': 20, 'circle-color': '#f59e0b', 'circle-opacity': 0.5, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#d97706' },
        })

        // Points principaux
        map.addLayer({
          id: 'adresses-circle', type: 'circle', source: 'adresses',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'prochaine'], true], 16,
              ['==', ['get', 'dpe_signal'], 'hot'], 14,
              ['==', ['get', 'dpe_signal'], 'warm'], 12,
              ['>=', ['get', 'score'], 80], 9,
              ['>=', ['get', 'score'], 60], 8,
              8,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'dpe_signal'], 'hot'],    '#22c55e',
              ['==', ['get', 'dpe_signal'], 'warm'],   '#22c55e',
              ['==', ['get', 'dpe_signal'], 'recent'], '#22c55e',
              ['get', 'couleur'],
            ],
            'circle-stroke-width': ['case', ['==', ['get', 'prochaine'], true], 3, 2],
            'circle-stroke-color': '#fff',
            // ✅ Supprimée : opacité pleine (couleur noire = déjà distinctif)
            'circle-opacity': [
              'case',
              ['==', ['get', 'statut'], 'supprimee'], 1.0,
              ['==', ['get', 'prospectable'], false],  0.4,
              1,
            ],
          },
        })

        // Pulsation prochaine adresse
        map.addLayer({
          id: 'adresses-prochaine-pulse', type: 'circle', source: 'adresses',
          filter: ['==', ['get', 'prochaine'], true],
          paint: { 'circle-radius': 20, 'circle-color': '#ef4444', 'circle-opacity': 0.2 },
        })

        // GPS
        map.addLayer({ id: 'gps-pulse', type: 'circle', source: 'gps', paint: { 'circle-radius': 12, 'circle-color': '#3b82f6', 'circle-opacity': 0.2 } })
        map.addLayer({ id: 'gps-dot',   type: 'circle', source: 'gps', paint: { 'circle-radius': 6,  'circle-color': '#3b82f6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })

        // Clicks
        map.on('click', 'adresses-touch', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          const adresse = adressesRef.current.find(a => a.id === f.properties.id)
          if (adresse) onClickRef.current(adresse)
        })
        map.on('mouseenter', 'adresses-touch', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'adresses-touch', () => { map.getCanvas().style.cursor = '' })

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

  // ── Mise à jour des adresses ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const pId = prochaineAdresseId

    const features = adresses.filter(a => a.lat && a.lon).map(a => ({
      type: 'Feature' as const,
      properties: {
        id:           a.id,
        statut:       a.statut_carte,
        couleur:      STATUT_COLOR[a.statut_carte] ?? '#9b9b96',
        prospectable: a.prospectable !== false,
        label:        [a.numero, a.nom_voie].filter(Boolean).join(' '),
        prochaine:    a.id === pId,
        score:        a.score ?? 50,
        flagged:      dpeFlags.includes(a.id),
        dpe_signal:   (() => {
          // ✅ Pas de signal DPE pour les adresses supprimées
          if (a.statut_carte === 'supprimee') return null
          if (!a.latest_dpe_date) return null
          const dpeMs = new Date(a.latest_dpe_date).getTime()
          if (dpeFilterFrom) {
            const fromMs = new Date(dpeFilterFrom).getTime()
            const toMs   = dpeFilterTo ? new Date(dpeFilterTo).getTime() : Date.now()
            return (dpeMs >= fromMs && dpeMs <= toMs) ? 'hot' : null
          }
          return (Date.now() - dpeMs) / 86400000 <= 30 ? 'hot' : null
        })(),
      },
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
    }))

    ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features })

    // Itinéraire (lignes entre points dans l'ordre)
    const orderedCoords = adresses
      .filter(a => a.lat && a.lon)
      .sort((a, b) => a.ordre - b.ordre)
      .map(a => [a.lon, a.lat])

    if (orderedCoords.length > 1) {
      ;(map.getSource('itineraire') as any)?.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: orderedCoords }, properties: {} }],
      })
    }

    // FitBounds au premier chargement des adresses
    if (adresses.length > 0) {
      const lons = adresses.filter(a => a.lon).map(a => a.lon)
      const lats = adresses.filter(a => a.lat).map(a => a.lat)
      if (lons.length && lats.length) {
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 60, maxZoom: 17, duration: 800 }
        )
      }
    }
  }, [adresses, prochaineAdresseId, mapLoaded, dpeFlags, dpeFilterFrom, dpeFilterTo])

  // ── GPS ────────────────────────────────────────────────────────────────────
  const startGps = () => {
    if (!navigator.geolocation) return
    setGpsActive(true); setGpsError(false)
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        const map = mapRef.current
        if (!map) return
        ;(map.getSource('gps') as any)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }],
        })
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  const stopGps = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setGpsActive(false); setGpsError(false)
    ;(mapRef.current?.getSource('gps') as any)?.setData({ type: 'FeatureCollection', features: [] })
  }

  // ── Satellite ──────────────────────────────────────────────────────────────
  const toggleSatellite = () => {
    const map = mapRef.current
    if (!map) return
    setSatellite(v => {
      const next = !v
      map.setLayoutProperty('satellite', 'visibility', next ? 'visible' : 'none')
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Satellite toggle */}
      <button onClick={toggleSatellite}
        style={{
          position: 'absolute', bottom: 80, right: 10, zIndex: 10,
          padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: satellite ? '#1D9E75' : 'rgba(255,255,255,0.95)',
          color: satellite ? '#fff' : '#374151',
          border: '1px solid ' + (satellite ? '#1D9E75' : '#e8e7e0'),
          cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>
        {satellite ? '🛰 Satellite' : '🗺 Carte'}
      </button>

      {/* GPS toggle */}
      <button onClick={gpsActive ? stopGps : startGps}
        style={{
          position: 'absolute', bottom: 120, right: 10, zIndex: 10,
          padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: gpsActive ? '#3b82f6' : 'rgba(255,255,255,0.95)',
          color: gpsActive ? '#fff' : (gpsError ? '#ef4444' : '#374151'),
          border: '1px solid ' + (gpsError ? '#ef4444' : gpsActive ? '#3b82f6' : '#e8e7e0'),
          cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>
        {gpsError ? '⚠️ GPS' : gpsActive ? '📍 Actif' : '📍 GPS'}
      </button>
    </div>
  )
}
