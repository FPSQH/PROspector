'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface ContactPoint {
  id: string
  lat: number
  lon: number
  prenom?: string | null
  nom?: string | null
  statut_pipeline?: string | null
  zone_nom?: string | null
}

const STATUT_COLORS: Record<string, string> = {
  prospect:      '#9A9AA8',
  qualification: '#60A5FA',
  estimation:    '#FBBF24',
  mandat:        '#4ADE80',
  perdu:         '#F87171',
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

function buildGeoJSON(pts: ContactPoint[], selId?: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: pts.map(c => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      properties: {
        id:       c.id,
        label:    [c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact',
        color:    STATUT_COLORS[c.statut_pipeline ?? 'prospect'] ?? '#9A9AA8',
        selected: c.id === selId,
      },
    })),
  }
}

function fitBounds(map: any, pts: ContactPoint[]) {
  if (!pts.length) return
  if (pts.length === 1) { map.flyTo({ center: [pts[0].lon, pts[0].lat], zoom: 15, duration: 400 }); return }
  const lons = pts.map(c => c.lon), lats = pts.map(c => c.lat)
  map.fitBounds(
    [[Math.min(...lons) - 0.005, Math.min(...lats) - 0.005], [Math.max(...lons) + 0.005, Math.max(...lats) + 0.005]],
    { padding: 48, duration: 400 }
  )
}

export default function ContactsMap({ contacts, selectedId, onContactClick }: {
  contacts: ContactPoint[]
  selectedId?: string | null
  onContactClick?: (id: string) => void
}) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<any>(null)
  const readyRef       = useRef(false)
  const cbRef          = useRef(onContactClick)
  const contactsRef    = useRef(contacts)
  const selectedIdRef  = useRef(selectedId)
  cbRef.current       = onContactClick
  contactsRef.current  = contacts
  selectedIdRef.current = selectedId

  // Init map (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    ;(async () => {
      const ml = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')
      if (cancelled || !containerRef.current) return

      const map = new ml.Map({ container: containerRef.current, style: OSM_STYLE, center: [2.35, 46.85], zoom: 5 })
      mapRef.current = map

      map.on('load', () => {
        // Use refs to get latest data even if contacts arrived before map loaded
        map.addSource('contacts', { type: 'geojson', data: buildGeoJSON(contactsRef.current, selectedIdRef.current) })

        // Anneau de sélection
        map.addLayer({ id: 'contacts-ring', type: 'circle', source: 'contacts',
          filter: ['==', ['get', 'selected'], true],
          paint: { 'circle-radius': 15, 'circle-color': 'transparent',
            'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'color'] } })

        // Dot principal
        map.addLayer({ id: 'contacts-dot', type: 'circle', source: 'contacts',
          paint: { 'circle-radius': ['case', ['get', 'selected'], 9, 7],
            'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })

        // Label (seulement pour la sélection)
        map.addLayer({ id: 'contacts-label', type: 'symbol', source: 'contacts',
          filter: ['==', ['get', 'selected'], true],
          layout: { 'text-field': ['get', 'label'], 'text-size': 12,
            'text-font': ['Open Sans Bold'], 'text-offset': [0, 1.6], 'text-anchor': 'top' },
          paint: { 'text-color': '#F0F0F2', 'text-halo-color': '#141416', 'text-halo-width': 2 } })

        map.on('click', 'contacts-dot', (e: any) => {
          const id = e.features?.[0]?.properties?.id
          if (id) cbRef.current?.(id)
        })
        map.on('mouseenter', 'contacts-dot', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'contacts-dot', () => { map.getCanvas().style.cursor = '' })

        readyRef.current = true
        if (contactsRef.current.length > 0) fitBounds(map, contactsRef.current)
      })
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mise à jour des données
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('contacts')
    if (!src) return
    src.setData(buildGeoJSON(contacts, selectedId))

    if (selectedId) {
      const c = contacts.find(x => x.id === selectedId)
      if (c) map.easeTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 14), duration: 400 })
    }
  }, [contacts, selectedId])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
