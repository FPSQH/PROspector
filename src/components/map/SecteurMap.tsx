'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Adresse } from '@/types/database'

interface Props {
  communesInsee: string[]
  height?: string
}

const TYPE_COLORS: Record<string, string> = {
  maison:          '#1D9E75',
  appartement:     '#378ADD',
  commerce:        '#EF9F27',
  logement_social: '#888780',
  inconnu:         '#B4B2A9',
}

type MapLayer = 'plan' | 'satellite'

export function SecteurMap({ communesInsee, height = '100%' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [adresses, setAdresses] = useState<Adresse[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ total: 0, prospectables: 0, sociaux: 0 })
  const [activeLayer, setActiveLayer] = useState<MapLayer>('plan')
  const [cadastreVisible, setCadastreVisible] = useState(false)

  // Charger les adresses depuis Supabase
  useEffect(() => {
    if (communesInsee.length === 0) { setLoading(false); return }
    const supabase = createClient()
    supabase
      .from('adresses')
      .select('id, lat, lon, type_bien, prospectable, commune, numero, nom_voie')
      .in('code_insee', communesInsee)
      .then(({ data }) => {
        const list = data ?? []
        setAdresses(list)
        setCounts({
          total: list.length,
          prospectables: list.filter(a => a.prospectable).length,
          sociaux: list.filter(a => a.type_bien === 'logement_social').length,
        })
        setLoading(false)
      })
  }, [communesInsee])

  // Initialiser la carte MapLibre avec Plan IGN
  useEffect(() => {
    if (loading || !containerRef.current || mapRef.current) return
    if (adresses.length === 0) return

    import('maplibre-gl').then(({ default: maplibregl }) => {
      const avgLat = adresses.reduce((s, a) => s + a.lat, 0) / adresses.length
      const avgLon = adresses.reduce((s, a) => s + a.lon, 0) / adresses.length

      const map = new maplibregl.Map({
        container: containerRef.current!,
        // Plan IGN vectoriel — gratuit, sans clé, en français
       style: {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
},
        center: [avgLon, avgLat],
        zoom: 13,
      })

      mapRef.current = map

      map.on('load', () => {
        // --- Calque satellite (masqué par défaut) ---
        map.addSource('satellite', {
          type: 'raster',
          tiles: [
            'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&STYLE=normal&FORMAT=image/jpeg'
          ],
          tileSize: 256,
          attribution: '© IGN Géoportail',
        })
        map.addLayer({
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 1 },
        }, map.getStyle().layers?.[0]?.id) // Sous tous les autres layers

        // --- Calque cadastre PCI (masqué par défaut) ---
        map.addSource('cadastre', {
          type: 'raster',
          tiles: [
           'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&STYLE=normal&FORMAT=image/png'
          ],
          tileSize: 256,
          attribution: '© IGN — Parcellaire Express (PCI)',
        })
        map.addLayer({
          id: 'cadastre-layer',
          type: 'raster',
          source: 'cadastre',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0.6 },
        })

        // --- Source adresses ---
        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: adresses.map(a => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
            properties: {
              id: a.id,
              type_bien: a.type_bien,
              prospectable: a.prospectable,
              label: `${a.numero ?? ''} ${a.nom_voie}, ${a.commune}`.trim(),
            },
          })),
        }

        map.addSource('adresses', {
          type: 'geojson',
          data: geojson,
          cluster: true,
          clusterMaxZoom: 14,
        })

        // Clusters
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'adresses',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#1D9E75',
            'circle-radius': ['step', ['get', 'point_count'], 16, 50, 22, 200, 28],
            'circle-opacity': 0.85,
          },
        })

        // Compteur clusters
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'adresses',
          filter: ['has', 'point_count'],
          layout: {
            'text-font': ['Open Sans Bold'],
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
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
            'circle-radius': 5,
            'circle-color': [
              'match', ['get', 'type_bien'],
              'maison',          '#1D9E75',
              'appartement',     '#378ADD',
              'commerce',        '#EF9F27',
              'logement_social', '#888780',
              '#B4B2A9',
            ],
            'circle-opacity': ['case', ['get', 'prospectable'], 0.9, 0.35],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          },
        })

        // Popup au clic
        map.on('click', 'adresses-points', (e: any) => {
          const props = e.features[0].properties
          new maplibregl.Popup({ closeButton: false, offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-size:13px;padding:4px 2px;min-width:160px">
                <div style="font-weight:600;margin-bottom:4px">${props.label}</div>
                <div style="color:#5F5E5A">
                  ${props.type_bien !== 'inconnu' ? props.type_bien.replace('_', ' ') : 'Type non défini'}
                  ${!props.prospectable ? ' · <span style="color:#888">Non prospectable</span>' : ''}
                </div>
              </div>
            `)
            .addTo(map)
        })

        // Clic cluster → zoom
        map.on('click', 'clusters', (e: any) => {
          e.preventDefault()
          const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
          if (!features.length) return
          const clusterId = features[0].properties.cluster_id
          const coords = (features[0].geometry as any).coordinates
          ;(map.getSource('adresses') as any).getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return
            map.easeTo({ center: coords, zoom: Math.min(zoom, 16), duration: 500 })
          })
        })

        map.on('mouseenter', 'adresses-points', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'adresses-points', () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'clusters',        () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'clusters',        () => { map.getCanvas().style.cursor = '' })

        // Ajuster la vue
        if (adresses.length > 0) {
          const lons = adresses.map(a => a.lon)
          const lats = adresses.map(a => a.lat)
          map.fitBounds([
            [Math.min(...lons) - 0.005, Math.min(...lats) - 0.005],
            [Math.max(...lons) + 0.005, Math.max(...lats) + 0.005],
          ], { padding: 40, maxZoom: 15 })
        }
      })
    })

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [adresses, loading])

 // Basculer entre Plan IGN et Satellite
useEffect(() => {
  const map = mapRef.current
  if (!map || !map.isStyleLoaded()) return
  try {
    map.setLayoutProperty(
      'satellite-layer', 'visibility',
      activeLayer === 'satellite' ? 'visible' : 'none'
    )
    map.setLayoutProperty(
      'osm', 'visibility',
      activeLayer === 'satellite' ? 'none' : 'visible'
    )
  } catch {}
}, [activeLayer])

  // Afficher/masquer le cadastre
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try {
      map.setLayoutProperty(
        'cadastre-layer', 'visibility',
        cadastreVisible ? 'visible' : 'none'
      )
    } catch {}
  }, [cadastreVisible])

  if (communesInsee.length === 0) {
    return (
      <div style={{
        height, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#f8f7f4', borderRadius: 12, gap: 8,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="1.5">
          <path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
        <p style={{ fontSize: '0.875rem', color: '#9b9b96' }}>Ajoutez des communes pour voir la carte</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}/>

      {/* Chargement */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(248,247,244,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, fontSize: '0.875rem', color: '#5F5E5A',
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2.5px solid #d1d0c8', borderTopColor: '#1D9E75',
            animation: 'spin 0.7s linear infinite',
          }}/>
          Chargement des adresses…
        </div>
      )}

      {/* Boutons de calque — haut gauche */}
      {!loading && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {/* Toggle Plan / Satellite */}
          <div style={{
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 8, overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            display: 'flex',
          }}>
            {(['plan', 'satellite'] as MapLayer[]).map(layer => (
              <button
                key={layer}
                onClick={() => setActiveLayer(layer)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.72rem',
                  fontWeight: activeLayer === layer ? 600 : 400,
                  color: activeLayer === layer ? '#fff' : '#5F5E5A',
                  background: activeLayer === layer ? '#1D9E75' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {layer === 'plan' ? '🗺 Plan IGN' : '🛰 Satellite'}
              </button>
            ))}
          </div>

          {/* Toggle Cadastre */}
          <button
            onClick={() => setCadastreVisible(v => !v)}
            style={{
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: cadastreVisible ? 600 : 400,
              color: cadastreVisible ? '#fff' : '#5F5E5A',
              background: cadastreVisible ? '#EF9F27' : 'rgba(255,255,255,0.95)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              transition: 'all 0.15s',
              textAlign: 'left',
            }}
          >
            🏡 Cadastre
          </button>
        </div>
      )}

      {/* Compteurs — bas gauche */}
      {!loading && adresses.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 8, padding: '6px 10px',
          fontSize: '0.75rem', color: '#5F5E5A',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          display: 'flex', gap: 10,
        }}>
          <span><strong style={{ color: '#1D9E75' }}>{counts.prospectables.toLocaleString('fr-FR')}</strong> prospectables</span>
          {counts.sociaux > 0 && <span><strong style={{ color: '#888780' }}>{counts.sociaux.toLocaleString('fr-FR')}</strong> sociaux</span>}
          <span style={{ color: '#B4B2A9' }}>{counts.total.toLocaleString('fr-FR')} total</span>
        </div>
      )}

      {/* Légende — bas droite */}
      {!loading && adresses.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 8, padding: '8px 10px',
          fontSize: '0.7rem', color: '#5F5E5A',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}/>
              <span>{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
