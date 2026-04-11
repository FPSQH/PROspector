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
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<any>(null)
  const drawingRef      = useRef<[number,number][]>([])
  const zonesRef        = useRef<Zone[]>([])
  const onZoneClickRef  = useRef<(zone: Zone) => void>(onZoneClick)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [drawPoints, setDrawPoints] = useState<[number,number][]>([])
  const [editVertices, setEditVertices] = useState<[number,number][]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [nbAdresses, setNbAdresses]           = useState<number | null>(null)
  const [adresses, setAdresses]               = useState<any[]>([])
  const [loadingAdresses, setLoadingAdresses] = useState(false)
  const [satellite, setSatellite]             = useState(false)
  const [showAllAdresses, setShowAllAdresses]  = useState(false)
  const [showDpe, setShowDpe]                  = useState(false)
  const [allAdresses, setAllAdresses]          = useState<any[]>([])
  const [dpePoints, setDpePoints]              = useState<any[]>([])
  const [loadingOverlay, setLoadingOverlay]    = useState(false)

  // Garder les refs à jour à chaque render pour éviter les closures stale
  useEffect(() => { zonesRef.current = zones }, [zones])
  useEffect(() => { onZoneClickRef.current = onZoneClick }, [onZoneClick])

  // Basculer entre OSM et satellite
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    map.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none')
    map.setLayoutProperty('osm',       'visibility', satellite ? 'none'    : 'visible')
  }, [mapLoaded, satellite])

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
            satellite: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              attribution: '© Esri — Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo',
              maxzoom: 19,
            },
          },
          layers: [
            { id: 'osm',       type: 'raster', source: 'osm' },
            { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
          ],
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
        map.addSource('adresses-zone',  { type: 'geojson', data: emptyFC() })
        map.addSource('all-adresses',   { type: 'geojson', data: emptyFC() })
        map.addSource('dpe-overlay',    { type: 'geojson', data: emptyFC() })

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

        // Adresses de la zone sélectionnée
        map.addLayer({ id: 'adresses-zone-layer', type: 'circle', source: 'adresses-zone',
          paint: {
            'circle-radius': 4,
            'circle-color': ['get', 'couleur'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        })

        // Tooltip au survol des adresses
        map.on('mouseenter', 'adresses-zone-layer', (e: any) => {
          map.getCanvas().style.cursor = 'pointer'
          const f = e.features?.[0]
          if (!f) return
          const [lon, lat] = (f.geometry as any).coordinates
          new (window as any).maplibregl.Popup({ offset: 8, closeButton: false })
            .setLngLat([lon, lat])
            .setHTML(`<div style="font-size:0.75rem;padding:3px 6px">${f.properties.label ?? ''}</div>`)
            .addTo(map)
        })
        map.on('mouseleave', 'adresses-zone-layer', () => {
          map.getCanvas().style.cursor = ''
          const popups = document.querySelectorAll('.maplibregl-popup')
          popups.forEach((p) => p.remove())
        })

        // Click sur zones (bg) — utiliser les refs pour éviter les closures stale
        map.on('click', 'zones-bg-fill', (e: any) => {
          const id = e.features?.[0]?.properties?.id
          if (!id) return
          const zone = zonesRef.current.find((z) => z.id === id)
          if (zone) onZoneClickRef.current(zone)
        })
        // Click sur zones-sel aussi (zone déjà sélectionnée)
        map.on('click', 'zones-sel-fill', (e: any) => {
          const id = e.features?.[0]?.properties?.id
          if (!id) return
          const zone = zonesRef.current.find((z) => z.id === id)
          if (zone) onZoneClickRef.current(zone)
        })
        map.on('mouseenter', 'zones-bg-fill',  () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'zones-bg-fill',  () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'zones-sel-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'zones-sel-fill', () => { map.getCanvas().style.cursor = '' })

        // Overlay adresses secteur
        map.addLayer({
          id: 'all-adresses-circle', type: 'circle', source: 'all-adresses',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 4,
            'circle-color': ['match', ['get', 'type_bien'],
              'maison', '#4CAF50', 'appartement', '#2196F3',
              'commerce', '#FF9800', '#9E9E9E'],
            'circle-opacity': 0.75,
            'circle-stroke-width': 0.5,
            'circle-stroke-color': '#fff',
          }
        })
        // Overlay DPE recents
        map.addLayer({
          id: 'dpe-overlay-circle', type: 'circle', source: 'dpe-overlay',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 6,
            'circle-color': ['match', ['get', 'anciennete'],
              'chaud', '#E63946', 'tiede', '#FF9800', '#FFD54F'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          }
        })
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
      .map((z) => feature(parseGeo(z.polygone_geojson), { id: z.id, couleur: z.couleur }))

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
      // Ignorer les clics droits
      if (e.originalEvent?.button === 2) return
      const pt: [number,number] = [e.lngLat.lng, e.lngLat.lat]
      drawingRef.current = [...drawingRef.current, pt]
      setDrawPoints([...drawingRef.current])
    }

    // Clic droit : supprimer le dernier point
    const onContextMenu = (e: any) => {
      e.preventDefault()
      if (drawingRef.current.length === 0) return
      drawingRef.current = drawingRef.current.slice(0, -1)
      setDrawPoints([...drawingRef.current])
    }

    const onDblClick = (e: any) => {
      e.preventDefault()
      const pts = drawingRef.current
      const finalPts = autocompletePolygon(pts)
      if (!finalPts) return
      const closed = [...finalPts, finalPts[0]]
      const geojson = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [closed] },
      }
      onPolygonChange(geojson)
      updateDrawLayers(map, finalPts)
    }

    const canvas = map.getCanvas()
    canvas.addEventListener('contextmenu', onContextMenu)
    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu)
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, mode])

  // Mise à jour du dessin sur la carte
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mode !== 'draw') return
    updateDrawLayers(mapRef.current, drawPoints)
  }, [mapLoaded, drawPoints, mode])

  // ── Chargement des adresses de la zone sélectionnée ────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (!selectedZoneId) {
      ;(map.getSource('adresses-zone') as any)?.setData(emptyFC())
      setAdresses([])
      return
    }

    const zone = zones.find((z) => z.id === selectedZoneId)
    const couleur = zone?.couleur ?? '#1D9E75'

    setLoadingAdresses(true)
    // Charger via l'API (pas de Supabase direct dans un composant carte)
    fetch(`/api/zones/${selectedZoneId}/adresses`)
      .then((r) => r.json())
      .then((data) => {
        const items = data.adresses ?? []
        setAdresses(items)
        setLoadingAdresses(false)

        const features = items
          .filter((a: any) => a.lat && a.lon)
          .map((a: any) => ({
            type: 'Feature',
            properties: {
              id:    a.id,
              label: [a.numero, a.nom_voie].filter(Boolean).join(' '),
              couleur,
            },
            geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
          }))

        ;(map.getSource('adresses-zone') as any)?.setData({
          type: 'FeatureCollection', features,
        })
      })
      .catch(() => setLoadingAdresses(false))
  }, [mapLoaded, selectedZoneId, zones])

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

  // Auto-complétion : si < 3 points, génère les points manquants pour former un polygone
  // avec le tracé existant comme base (bounding box légèrement étendue)
  function autocompletePolygon(pts: [number,number][]): [number,number][] | null {
    if (pts.length === 0) return null
    if (pts.length >= 3) return pts

    if (pts.length === 1) {
      // 1 point : carré de ~200m autour du point
      const d = 0.001
      const [lon, lat] = pts[0]
      return [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
      ]
    }

    // 2 points : rectangle autour des 2 points avec buffer
    const lons = pts.map((p) => p[0])
    const lats = pts.map((p) => p[1])
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const padLon = Math.max((maxLon - minLon) * 0.3, 0.0005)
    const padLat = Math.max((maxLat - minLat) * 0.3, 0.0005)
    return [
      pts[0],
      pts[1],
      [maxLon + padLon, minLat - padLat],
      [minLon - padLon, minLat - padLat],
    ]
  }
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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!showAllAdresses) {
      if (map.getLayer('all-adresses-circle')) map.setLayoutProperty('all-adresses-circle', 'visibility', 'none')
      return
    }
    if (allAdresses.length > 0) {
      if (map.getLayer('all-adresses-circle')) map.setLayoutProperty('all-adresses-circle', 'visibility', 'visible')
      return
    }
    setLoadingOverlay(true)
    fetch('/api/adresses/secteur').then(r => r.json()).then(data => {
      if (!data.adresses) return
      setAllAdresses(data.adresses)
      const fc = { type: 'FeatureCollection' as const, features: data.adresses.map((a: any) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: { type_bien: a.type_bien }
      }))}
      ;(map.getSource('all-adresses') as any)?.setData(fc)
      if (map.getLayer('all-adresses-circle')) map.setLayoutProperty('all-adresses-circle', 'visibility', 'visible')
    }).finally(() => setLoadingOverlay(false))
  }, [showAllAdresses, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!showDpe) {
      if (map.getLayer('dpe-overlay-circle')) map.setLayoutProperty('dpe-overlay-circle', 'visibility', 'none')
      return
    }
    if (dpePoints.length > 0) {
      if (map.getLayer('dpe-overlay-circle')) map.setLayoutProperty('dpe-overlay-circle', 'visibility', 'visible')
      return
    }
    setLoadingOverlay(true)
    fetch('/api/dpe/secteur?mois=12').then(r => r.json()).then(data => {
      if (!data.points) return
      setDpePoints(data.points)
      const fc = { type: 'FeatureCollection' as const, features: data.points.map((p: any) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { anciennete: p.anciennete }
      }))}
      ;(map.getSource('dpe-overlay') as any)?.setData(fc)
      if (map.getLayer('dpe-overlay-circle')) map.setLayoutProperty('dpe-overlay-circle', 'visibility', 'visible')
    }).finally(() => setLoadingOverlay(false))
  }, [showDpe, mapLoaded])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Toggles overlay adresses + DPE */}
      <div style={{ position: 'absolute', top: 54, left: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
        <button onClick={() => setShowAllAdresses(v => !v)} style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: showAllAdresses ? '#1D9E75' : 'rgba(255,255,255,0.95)',
          color: showAllAdresses ? '#fff' : '#2C2C2A',
          border: '1.5px solid ' + (showAllAdresses ? '#1D9E75' : '#E8E6DF'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>
          {loadingOverlay && showAllAdresses ? '...' : '🏠 Adresses'}
        </button>
        <button onClick={() => setShowDpe(v => !v)} style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: showDpe ? '#E63946' : 'rgba(255,255,255,0.95)',
          color: showDpe ? '#fff' : '#2C2C2A',
          border: '1.5px solid ' + (showDpe ? '#E63946' : '#E8E6DF'),
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>
          {loadingOverlay && showDpe ? '...' : '📋 DPE recents'}
        </button>
      </div>
            {/* Bouton satellite */}
      <button
        onClick={() => setSatellite((v) => !v)}
        style={{
          position: 'absolute', top: 12, right: 50,
          background: satellite ? '#1a1a18' : 'rgba(255,255,255,0.95)',
          color: satellite ? '#fff' : '#5F5E5A',
          border: '1px solid #e8e7e0', borderRadius: 8,
          padding: '6px 12px', fontSize: '0.75rem',
          cursor: 'pointer', fontWeight: 500, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        {satellite ? 'Plan' : 'Satellite'}
      </button>

      {/* Légende mode */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: 'rgba(255,255,255,0.95)', borderRadius: 8,
        padding: '6px 12px', fontSize: '0.75rem',
        color: '#5F5E5A', border: '1px solid #e8e7e0',
        pointerEvents: 'none',
      }}>
        {mode === 'draw' && `${drawPoints.length} sommet${drawPoints.length !== 1 ? 's' : ''} — clic droit pour annuler · double-clic pour fermer`}
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
