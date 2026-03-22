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
  latitude: number
  longitude: number
  numero?: string
  nom_voie?: string
  type_bien?: string
}

interface ZonesMapProps {
  zones: Zone[]
  selectedZoneId?: string | null
  itineraire?: Adresse[]
  onZoneClick?: (zone: Zone) => void
}

export default function ZonesMap({
  zones,
  selectedZoneId,
  itineraire = [],
  onZoneClick,
}: ZonesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Initialisation MapLibre
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
      map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right')

      map.on('load', () => {
        mapRef.current = map

        // Sources vides — remplies après
        map.addSource('zones-fill', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('zones-outline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('adresses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        // Couches fill
        map.addLayer({
          id: 'zones-fill',
          type: 'fill',
          source: 'zones-fill',
          paint: {
            'fill-color': ['get', 'couleur'],
            'fill-opacity': [
              'case',
              ['==', ['get', 'selected'], true], 0.35,
              0.12,
            ],
          },
        })

        // Couches outline
        map.addLayer({
          id: 'zones-outline',
          type: 'line',
          source: 'zones-outline',
          paint: {
            'line-color': ['get', 'couleur'],
            'line-width': [
              'case',
              ['==', ['get', 'selected'], true], 3,
              1.5,
            ],
            'line-dasharray': [3, 2],
          },
        })

        // Labels zones
        map.addLayer({
          id: 'zone-labels',
          type: 'symbol',
          source: 'labels',
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 13,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-anchor': 'center',
          },
          paint: {
            'text-color': ['get', 'couleur'],
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        })

        // Itinéraire (ligne TSP)
        map.addLayer({
          id: 'itineraire-line',
          type: 'line',
          source: 'itineraire',
          paint: {
            'line-color': '#1a1a18',
            'line-width': 1.5,
            'line-opacity': 0.5,
            'line-dasharray': [2, 3],
          },
        })

        // Points adresses
        map.addLayer({
          id: 'adresses-circle',
          type: 'circle',
          source: 'adresses',
          paint: {
            'circle-radius': 5,
            'circle-color': ['get', 'couleur'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9,
          },
        })

        // Click sur une zone
        map.on('click', 'zones-fill', (e: any) => {
          const zoneId = e.features?.[0]?.properties?.id
          if (zoneId) {
            const zone = zones.find((z) => z.id === zoneId)
            if (zone && onZoneClick) onZoneClick(zone)
          }
        })

        map.on('mouseenter', 'zones-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'zones-fill', () => {
          map.getCanvas().style.cursor = ''
        })

        setMapLoaded(true)
      })
    }

    initMap()

    return () => {
      if (map) map.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mise à jour des zones sur la carte
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    const zonesAvecPolygone = zones.filter((z) => z.polygone_geojson)

    if (zonesAvecPolygone.length === 0) {
      // Pas encore de zones — afficher quand même les adresses si centroïdes
      return
    }

    // Features polygones
    const features = zonesAvecPolygone.map((z) => ({
      type: 'Feature' as const,
      properties: {
        id: z.id,
        nom: z.nom,
        couleur: z.couleur,
        selected: z.id === selectedZoneId,
      },
      geometry: typeof z.polygone_geojson === 'string'
        ? JSON.parse(z.polygone_geojson)
        : z.polygone_geojson,
    }))

    const fc = { type: 'FeatureCollection', features }
    ;(map.getSource('zones-fill') as any)?.setData(fc)
    ;(map.getSource('zones-outline') as any)?.setData(fc)

    // Labels (centroïdes)
    const labelFeatures = zones
      .filter((z) => z.centroide_geojson)
      .map((z) => ({
        type: 'Feature' as const,
        properties: {
          label: `${z.nom}\n${z.nb_prospectables} adresses`,
          couleur: z.couleur,
        },
        geometry: typeof z.centroide_geojson === 'string'
          ? JSON.parse(z.centroide_geojson)
          : z.centroide_geojson,
      }))

    ;(map.getSource('labels') as any)?.setData({
      type: 'FeatureCollection',
      features: labelFeatures,
    })

    // Ajuster la vue
    if (zonesAvecPolygone.length > 0) {
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
    }
  }, [mapLoaded, zones, selectedZoneId])

  // Mise à jour des adresses de la zone sélectionnée + itinéraire
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (itineraire.length === 0) {
      ;(map.getSource('itineraire') as any)?.setData({ type: 'FeatureCollection', features: [] })
      ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    // Couleur de la zone sélectionnée
    const selectedZone = zones.find((z) => z.id === selectedZoneId)
    const couleur = selectedZone?.couleur ?? '#1D9E75'

    // Points adresses
    const adresseFeatures = itineraire
      .filter((a) => a.latitude && a.longitude)
      .map((a, idx) => ({
        type: 'Feature' as const,
        properties: {
          id: a.id,
          label: `${a.numero ?? ''} ${a.nom_voie ?? ''}`.trim(),
          ordre: idx + 1,
          couleur,
        },
        geometry: {
          type: 'Point',
          coordinates: [a.longitude, a.latitude],
        },
      }))

    ;(map.getSource('adresses') as any)?.setData({
      type: 'FeatureCollection',
      features: adresseFeatures,
    })

    // Ligne itinéraire
    const coords = itineraire
      .filter((a) => a.latitude && a.longitude)
      .map((a) => [a.longitude, a.latitude])

    ;(map.getSource('itineraire') as any)?.setData({
      type: 'FeatureCollection',
      features: coords.length >= 2
        ? [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          }]
        : [],
    })

    // Zoomer sur la zone sélectionnée
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
          background: '#f8f7f4',
          fontSize: '0.875rem', color: '#9b9b96',
        }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  )
}
