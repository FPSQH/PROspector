'use client'

import { useEffect, useRef, useCallback } from 'react'
import Supercluster from 'supercluster'

interface Address {
  id: string
  lat: number
  lon: number
  type_bien: string
  zone_id: string | null
  zones_prospection?: { id: string; nom: string; couleur: string; numero: number } | null
}

interface Zone {
  id: string
  nom: string
  couleur: string
  polygone_geojson?: any
}

interface ExplorerMapProps {
  addresses:       Address[]
  zones:           Zone[]
  selectedId:      string | null
  showDvfHeatmap:  boolean
  showDpeLayer:    boolean
  showZones:       boolean
  onAddressClick:  (id: string) => void
  onBoundsChange?: (bounds: { swLat: number; swLon: number; neLat: number; neLon: number }) => void
}

const TYPE_COLORS: Record<string, string> = {
  maison:       '#1D9E75',
  appartement:  '#3B82F6',
  commerce:     '#F59E0B',
  inconnu:      '#94A3B8',
  logement_social: '#A78BFA',
}

export default function ExplorerMap({
  addresses, zones, selectedId,
  showZones, onAddressClick, onBoundsChange,
}: ExplorerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<any[]>([])
  const scRef        = useRef<any>(null)

  const renderClusters = useCallback(() => {
    if (!mapRef.current || !scRef.current) return
    const map   = mapRef.current
    const zoom  = Math.round(map.getZoom())
    const b     = map.getBounds()
    const bbox: [number, number, number, number] = [
      b.getWest(), b.getSouth(), b.getEast(), b.getNorth()
    ]
    const clusters = scRef.current.getClusters(bbox, zoom)

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const mapboxgl = (window as any).mapboxgl
    if (!mapboxgl) return

    for (const feature of clusters) {
      const [lon, lat] = feature.geometry.coordinates
      const el = document.createElement('div')

      if (feature.properties.cluster) {
        const count = feature.properties.point_count
        const size  = count > 100 ? 42 : count > 20 ? 34 : 26
        el.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:#1D9E75;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:${size < 30 ? 10 : 12}px;font-weight:700;
          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;
        `
        el.textContent = count > 999 ? `${Math.round(count / 1000)}k` : String(count)
        el.addEventListener('click', () => {
          const zoom = scRef.current.getClusterExpansionZoom(feature.properties.cluster_id)
          map.easeTo({ center: [lon, lat], zoom: Math.min(zoom, 18) })
        })
      } else {
        const type  = feature.properties.type_bien ?? 'inconnu'
        const color = TYPE_COLORS[type] ?? TYPE_COLORS.inconnu
        const isSelected = feature.properties.id === selectedId
        const size  = isSelected ? 14 : 10
        el.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};
          border:${isSelected ? '3px solid #fff' : '1.5px solid rgba(255,255,255,0.6)'};
          box-shadow:${isSelected ? '0 0 0 3px ' + color : '0 1px 3px rgba(0,0,0,0.4)'};
          cursor:pointer;transition:transform 0.1s;
        `
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onAddressClick(feature.properties.id)
        })
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map)
      markersRef.current.push(marker)
    }
  }, [addresses, selectedId, onAddressClick])

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js'
    document.head.appendChild(script)

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css'
    document.head.appendChild(link)

    script.onload = () => {
      const maplibregl = (window as any).maplibregl
      ;(window as any).mapboxgl = maplibregl

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-2.5, 48.2],
        zoom: 10,
      })

      mapRef.current = map

      map.on('load', () => {
        map.on('moveend', () => {
          renderClusters()
          if (onBoundsChange) {
            const b = map.getBounds()
            onBoundsChange({ swLat: b.getSouth(), swLon: b.getWest(), neLat: b.getNorth(), neLon: b.getEast() })
          }
        })
        renderClusters()
      })
    }

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Update clusters when addresses change
  useEffect(() => {
    if (addresses.length === 0) return

    const features = addresses.map(a => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      properties: { id: a.id, type_bien: a.type_bien },
    }))

    scRef.current = new Supercluster({ radius: 40, maxZoom: 16 })
    scRef.current.load(features)

    if (mapRef.current?.loaded()) {
      // Center on data
      if (addresses.length > 0 && !mapRef.current._centered) {
        const lats = addresses.map(a => a.lat)
        const lons = addresses.map(a => a.lon)
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
        const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2
        mapRef.current.setCenter([centerLon, centerLat])
        mapRef.current._centered = true
      }
      renderClusters()
    }
  }, [addresses, renderClusters])

  // Re-render clusters when selection changes
  useEffect(() => {
    if (mapRef.current?.loaded()) renderClusters()
  }, [selectedId, renderClusters])

  // Zone polygons
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return

    if (map.getLayer('zones-fill'))   map.removeLayer('zones-fill')
    if (map.getLayer('zones-border')) map.removeLayer('zones-border')
    if (map.getSource('zones'))       map.removeSource('zones')

    if (!showZones || zones.length === 0) return

    const features = zones
      .filter(z => z.polygone_geojson)
      .map(z => {
        let geo = z.polygone_geojson
        if (typeof geo === 'string') try { geo = JSON.parse(geo) } catch { return null }
        return { type: 'Feature', geometry: geo, properties: { couleur: z.couleur, nom: z.nom } }
      })
      .filter(Boolean)

    map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features } })
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'couleur'], 'fill-opacity': 0.12 } })
    map.addLayer({ id: 'zones-border', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'couleur'], 'line-width': 1.5, 'line-opacity': 0.7 } })
  }, [zones, showZones])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
