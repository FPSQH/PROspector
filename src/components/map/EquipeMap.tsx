'use client'

import { useEffect, useRef, useState } from 'react'

// Palette de couleurs distinctes par commercial (max 10 membres)
const PALETTE = [
  '#1D9E75', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7',
  '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#6366F1',
]

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

export interface EquipeMembre {
  id: string
  nom: string
  prenom: string
  zones: EquipeZone[]
}

export interface EquipeZone {
  id: string
  nom: string
  numero: number
  polygone_geojson: any
  centroide_geojson: any
  nb_adresses: number
}

function parseGeo(v: any) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

interface Props {
  equipe: EquipeMembre[]
}

export default function EquipeMap({ equipe }: Props) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [tooltip, setTooltip] = useState<{ nom: string; commercial: string; nb: number } | null>(null)

  const colorOf = (idx: number) => PALETTE[idx % PALETTE.length]!

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    import('maplibre-gl').then(({ default: maplibregl }) => {
      import('maplibre-gl/dist/maplibre-gl.css')

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: OSM_STYLE,
        center: [2.35, 46.5],
        zoom: 5.5,
      })
      mapRef.current = map

      map.on('load', () => {
        // Construire les features pour chaque membre
        equipe.forEach((membre, idx) => {
          const color = colorOf(idx)
          const sourceId = `zones-${membre.id}`

          const features = membre.zones
            .map(z => {
              const geo = parseGeo(z.polygone_geojson)
              if (!geo) return null
              return {
                type: 'Feature' as const,
                geometry: geo,
                properties: {
                  zoneId:     z.id,
                  zoneNom:    z.nom,
                  numero:     z.numero,
                  commercial: `${membre.prenom} ${membre.nom}`,
                  nb:         z.nb_adresses,
                },
              }
            })
            .filter(Boolean)

          const labelFeatures = membre.zones
            .map(z => {
              const geo = parseGeo(z.centroide_geojson)
              if (!geo) return null
              return {
                type: 'Feature' as const,
                geometry: geo,
                properties: { label: `Z${z.numero}` },
              }
            })
            .filter(Boolean)

          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: features as any },
          })

          map.addSource(`labels-${membre.id}`, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: labelFeatures as any },
          })

          map.addLayer({
            id: `fill-${membre.id}`,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': color,
              'fill-opacity': 0.18,
            },
          })

          map.addLayer({
            id: `outline-${membre.id}`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': color,
              'line-width': 2,
              'line-opacity': 0.9,
            },
          })

          map.addLayer({
            id: `label-${membre.id}`,
            type: 'symbol',
            source: `labels-${membre.id}`,
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-font': ['Open Sans Regular'],
            },
            paint: {
              'text-color': color,
              'text-halo-color': '#111827',
              'text-halo-width': 1.5,
            },
          })

          // Hover tooltip
          map.on('mousemove', `fill-${membre.id}`, (e: any) => {
            map.getCanvas().style.cursor = 'pointer'
            const p = e.features?.[0]?.properties
            if (p) setTooltip({ nom: p.zoneNom, commercial: p.commercial, nb: p.nb })
          })
          map.on('mouseleave', `fill-${membre.id}`, () => {
            map.getCanvas().style.cursor = ''
            setTooltip(null)
          })
        })

        // Fit bounds to all zones
        const allCoords: [number, number][] = []
        equipe.forEach(m => {
          m.zones.forEach(z => {
            const geo = parseGeo(z.polygone_geojson)
            if (!geo) return
            const coords = geo.coordinates?.[0] ?? []
            coords.forEach((c: [number, number]) => allCoords.push(c))
          })
        })

        if (allCoords.length > 0) {
          const lons = allCoords.map(c => c[0])
          const lats = allCoords.map(c => c[1])
          map.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: 60, maxZoom: 13 }
          )
        }
      })
    })

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Afficher/masquer les layers d'un commercial
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    equipe.forEach(membre => {
      const vis = hidden.has(membre.id) ? 'none' : 'visible'
      ;[`fill-${membre.id}`, `outline-${membre.id}`, `label-${membre.id}`].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
      })
    })
  }, [hidden, equipe])

  const toggle = (id: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Légende */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        background: 'rgba(17,24,39,0.92)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, padding: '12px 14px', minWidth: 180,
        backdropFilter: 'blur(6px)',
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.06em' }}>
          Équipe
        </div>
        {equipe.map((m, idx) => {
          const color = colorOf(idx)
          const isHidden = hidden.has(m.id)
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 0', marginBottom: 2,
                opacity: isHidden ? 0.4 : 1,
              }}
            >
              <span style={{
                width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                background: color,
              }} />
              <span style={{ fontSize: '0.82rem', color: '#F0F0F2', textAlign: 'left' }}>
                {m.prenom} {m.nom}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#6B6B7B', marginLeft: 'auto' }}>
                {m.zones.length}z
              </span>
            </button>
          )
        })}
      </div>

      {/* Tooltip hover */}
      {tooltip && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '8px 14px', pointerEvents: 'none', zIndex: 20,
        }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F0F0F2' }}>{tooltip.nom}</div>
          <div style={{ fontSize: '0.78rem', color: '#9CA3AF', marginTop: 2 }}>
            {tooltip.commercial} · {tooltip.nb} adresses
          </div>
        </div>
      )}
    </div>
  )
}
