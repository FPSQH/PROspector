'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  communesInsee: string[]
  height?: number | string
}

const TYPE_COLORS: Record<string, string> = {
  maison:          '#22c55e',
  appartement:     '#3b82f6',
  commerce:        '#f59e0b',
  logement_social: '#6b7280',
  inconnu:         '#d1d5db',
}

export function SecteurMap({ communesInsee, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [nbPoints, setNbPoints]   = useState(0)

  // Charger les adresses SANS limite (pagination 1000 par batch)
  const loadAdresses = useCallback(async (map: any, codesInsee: string[]) => {
    if (codesInsee.length === 0) return

    const supabase = createClient()
    const allAdresses: any[] = []
    const PAGE = 1000
    let from = 0

    // Pagination pour contourner la limite Supabase de 1000 lignes
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, latitude, longitude, type_bien, numero, nom_voie')
        .in('code_insee', codesInsee)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(from, from + PAGE - 1)

      if (error || !data || data.length === 0) break
      allAdresses.push(...data)
      if (data.length < PAGE) break // dernière page
      from += PAGE
    }

    if (allAdresses.length === 0) return

    setNbPoints(allAdresses.length)

    const features = allAdresses.map((a) => ({
      type: 'Feature' as const,
      properties: {
        id:        a.id,
        type_bien: a.type_bien ?? 'inconnu',
        label:     `${a.numero ?? ''} ${a.nom_voie ?? ''}`.trim(),
        couleur:   TYPE_COLORS[a.type_bien ?? 'inconnu'] ?? TYPE_COLORS.inconnu,
      },
      geometry: {
        type: 'Point',
        coordinates: [a.longitude, a.latitude],
      },
    }))

    const geojson = { type: 'FeatureCollection', features }

    // Source déjà existante → mettre à jour, sinon créer
    if (map.getSource('adresses')) {
      ;(map.getSource('adresses') as any).setData(geojson)
    } else {
      map.addSource('adresses', { type: 'geojson', data: geojson, cluster: true, clusterRadius: 40, clusterMaxZoom: 14 })

      // Clusters
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'adresses',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1D9E75',
          'circle-radius': ['step', ['get', 'point_count'], 18, 50, 24, 200, 30],
          'circle-opacity': 0.85,
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'adresses',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#fff' },
      })

      // Points individuels
      map.addLayer({
        id: 'adresses-points',
        type: 'circle',
        source: 'adresses',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'couleur'],
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9,
        },
      })

      // Popup au clic
      map.on('click', 'adresses-points', (e: any) => {
        const f = e.features?.[0]
        if (!f) return
        const [lon, lat] = (f.geometry as any).coordinates
        new (window as any).maplibregl.Popup({ offset: 10 })
          .setLngLat([lon, lat])
          .setHTML(`<div style="font-size:0.8rem;padding:4px 6px">${f.properties.label || f.properties.type_bien}</div>`)
          .addTo(map)
      })

      // Zoom sur cluster
      map.on('click', 'clusters', (e: any) => {
        const f = e.features?.[0]
        if (!f) return
        const src = map.getSource('adresses') as any
        src.getClusterExpansionZoom(f.properties.cluster_id, (_: any, zoom: number) => {
          map.easeTo({ center: (f.geometry as any).coordinates, zoom })
        })
      })
    }

    // Ajuster la vue sur les adresses
    const lons = allAdresses.map((a) => a.longitude)
    const lats = allAdresses.map((a) => a.latitude)
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 40, duration: 500 }
    )
  }, [])

  // Init carte
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

      map.addControl(new ml.NavigationControl(), 'top-right')

      map.on('load', () => {
        mapRef.current = map
        setMapLoaded(true)
      })
    }

    init()
    return () => { if (map) map.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recharger les adresses quand les communes changent
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || communesInsee.length === 0) return
    loadAdresses(mapRef.current, communesInsee)
  }, [mapLoaded, communesInsee, loadAdresses])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Badge compteur */}
      {nbPoints > 0 && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(6px)',
          borderRadius: 8, padding: '5px 10px',
          fontSize: '0.75rem', color: '#5F5E5A',
          border: '1px solid #e8e7e0',
          pointerEvents: 'none',
        }}>
          📍 {nbPoints.toLocaleString('fr-FR')} adresses chargées
        </div>
      )}

      {/* Légende */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(6px)',
        borderRadius: 8, padding: '8px 12px',
        fontSize: '0.72rem', color: '#5F5E5A',
        border: '1px solid #e8e7e0',
        pointerEvents: 'none',
      }}>
        {Object.entries({ maison: 'Maison', appartement: 'Appartement', commerce: 'Commerce', logement_social: 'Log. social' }).map(([k, label]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[k] }}/>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {!mapLoaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8f7f4', borderRadius: 12,
          fontSize: '0.875rem', color: '#9b9b96',
        }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  )
}
