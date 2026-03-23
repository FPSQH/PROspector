'use client'

import { useEffect, useRef, useState } from 'react'

interface Zone {
  id: string
  nom: string
  couleur: string
  numero: number
  nb_adresses: number
  nb_prospectables: number
  polygone_geojson?: any
  centroide_geojson?: any
}

interface Adresse {
  id: string
  lat: number
  lon: number
  numero?: string
  nom_voie?: string
  type_bien?: string
}

interface Chevauchement {
  zone_a_id:   string
  zone_b_id:   string
  nb_adresses: number
}

interface ZonesMapProps {
  zones:           Zone[]
  selectedZoneId?: string | null
  itineraire?:     Adresse[]
  chevauchements?: Chevauchement[]
  onZoneClick?:    (zone: Zone) => void
}

export default function ZonesMap({
  zones, selectedZoneId, itineraire = [], chevauchements = [], onZoneClick,
}: ZonesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const conflictIds = new Set(
    chevauchements.flatMap((c) => [c.zone_a_id, c.zone_b_id])
  )

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    let map: any

    const initMap = async () => {
      const maplibre = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')

      map = new maplibre.Map({
        container: mapContainer.current!,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
              maxzoom: 19,
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [2.5, 46.8],
        zoom: 5,
        attributionControl: false,
      })

      map.addControl(new maplibre.NavigationControl(), 'top-right')

      map.on('load', () => {
        mapRef.current = map

        map.addSource('zones-fill',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-outline',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-conflict', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('labels',         { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('adresses',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('hors-zone',      { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        map.addLayer({
          id: 'zones-fill', type: 'fill', source: 'zones-fill',
          paint: {
            'fill-color':   ['get', 'couleur'],
            'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.35, 0.12],
          },
        })
        map.addLayer({
          id: 'zones-outline', type: 'line', source: 'zones-outline',
          paint: {
            'line-color':      ['get', 'couleur'],
            'line-width':      ['case', ['==', ['get', 'selected'], true], 3, 1.5],
            'line-dasharray':  [3, 2],
          },
        })

        // Surlignage rouge pour les zones en conflit
        map.addLayer({
          id: 'zones-conflict-fill', type: 'fill', source: 'zones-conflict',
          paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.15 },
        })
        map.addLayer({
          id: 'zones-conflict-outline', type: 'line', source: 'zones-conflict',
          paint: { 'line-color': '#ef4444', 'line-width': 2.5 },
        })

        // Labels permanents (visibles à partir du zoom 11)
        map.addLayer({
          id: 'zone-labels', type: 'symbol', source: 'labels',
          minzoom: 11,
          layout: {
            'text-field':       ['get', 'label'],
            'text-size':        13,
            'text-font':        ['Open Sans Regular'],
            'text-anchor':      'center',
            'text-max-width':   8,
            'text-line-height': 1.3,
          },
          paint: {
            'text-color':      ['get', 'couleur'],
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        })

        map.addLayer({
          id: 'itineraire-line', type: 'line', source: 'itineraire',
          paint: {
            'line-color': '#1a1a18', 'line-width': 1.5,
            'line-opacity': 0.5, 'line-dasharray': [2, 3],
          },
        })
        map.addLayer({
          id: 'hors-zone-circle', type: 'circle', source: 'hors-zone',
          paint: { 'circle-radius': 4, 'circle-color': '#9b9b96', 'circle-opacity': 0.4 },
        })
        map.addLayer({
          id: 'adresses-circle', type: 'circle', source: 'adresses',
          paint: {
            'circle-radius':       5,
            'circle-color':        ['get', 'couleur'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity':      0.9,
          },
        })

        map.on('click', 'zones-fill', (e: any) => {
          const zoneId = e.features?.[0]?.properties?.id
          if (zoneId) {
            const zone = zones.find((z) => z.id === zoneId)
            if (zone && onZoneClick) onZoneClick(zone)
          }
        })
        map.on('mouseenter', 'zones-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'zones-fill', () => { map.getCanvas().style.cursor = '' })

        setMapLoaded(true)
      })
    }

    initMap()
    return () => { if (map) map.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mettre à jour les zones + chevauchements + labels
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const zonesAvecPolygone = zones.filter((z) => z.polygone_geojson)
    if (zonesAvecPolygone.length === 0) return

    const features = zonesAvecPolygone.map((z) => ({
      type: 'Feature' as const,
      properties: { id: z.id, nom: z.nom, couleur: z.couleur, selected: z.id === selectedZoneId },
      geometry: typeof z.polygone_geojson === 'string'
        ? JSON.parse(z.polygone_geojson) : z.polygone_geojson,
    }))
    const fc = { type: 'FeatureCollection', features }
    ;(map.getSource('zones-fill') as any)?.setData(fc)
    ;(map.getSource('zones-outline') as any)?.setData(fc)

    // Zones en conflit
    const conflictFeatures = zonesAvecPolygone
      .filter((z) => conflictIds.has(z.id))
      .map((z) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: typeof z.polygone_geojson === 'string'
          ? JSON.parse(z.polygone_geojson) : z.polygone_geojson,
      }))
    ;(map.getSource('zones-conflict') as any)?.setData({
      type: 'FeatureCollection', features: conflictFeatures,
    })

    // Labels
    const labelFeatures = zones.filter((z) => z.centroide_geojson).map((z) => ({
      type: 'Feature' as const,
      properties: {
        label:   conflictIds.has(z.id)
          ? `${z.nom}\n${z.nb_prospectables} adr. ⚠`
          : `${z.nom}\n${z.nb_prospectables} adr.`,
        couleur: conflictIds.has(z.id) ? '#ef4444' : z.couleur,
      },
      geometry: typeof z.centroide_geojson === 'string'
        ? JSON.parse(z.centroide_geojson) : z.centroide_geojson,
    }))
    ;(map.getSource('labels') as any)?.setData({
      type: 'FeatureCollection', features: labelFeatures,
    })

    const allCoords: [number, number][] = []
    for (const f of features) {
      const coords = f.geometry?.coordinates?.[0]
      if (coords) allCoords.push(...coords)
    }
    if (allCoords.length > 0) {
      const lons = allCoords.map((c) => c[0])
      const lats = allCoords.map((c) => c[1])
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 60, duration: 600 }
      )
    }
  }, [mapLoaded, zones, selectedZoneId, chevauchements])

  // Mettre à jour l'itinéraire
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (itineraire.length === 0) {
      ;(map.getSource('itineraire') as any)?.setData({ type: 'FeatureCollection', features: [] })
      ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const selectedZone = zones.find((z) => z.id === selectedZoneId)
    const couleur = selectedZone?.couleur ?? '#1D9E75'

    const adresseFeatures = itineraire.filter((a) => a.lat && a.lon).map((a, idx) => ({
      type: 'Feature' as const,
      properties: { id: a.id, ordre: idx + 1, couleur },
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
    }))
    ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features: adresseFeatures })

    const coords = itineraire.filter((a) => a.lat && a.lon).map((a) => [a.lon, a.lat])
    ;(map.getSource('itineraire') as any)?.setData({
      type: 'FeatureCollection',
      features: coords.length >= 2
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
        : [],
    })

    if (coords.length > 0) {
      const lons = coords.map((c) => c[0])
      const lats = coords.map((c) => c[1])
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 80, duration: 500, maxZoom: 16 }
      )
    }
  }, [mapLoaded, itineraire, selectedZoneId, zones])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
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
