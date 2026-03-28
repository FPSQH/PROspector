'use client'

import { useEffect, useRef, useState } from 'react'

interface Zone {
  id:               string
  nom:              string
  couleur:          string
  nb_adresses:      number
  polygone_geojson?: any
}

interface Props {
  zones:          Zone[]
  mode:           'idle' | 'edit' | 'draw' | 'merge' | 'split'
  selectedZoneId: string | null
  mergeTargetId:  string | null
  splitAxis:      'horizontal' | 'vertical'
  splitPosition:  number
  onZoneClick:    (zone: Zone) => void
  onPolygonChange:(geojson: any) => void
}

export default function ZoneEditorMap({
  zones, mode, selectedZoneId, mergeTargetId,
  splitAxis, splitPosition,
  onZoneClick, onPolygonChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const drawingRef   = useRef<[number,number][]>([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [drawPoints, setDrawPoints] = useState<[number,number][]>([])
  const [editVertices, setEditVertices] = useState<[number,number][]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [nbAdresses, setNbAdresses] = useState<number | null>(null)

  // ── Init carte ──────────────────────────────────────────────────────
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
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [2.5, 46.8], zoom: 5, attributionControl: false,
      })

      map.addControl(new ml.NavigationControl(), 'top-right')

      map.on('load', () => {
        mapRef.current = map

        // Sources
        map.addSource('zones-bg',     { type: 'geojson', data: emptyFC() })
        map.addSource('zones-sel',    { type: 'geojson', data: emptyFC() })
        map.addSource('split-line',   { type: 'geojson', data: emptyFC() })
        map.addSource('draw-poly',    { type: 'geojson', data: emptyFC() })
        map.addSource('draw-points',  { type: 'geojson', data: emptyFC() })
        map.addSource('edit-vertices',{ type: 'geojson', data: emptyFC() })

        // Toutes les zones — fond atténué
        map.addLayer({ id: 'zones-bg-fill', type: 'fill', source: 'zones-bg',
          paint: { 'fill-color': ['get','couleur'], 'fill-opacity': 0.08 } })
        map.addLayer({ id: 'zones-bg-line', type: 'line', source: 'zones-bg',
          paint: { 'line-color': ['get','couleur'], 'line-width': 1, 'line-dasharray': [3,2] } })

        // Zone(s) sélectionnée(s) — mise en avant
        map.addLayer({ id: 'zones-sel-fill', type: 'fill', source: 'zones-sel',
          paint: { 'fill-color': ['get','couleur'], 'fill-opacity': 0.25 } })
        map.addLayer({ id: 'zones-sel-line', type: 'line', source: 'zones-sel',
          paint: { 'line-color': ['get','couleur'], 'line-width': 2.5 } })

        // Ligne de coupe (split)
        map.addLayer({ id: 'split-line-layer', type: 'line', source: 'split-line',
          paint: { 'line-color': '#d97706', 'line-width': 2, 'line-dasharray': [4,2] } })

        // Polygone en cours de dessin
        map.addLayer({ id: 'draw-poly-fill', type: 'fill', source: 'draw-poly',
          paint: { 'fill-color': '#1D9E75', 'fill-opacity': 0.15 } })
        map.addLayer({ id: 'draw-poly-line', type: 'line', source: 'draw-poly',
          paint: { 'line-color': '#1D9E75', 'line-width': 2 } })

        // Points du dessin
        map.addLayer({ id: 'draw-points-layer', type: 'circle', source: 'draw-points',
          paint: { 'circle-radius': 6, 'circle-color': '#1D9E75', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })

        // Sommets éditables
        map.addLayer({ id: 'edit-vertices-layer', type: 'circle', source: 'edit-vertices',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'midpoint'], true], 4, 7],
            'circle-color':  ['case', ['==', ['get', 'midpoint'], true], '#9b9b96', '#fff'],
            'circle-stroke-width': 2,
            'circle-stroke-color': ['case', ['==', ['get', 'midpoint'], true], '#9b9b96', '#1D9E75'],
          },
        })

        // Click sur zones (bg)
        map.on('click', 'zones-bg-fill', (e: any) => {
          const id = e.features?.[0]?.properties?.id
          if (!id) return
          const zone = zones.find((z) => z.id === id)
          if (zone) onZoneClick(zone)
        })
        map.on('mouseenter', 'zones-bg-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'zones-bg-fill', () => { map.getCanvas().style.cursor = '' })

        setMapLoaded(true)
      })
    }

    init()
    return () => { if (map) map.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mise à jour des zones sur la carte ──────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const zonesAvec = zones.filter((z) => z.polygone_geojson)

    const bg = zonesAvec
      .filter((z) => z.id !== selectedZoneId && z.id !== mergeTargetId)
      .map((z) => feature(parseGeo(z.polygone_geojson), { id: z.id, couleur: z.couleur }))

    const sel = zonesAvec
      .filter((z) => z.id === selectedZoneId || z.id === mergeTargetId)
      .map((z) => feature(parseGeo(z.polygone_geojson), { couleur: z.couleur }))

    ;(map.getSource('zones-bg') as any)?.setData(fc(bg))
    ;(map.getSource('zones-sel') as any)?.setData(fc(sel))

    if (zonesAvec.length > 0 && !selectedZoneId) {
      const allCoords: [number,number][] = []
      for (const z of zonesAvec) {
        const geo = parseGeo(z.polygone_geojson)
        const coords = geo?.coordinates?.[0] ?? []
        allCoords.push(...coords)
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
  }, [mapLoaded, zones, selectedZoneId, mergeTargetId])

  // ── Ligne de coupe ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (mode !== 'split' || !selectedZoneId) {
      ;(map.getSource('split-line') as any)?.setData(emptyFC())
      return
    }

    let line: any
    if (splitAxis === 'horizontal') {
      line = { type: 'Feature', properties: {}, geometry: {
        type: 'LineString', coordinates: [[-180, splitPosition], [180, splitPosition]],
      }}
    } else {
      line = { type: 'Feature', properties: {}, geometry: {
        type: 'LineString', coordinates: [[splitPosition, -90], [splitPosition, 90]],
      }}
    }
    ;(map.getSource('split-line') as any)?.setData({ type: 'FeatureCollection', features: [line] })
  }, [mapLoaded, mode, splitAxis, splitPosition, selectedZoneId])

  // ── Mode dessin — gestion des clics ────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (mode !== 'draw') {
      map.getCanvas().style.cursor = ''
      ;(map.getSource('draw-poly') as any)?.setData(emptyFC())
      ;(map.getSource('draw-points') as any)?.setData(emptyFC())
      setDrawPoints([])
      drawingRef.current = []
      return
    }

    map.getCanvas().style.cursor = 'crosshair'

    const onClick = (e: any) => {
      const pt: [number,number] = [e.lngLat.lng, e.lngLat.lat]
      drawingRef.current = [...drawingRef.current, pt]
      setDrawPoints([...drawingRef.current])
    }

    const onDblClick = (e: any) => {
      e.preventDefault()
      const pts = drawingRef.current
      if (pts.length < 3) return
      const closed = [...pts, pts[0]]
      const geojson = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [closed] },
      }
      onPolygonChange(geojson)
      updateDrawLayers(map, pts)
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    return () => { map.off('click', onClick); map.off('dblclick', onDblClick) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, mode])

  // Mise à jour du dessin sur la carte
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mode !== 'draw') return
    updateDrawLayers(mapRef.current, drawPoints)
  }, [mapLoaded, drawPoints, mode])

  // ── Mode édition — sommets déplaçables ──────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (mode !== 'edit' || !selectedZoneId) {
      ;(map.getSource('edit-vertices') as any)?.setData(emptyFC())
      setEditVertices([])
      return
    }

    const zone = zones.find((z) => z.id === selectedZoneId)
    if (!zone?.polygone_geojson) return

    const geo = parseGeo(zone.polygone_geojson)
    const ring: [number,number][] = (geo?.coordinates?.[0] ?? []).slice(0, -1)
    setEditVertices(ring)
    updateVertexLayer(map, ring)

    // Zoom sur la zone
    if (ring.length > 0) {
      const lons = ring.map((c) => c[0])
      const lats = ring.map((c) => c[1])
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 80, duration: 500 }
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, mode, selectedZoneId, zones])

  // Drag des sommets
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mode !== 'edit') return
    const map = mapRef.current

    const onMouseDown = (e: any) => {
      const f = e.features?.[0]
      if (!f || f.properties.midpoint) return
      const idx = f.properties.idx
      setDragIdx(idx)
      map.getCanvas().style.cursor = 'grabbing'
      map.dragPan.disable()
      e.preventDefault()
    }

    const onMouseMove = (e: any) => {
      if (dragIdx === null) return
      const newPt: [number,number] = [e.lngLat.lng, e.lngLat.lat]
      setEditVertices((prev) => {
        const next = [...prev]
        next[dragIdx] = newPt
        updateVertexLayer(map, next)
        const closed = [...next, next[0]]
        onPolygonChange({
          type: 'Feature', properties: {},
          geometry: { type: 'Polygon', coordinates: [closed] },
        })
        return next
      })
    }

    const onMouseUp = () => {
      if (dragIdx === null) return
      setDragIdx(null)
      map.getCanvas().style.cursor = ''
      map.dragPan.enable()
    }

    // Clic sur midpoint → ajouter sommet
    const onClickVertex = (e: any) => {
      const f = e.features?.[0]
      if (!f?.properties?.midpoint) return
      const idx = f.properties.idx
      setEditVertices((prev) => {
        const next = [...prev]
        next.splice(idx + 1, 0, [e.lngLat.lng, e.lngLat.lat])
        updateVertexLayer(map, next)
        return next
      })
    }

    map.on('mousedown', 'edit-vertices-layer', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    map.on('click', 'edit-vertices-layer', onClickVertex)
    map.on('mouseenter', 'edit-vertices-layer', () => { map.getCanvas().style.cursor = 'grab' })
    map.on('mouseleave', 'edit-vertices-layer', () => {
      if (dragIdx === null) map.getCanvas().style.cursor = ''
    })

    return () => {
      map.off('mousedown', 'edit-vertices-layer', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      map.off('click', 'edit-vertices-layer', onClickVertex)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, mode, dragIdx])

  // ── Helpers ──────────────────────────────────────────────────────────
  function emptyFC() { return { type: 'FeatureCollection', features: [] } }
  function fc(features: any[]) { return { type: 'FeatureCollection', features } }
  function feature(geometry: any, properties: any) { return { type: 'Feature', properties, geometry } }
  function parseGeo(g: any) { return typeof g === 'string' ? JSON.parse(g) : g }

  function updateDrawLayers(map: any, pts: [number,number][]) {
    const ptFeatures = pts.map((p) => ({
      type: 'Feature', properties: {},
      geometry: { type: 'Point', coordinates: p },
    }))
    ;(map.getSource('draw-points') as any)?.setData(fc(ptFeatures))

    if (pts.length >= 3) {
      const closed = [...pts, pts[0]]
      ;(map.getSource('draw-poly') as any)?.setData(fc([{
        type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: [closed] },
      }]))
    } else if (pts.length >= 2) {
      ;(map.getSource('draw-poly') as any)?.setData(fc([{
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: pts },
      }]))
    }
  }

  function updateVertexLayer(map: any, ring: [number,number][]) {
    const mainVerts = ring.map((p, i) => ({
      type: 'Feature', properties: { idx: i, midpoint: false },
      geometry: { type: 'Point', coordinates: p },
    }))
    // Midpoints entre chaque sommet
    const midVerts = ring.map((p, i) => {
      const next = ring[(i + 1) % ring.length]
      return {
        type: 'Feature', properties: { idx: i, midpoint: true },
        geometry: { type: 'Point', coordinates: [(p[0]+next[0])/2, (p[1]+next[1])/2] },
      }
    })
    ;(map.getSource('edit-vertices') as any)?.setData(fc([...mainVerts, ...midVerts]))
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Légende mode */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: 'rgba(255,255,255,0.95)', borderRadius: 8,
        padding: '6px 12px', fontSize: '0.75rem',
        color: '#5F5E5A', border: '1px solid #e8e7e0',
        pointerEvents: 'none',
      }}>
        {mode === 'draw' && `${drawPoints.length} sommet${drawPoints.length !== 1 ? 's' : ''} — double-clic pour fermer`}
        {mode === 'edit' && `${editVertices.length} sommets — glissez pour déplacer`}
        {mode === 'merge' && 'Shift+clic sur la zone à fusionner'}
        {mode === 'split' && 'Ajustez la ligne de coupe dans le panneau'}
        {mode === 'idle' && 'Cliquez sur une zone pour l\'éditer'}
      </div>

      {!mapLoaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8f7f4', fontSize: '0.875rem', color: '#9b9b96',
        }}>
          Chargement…
        </div>
      )}
    </div>
  )
}
