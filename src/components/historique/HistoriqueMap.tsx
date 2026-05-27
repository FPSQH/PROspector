'use client'

import { useEffect, useRef } from 'react'

export interface VisitedAddress {
  id: string
  lat: number
  lon: number
  label?: string
  resultat?: string | null
  action?: string | null
}

const OSM_STYLE: any = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attribution: '© OpenStreetMap contributors',
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 }],
}

function getColor(resultat?: string | null, action?: string | null): string {
  if (resultat === 'contact_etabli' || resultat === 'contact') return '#4ADE80'
  if (action === 'flyer_depose' || action === 'courrier_depose' || action === 'boite') return '#FBBF24'
  return '#6B7280'
}

function buildGeoJSON(pts: VisitedAddress[]) {
  return {
    type: 'FeatureCollection' as const,
    features: pts.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      properties: { id: p.id, color: getColor(p.resultat, p.action) },
    })),
  }
}

function fitBounds(map: any, pts: VisitedAddress[]) {
  const valid = pts.filter(p => p.lat && p.lon)
  if (!valid.length) return
  if (valid.length === 1) {
    map.flyTo({ center: [valid[0].lon, valid[0].lat], zoom: 16, duration: 400 })
    return
  }
  const lons = valid.map(p => p.lon)
  const lats = valid.map(p => p.lat)
  map.fitBounds(
    [[Math.min(...lons) - 0.003, Math.min(...lats) - 0.003], [Math.max(...lons) + 0.003, Math.max(...lats) + 0.003]],
    { padding: 48, duration: 400 }
  )
}

export default function HistoriqueMap({ adresses }: { adresses: VisitedAddress[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current || typeof window === 'undefined') return
    let cancelled = false

    ;(async () => {
      const ml = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')
      if (cancelled || !containerRef.current) return

      const map = new ml.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center: [2.35, 46.85],
        zoom: 5,
      })
      mapRef.current = map

      map.on('load', () => {
        const geojson = buildGeoJSON(adresses)
        map.addSource('visits', { type: 'geojson', data: geojson })

        map.addLayer({
          id: 'visits-shadow',
          type: 'circle',
          source: 'visits',
          paint: {
            'circle-radius': 12,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.15,
            'circle-blur': 0.6,
          },
        })

        map.addLayer({
          id: 'visits-dot',
          type: 'circle',
          source: 'visits',
          paint: {
            'circle-radius': 7,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
          },
        })

        fitBounds(map, adresses)
      })
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
