'use client'

import { useEffect, useRef, useState } from 'react'

interface Adresse {
  id: string
  lat: number
  lon: number
  numero?: string
  nom_voie?: string
  type_bien?: string
  prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite'
  ordre: number
  score?: number
  latest_dpe_date?: string | null
  type_habitat?: string
  mode_prospection?: string
  statut_prospectabilite?: string
  nom_syndic?: string
  nb_bal?: number
}

const STATUT_COLOR: Record<string, string> = {
  a_faire: '#ef4444',
  boite:   '#3b82f6',
  contact: '#22c55e',
  visite:  '#9b9b96',
}

interface Props {
  adresses:           Adresse[]
  zonePolygon:        any
  prochaineAdresseId: string | null
  onAdresseClick:     (adresse: Adresse) => void
}

export default function TerrainMap({ adresses, zonePolygon, prochaineAdresseId, onAdresseClick }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const adressesRef   = useRef<Adresse[]>([])
  const onClickRef    = useRef<(a: Adresse) => void>(onAdresseClick)
  const watchIdRef    = useRef<number | null>(null)
  const [mapLoaded, setMapLoaded]     = useState(false)
  const [satellite, setSatellite]     = useState(false)
  const [gpsActive, setGpsActive]     = useState(false)
  const [gpsError, setGpsError]       = useState(false)

  useEffect(() => { adressesRef.current = adresses }, [adresses])
  useEffect(() => { onClickRef.current = onAdresseClick }, [onAdresseClick])

  // ── Init carte ──────────────────────────────────────────────────
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

        // Source adresses
        map.addSource('adresses', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        // Source GPS
        map.addSource('gps', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        // Source itinéraire
        map.addSource('itineraire', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        // Layer itinéraire (en dessous des points)
        map.addLayer({
          id: 'itineraire-line', type: 'line', source: 'itineraire',
          paint: {
            'line-color': '#9b9b96', 'line-width': 1.5,
            'line-dasharray': [3, 3], 'line-opacity': 0.6,
          },
        })

        // Layer points adresses — grand rayon tactile
        map.addLayer({
          id: 'adresses-touch', type: 'circle', source: 'adresses',
          paint: {
            'circle-radius': 18,
            'circle-color': 'transparent',
            'circle-opacity': 0,
          },
        })


        // Layer aura DPE (cercle extérieur pour DPE récents) — DOIT être avant le layer principal
        map.addLayer({
          id: 'dpe-aura',
          type: 'circle',
          source: 'adresses',
          filter: ['in', ['get', 'dpe_signal'], ['literal', ['hot', 'warm']]],
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'dpe_signal'], 'hot'], 18,
              14,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'dpe_signal'], 'hot'], '#F97316',
              '#ef4444',
            ],
            'circle-opacity': 0.25,
            'circle-stroke-width': 0,
          },
        })

        // Layer points adresses — visuel
        map.addLayer({
          id: 'adresses-circle', type: 'circle', source: 'adresses',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'prochaine'], true], 14,
              ['==', ['get', 'dpe_signal'], 'hot'],    12,
              ['==', ['get', 'dpe_signal'], 'warm'],   11,
              ['==', ['get', 'dpe_signal'], 'recent'], 10,
              ['>=', ['get', 'score'], 80], 11,
              ['>=', ['get', 'score'], 60], 9,
              ['==', ['get', 'statut'], 'a_faire'], 8,
              6,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'dpe_signal'], 'hot'],    '#F97316',
              ['==', ['get', 'dpe_signal'], 'warm'],   ['get', 'couleur'],
              ['==', ['get', 'dpe_signal'], 'recent'], '#F59E0B',
              ['get', 'couleur'],
            ],
            'circle-stroke-width': ['case', ['==', ['get', 'prochaine'], true], 3, 2],
            'circle-stroke-color': ['case', ['==', ['get', 'prochaine'], true], '#ffffff', '#fff'],
            'circle-opacity': ['case', ['==', ['get', 'prospectable'], false], 0.4, 1],
          },
        })

        // Layer pulsation prochaine adresse
        map.addLayer({
          id: 'adresses-prochaine-pulse', type: 'circle', source: 'adresses',
          filter: ['==', ['get', 'prochaine'], true],
          paint: {
            'circle-radius': 20,
            'circle-color': '#ef4444',
            'circle-opacity': 0.2,
          },
        })

        // Layer GPS — point bleu pulsant
        map.addLayer({
          id: 'gps-pulse', type: 'circle', source: 'gps',
          paint: {
            'circle-radius': 12,
            'circle-color': '#3b82f6',
            'circle-opacity': 0.2,
          },
        })
        map.addLayer({
          id: 'gps-dot', type: 'circle', source: 'gps',
          paint: {
            'circle-radius': 6,
            'circle-color': '#3b82f6',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        })

        // Click sur adresse (utilise la zone tactile large)
        map.on('click', 'adresses-touch', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          const adresse = adressesRef.current.find((a) => a.id === f.properties.id)
          if (adresse) onClickRef.current(adresse)
        })
        map.on('mouseenter', 'adresses-touch', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'adresses-touch', () => { map.getCanvas().style.cursor = '' })

        setMapLoaded(true)
      })
    }

    init()
    
        // Animation pulse pour DPE hot (< 1 mois) et warm (1-3 mois)
        let animFrame: number;
        const animatePulse = () => {
          const t = (Date.now() % 1500) / 1500; // cycle de 1.5s
          const pulse = 0.1 + 0.3 * Math.abs(Math.sin(t * Math.PI));
          try {
            map.setPaintProperty('dpe-aura', 'circle-opacity', pulse);
          } catch {}
          animFrame = requestAnimationFrame(animatePulse);
        };
        animatePulse();

        return () => {
          if (animFrame) cancelAnimationFrame(animFrame);
      if (map) map.remove()
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mise à jour des adresses sur la carte ──────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    const pId = prochaineAdresseId
    const features = adresses
      .filter((a) => a.lat && a.lon)
      .map((a) => ({
        type: 'Feature' as const,
        properties: {
          id:           a.id,
          statut:       a.statut_carte,
          couleur:      STATUT_COLOR[a.statut_carte] ?? '#9b9b96',
          prospectable: a.prospectable !== false,
          label:        [a.numero, a.nom_voie].filter(Boolean).join(' '),
          prochaine:    a.id === pId,
          score:        a.score ?? 50,
          dpe_signal:   (() => {
            if (!a.latest_dpe_date) return null;
            const days = (Date.now() - new Date(a.latest_dpe_date).getTime()) / 86400000;
            if (days <= 30) return 'hot';
            if (days <= 90) return 'warm';
            if (days <= 365) return 'recent';
            return null;
          })(),
        },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      }))

    ;(map.getSource('adresses') as any)?.setData({
      type: 'FeatureCollection', features,
    })

    // Itinéraire : relier les adresses dans l'ordre
    const sorted = [...adresses].filter((a) => a.lat && a.lon).sort((a, b) => a.ordre - b.ordre)
    if (sorted.length >= 2) {
      const coords = sorted.map((a) => [a.lon, a.lat])
      ;(map.getSource('itineraire') as any)?.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }],
      })
    }

    // Centrer sur la prochaine adresse si définie, sinon sur toute la zone
    if (prochaineAdresseId && !gpsActive) {
      const prochaine = adresses.find((a) => a.id === prochaineAdresseId)
      if (prochaine?.lat && prochaine?.lon) {
        map.easeTo({ center: [prochaine.lon, prochaine.lat], zoom: 17, duration: 500 })
      }
    } else if (adresses.length > 0 && !gpsActive) {
      const lons = adresses.filter((a) => a.lon).map((a) => a.lon)
      const lats = adresses.filter((a) => a.lat).map((a) => a.lat)
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 60, duration: 600, maxZoom: 17 }
      )
    }
  }, [mapLoaded, adresses])

  // ── Satellite toggle ───────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    map.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none')
    map.setLayoutProperty('osm',       'visibility', satellite ? 'none'    : 'visible')
  }, [mapLoaded, satellite])

  // ── GPS ────────────────────────────────────────────────────────
  const startGPS = () => {
    if (!navigator.geolocation) { setGpsError(true); return }
    setGpsActive(true)
    setGpsError(false)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords
        if (!mapRef.current) return

        ;(mapRef.current.getSource('gps') as any)?.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature', properties: {},
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
          }],
        })
        mapRef.current.panTo([longitude, latitude], { duration: 500 })
      },
      () => { setGpsError(true); setGpsActive(false) },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  const stopGPS = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGpsActive(false)
    ;(mapRef.current?.getSource('gps') as any)?.setData({ type: 'FeatureCollection', features: [] })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Boutons flottants */}
      <div style={{
        position: 'absolute', bottom: 24, right: 12,
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
      }}>
        {/* GPS */}
        <button
          onClick={gpsActive ? stopGPS : startGPS}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: gpsError ? '#fef2f2' : gpsActive ? '#3b82f6' : '#fff',
            border: `1px solid ${gpsError ? '#fecaca' : gpsActive ? '#3b82f6' : '#e8e7e0'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={gpsError ? '#dc2626' : gpsActive ? '#fff' : '#5F5E5A'}
            strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>
          </svg>
        </button>

        {/* Satellite */}
        <button
          onClick={() => setSatellite((v) => !v)}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: satellite ? '#1a1a18' : '#fff',
            border: `1px solid ${satellite ? '#1a1a18' : '#e8e7e0'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={satellite ? '#fff' : '#5F5E5A'}
            strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </button>
      </div>

      {!mapLoaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8f7f4', fontSize: '0.875rem', color: '#9b9b96',
        }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  )
}
