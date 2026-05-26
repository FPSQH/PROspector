'use client'

import { useEffect, useRef, useState } from 'react'

interface Adresse {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string; type_bien?: string; prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite' | 'supprimee'
  ordre: number; score?: number; latest_dpe_date?: string | null
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  nom_syndic?: string; nb_bal?: number
}

export interface ContactPoint {
  id: string; lat: number; lon: number
  prenom?: string | null; nom?: string | null; statut_pipeline?: string | null
}

const STATUT_COLOR: Record<string, string> = {
  a_faire:   '#ef4444',
  boite:     '#3b82f6',
  contact:   '#22c55e',
  visite:    '#9b9b96',
  supprimee: '#1a1a18',
}

const PIPELINE_COLORS: Record<string, string> = {
  prospect:      '#9A9AA8',
  qualification: '#60A5FA',
  estimation:    '#FBBF24',
  mandat:        '#4ADE80',
  perdu:         '#F87171',
}

interface Props {
  adresses:           Adresse[]
  zonePolygon:        any
  prochaineAdresseId: string | null
  onAdresseClick:     (adresse: Adresse) => void
  contacts?:          ContactPoint[]
  defaultShowDpe?:    boolean
}

/** Élément HTML pour un marqueur contact CRM */
function createContactMarkerEl(label: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 26px; height: 26px; border-radius: 50%;
    background: ${color}; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800;
    border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    pointer-events: none; user-select: none;
  `
  el.textContent = (label.slice(0, 1) || '?').toUpperCase()
  return el
}

export default function TerrainMap({
  adresses, zonePolygon, prochaineAdresseId, onAdresseClick,
  contacts, defaultShowDpe = false,
}: Props) {
  const containerRef       = useRef<HTMLDivElement>(null)
  const mapRef             = useRef<any>(null)
  const adressesRef        = useRef<Adresse[]>([])
  const onClickRef         = useRef<(a: Adresse) => void>(onAdresseClick)
  const watchIdRef         = useRef<number | null>(null)
  const prevCountRef       = useRef<number>(0)
  const contactMarkersRef  = useRef<any[]>([])

  const [mapLoaded,  setMapLoaded]  = useState(false)
  const [satellite,  setSatellite]  = useState(false)
  const [gpsActive,  setGpsActive]  = useState(false)
  const [gpsError,   setGpsError]   = useState(false)
  const [showDpe,    setShowDpe]    = useState(defaultShowDpe)
  const [showContacts, setShowContacts] = useState(true)

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

        // Itinéraire (pointillé)
        map.addLayer({
          id: 'itineraire-line', type: 'line', source: 'itineraire',
          paint: { 'line-color': '#9b9b96', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.6 },
        })

        // Zone tactile (click invisible)
        map.addLayer({
          id: 'adresses-touch', type: 'circle', source: 'adresses',
          paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-opacity': 0 },
        })

        // Points principaux
        map.addLayer({
          id: 'adresses-circle', type: 'circle', source: 'adresses',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'prochaine'], true], 16,
              ['>=', ['get', 'score'], 80], 9,
              8,
            ],
            'circle-color': ['get', 'couleur'],
            'circle-stroke-width': ['case', ['==', ['get', 'prochaine'], true], 3, 2],
            'circle-stroke-color': '#fff',
            'circle-opacity': [
              'case',
              ['==', ['get', 'statut'], 'supprimee'], 1.0,
              ['==', ['get', 'prospectable'], false],  0.4,
              1,
            ],
          },
        })

        // Halo DPE hot (adresses avec DPE < 2 mois)
        map.addLayer({
          id: 'adresses-dpe-halo', type: 'circle', source: 'adresses',
          filter: ['==', ['get', 'dpe_hot'], true],
          paint: { 'circle-radius': 14, 'circle-color': '#F59E0B', 'circle-opacity': 0.25, 'circle-blur': 0.5 },
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

        // Click sur adresse
        map.on('click', 'adresses-touch', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          const adresse = adressesRef.current.find(a => a.id === f.properties.id)
          if (adresse) onClickRef.current(adresse)
        })
        map.on('mouseenter', 'adresses-touch', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'adresses-touch', () => { map.getCanvas().style.cursor = '' })

        prevCountRef.current = 0
        setMapLoaded(true)
      })
    }

    init()

    return () => {
      if (map) {
        map.remove()
        mapRef.current = null
      }
      contactMarkersRef.current.forEach(m => { try { m.remove() } catch(e) {} })
      contactMarkersRef.current = []
      setMapLoaded(false)
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mise à jour des adresses ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    if (typeof map.getSource !== 'function') return

    const pId        = prochaineAdresseId
    const twoMonthsAgo = Date.now() - 60 * 24 * 3600 * 1000

    const features = adresses.filter(a => a.lat && a.lon).map(a => {
      const dpeTs   = a.latest_dpe_date ? new Date(a.latest_dpe_date).getTime() : null
      const dpe_hot = dpeTs !== null && dpeTs >= twoMonthsAgo   // DPE < 2 mois
      const dpe_cat = (() => {
        if (a.statut_carte === 'supprimee' || !dpeTs) return null
        const days = (Date.now() - dpeTs) / 86400000
        if (days <= 60)  return 'hot'
        if (days <= 365) return 'tiede'
        return 'ancien'
      })()
      const couleur = showDpe && dpe_cat
        ? (dpe_cat === 'hot' ? '#F59E0B' : dpe_cat === 'tiede' ? '#86efac' : '#9b9b96')
        : (STATUT_COLOR[a.statut_carte] ?? '#9b9b96')
      return {
        type: 'Feature' as const,
        properties: {
          id:           a.id,
          statut:       a.statut_carte,
          couleur,
          dpe_hot,
          prospectable: a.prospectable !== false,
          label:        [a.numero, a.nom_voie].filter(Boolean).join(' '),
          prochaine:    a.id === pId,
          score:        a.score ?? 50,
          dpe_cat,
        },
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      }
    })

    try {
      ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features })

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

      if (adresses.length > 0 && prevCountRef.current === 0) {
        const lons = adresses.filter(a => a.lon).map(a => a.lon)
        const lats = adresses.filter(a => a.lat).map(a => a.lat)
        if (lons.length && lats.length) {
          map.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: 60, maxZoom: 17, duration: 800 }
          )
        }
      }
      prevCountRef.current = adresses.length

    } catch (err) {
      console.warn('[TerrainMap] setData erreur:', err)
    }

  }, [adresses, prochaineAdresseId, mapLoaded, showDpe])

  // ── Marqueurs contacts ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // Supprimer les marqueurs précédents
    contactMarkersRef.current.forEach(m => { try { m.remove() } catch(e) {} })
    contactMarkersRef.current = []

    if (!showContacts || !contacts?.length) return

    import('maplibre-gl').then(ml => {
      const currentMap = mapRef.current
      if (!currentMap) return
      contacts.forEach(c => {
        if (!c.lat || !c.lon) return
        const label = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'
        const color = PIPELINE_COLORS[c.statut_pipeline ?? 'prospect'] ?? '#9A9AA8'
        const el    = createContactMarkerEl(label, color)
        try {
          const marker = new ml.Marker({ element: el, anchor: 'center' })
            .setLngLat([c.lon, c.lat])
            .addTo(currentMap)
          contactMarkersRef.current.push(marker)
        } catch(e) {}
      })
    })
  }, [contacts, mapLoaded, showContacts])

  // ── GPS ────────────────────────────────────────────────────────────────────
  const startGps = () => {
    if (!navigator.geolocation) return
    setGpsActive(true); setGpsError(false)
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        const map = mapRef.current
        if (!map || typeof map.getSource !== 'function') return
        try {
          ;(map.getSource('gps') as any)?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }],
          })
        } catch (e) { console.warn('[GPS] setData erreur:', e) }
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  const stopGps = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setGpsActive(false); setGpsError(false)
    const map = mapRef.current
    if (map && typeof map.getSource === 'function') {
      try { ;(map.getSource('gps') as any)?.setData({ type: 'FeatureCollection', features: [] }) } catch (e) {}
    }
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

  const hasContacts = (contacts?.length ?? 0) > 0
  const btnBase = {
    position: 'absolute' as const, right: 10, zIndex: 10,
    padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 as const,
    cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    border: '1px solid',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Satellite toggle */}
      <button onClick={toggleSatellite} style={{
        ...btnBase, bottom: 80,
        background: satellite ? '#1D9E75' : 'rgba(255,255,255,0.95)',
        color:      satellite ? '#fff'     : '#374151',
        borderColor: satellite ? '#1D9E75' : '#e8e7e0',
      }}>
        {satellite ? '🛰 Satellite' : '🗺 Carte'}
      </button>

      {/* GPS toggle */}
      <button onClick={gpsActive ? stopGps : startGps} style={{
        ...btnBase, bottom: 120,
        background:  gpsActive ? '#3b82f6' : 'rgba(255,255,255,0.95)',
        color:       gpsActive ? '#fff'    : (gpsError ? '#ef4444' : '#374151'),
        borderColor: gpsError  ? '#ef4444' : gpsActive ? '#3b82f6' : '#e8e7e0',
      }}>
        {gpsError ? '⚠️ GPS' : gpsActive ? '📍 Actif' : '📍 GPS'}
      </button>

      {/* DPE toggle */}
      <button onClick={() => setShowDpe(v => !v)} style={{
        ...btnBase, bottom: 160,
        background:  showDpe ? '#F59E0B' : 'rgba(255,255,255,0.95)',
        color:       showDpe ? '#fff'    : '#374151',
        borderColor: showDpe ? '#F59E0B' : '#e8e7e0',
      }}>
        🏠 DPE
      </button>

      {/* Contacts toggle — visible seulement si des contacts sont passés */}
      {hasContacts && (
        <button onClick={() => setShowContacts(v => !v)} style={{
          ...btnBase, bottom: 200,
          background:  showContacts ? '#4ADE80' : 'rgba(255,255,255,0.95)',
          color:       showContacts ? '#fff'    : '#374151',
          borderColor: showContacts ? '#4ADE80' : '#e8e7e0',
        }}>
          👥 Contacts
        </button>
      )}

      {/* Légende DPE */}
      {showDpe && (
        <div style={{
          position: 'absolute', bottom: hasContacts ? 244 : 202, right: 10, zIndex: 10,
          background: 'rgba(255,255,255,0.95)', borderRadius: 8,
          padding: '6px 10px', fontSize: 11, lineHeight: 1.9,
          border: '1px solid #e8e7e0', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>
          <div><span style={{ color: '#F59E0B', marginRight: 4 }}>●</span>&lt;2 mois</div>
          <div><span style={{ color: '#86efac', marginRight: 4 }}>●</span>2–12 mois</div>
          <div><span style={{ color: '#9b9b96', marginRight: 4 }}>●</span>&gt;12 mois</div>
        </div>
      )}
    </div>
  )
}
