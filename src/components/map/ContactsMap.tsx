'use client'

import { useEffect, useRef } from 'react'

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
    { padding: 56, duration: 400 }
  )
}

/** Crée un élément HTML pour le marqueur du contact sélectionné */
function createPinElement(label: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `
    display: flex; flex-direction: column; align-items: center;
    cursor: pointer; user-select: none; pointer-events: none;
  `
  // Bulle label
  const bubble = document.createElement('div')
  bubble.textContent = label
  bubble.style.cssText = `
    background: ${color}; color: #fff;
    padding: 4px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 700;
    white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    margin-bottom: 4px;
  `
  // Épingle
  const pin = document.createElement('div')
  pin.style.cssText = `
    width: 18px; height: 18px; border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg); background: ${color};
    border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  `
  el.appendChild(bubble)
  el.appendChild(pin)
  return el
}

export default function ContactsMap({ contacts, selectedId, onContactClick }: {
  contacts: ContactPoint[]
  selectedId?: string | null
  onContactClick?: (id: string) => void
}) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<any>(null)
  const readyRef        = useRef(false)
  const cbRef           = useRef(onContactClick)
  const contactsRef     = useRef(contacts)
  const selectedIdRef   = useRef(selectedId)
  const pinMarkerRef    = useRef<any>(null)   // marqueur HTML pour contact sélectionné
  cbRef.current         = onContactClick
  contactsRef.current   = contacts
  selectedIdRef.current = selectedId

  // ── Init carte (une seule fois) ──────────────────────────────────────────
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
        map.addSource('contacts', { type: 'geojson', data: buildGeoJSON(contactsRef.current, selectedIdRef.current) })

        // ── Cercle shadow (contacts non-sélectionnés) ──
        map.addLayer({ id: 'contacts-shadow', type: 'circle', source: 'contacts',
          filter: ['==', ['get', 'selected'], false],
          paint: { 'circle-radius': 10, 'circle-color': ['get', 'color'], 'circle-opacity': 0.15, 'circle-blur': 0.5 } })

        // ── Dot principal (non sélectionnés) ──
        map.addLayer({ id: 'contacts-dot', type: 'circle', source: 'contacts',
          filter: ['==', ['get', 'selected'], false],
          paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })

        // ── Initiales label (non sélectionnés) ──
        map.addLayer({ id: 'contacts-initiales', type: 'symbol', source: 'contacts',
          filter: ['==', ['get', 'selected'], false],
          layout: { 'text-field': ['slice', ['get', 'label'], 0, 1], 'text-size': 10, 'text-font': ['Open Sans Bold'] },
          paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0)', 'text-halo-width': 0 } })

        map.on('click', 'contacts-dot', (e: any) => {
          const id = e.features?.[0]?.properties?.id
          if (id) cbRef.current?.(id)
        })
        map.on('mouseenter', 'contacts-dot', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'contacts-dot', () => { map.getCanvas().style.cursor = '' })

        readyRef.current = true

        // Mettre à jour avec les données actuelles (race-condition fix)
        const curr = contactsRef.current
        const sel  = selectedIdRef.current
        map.getSource('contacts').setData(buildGeoJSON(curr, sel))
        updatePinMarker(map, ml, curr, sel)
        if (curr.length > 0) fitBounds(map, curr)
      })
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mise à jour données ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('contacts')
    if (!src) return

    src.setData(buildGeoJSON(contacts, selectedId))

    import('maplibre-gl').then(ml => {
      updatePinMarker(map, ml, contacts, selectedId)
    })

    if (selectedId) {
      const c = contacts.find(x => x.id === selectedId)
      if (c) map.easeTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 14), duration: 400 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, selectedId])

  // ── Helper : marqueur pin HTML pour la sélection ─────────────────────────
  function updatePinMarker(map: any, ml: any, pts: ContactPoint[], selId?: string | null) {
    // Supprimer le marqueur précédent
    if (pinMarkerRef.current) { pinMarkerRef.current.remove(); pinMarkerRef.current = null }
    if (!selId) return
    const c = pts.find(x => x.id === selId)
    if (!c) return
    const color  = STATUT_COLORS[c.statut_pipeline ?? 'prospect'] ?? '#9A9AA8'
    const label  = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'
    const el     = createPinElement(label, color)
    pinMarkerRef.current = new ml.Marker({ element: el, anchor: 'bottom', offset: [0, -4] })
      .setLngLat([c.lon, c.lat])
      .addTo(map)
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
