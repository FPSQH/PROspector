'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import Supercluster from 'supercluster'

interface Address {
  id: string; lat: number; lon: number
  type_bien: string; zone_id: string | null
}

interface Zone {
  id: string; nom: string; couleur: string; polygone_geojson?: any
}

interface DvfPoint {
  id: string; lat: number; lon: number
  valeur_fonciere: number; type_local: string
  date_mutation: string; id_parcelle: string | null
  surface_reelle_bati: number | null; surface_terrain: number | null
}

interface DvfParcelleAgg {
  id_parcelle: string; nb_ventes: number; valeur_moyenne: number
}

export type DvfHeatmapMode = '' | 'densite' | 'prix_bati' | 'prix_terrain'

export interface ExplorerMapProps {
  addresses:           Address[]
  zones:               Zone[]
  selectedId:          string | null
  showAddresses:       boolean
  dvfHeatmapMode:      DvfHeatmapMode
  showZones:           boolean
  showCadastre:        boolean
  dvfPoints:           DvfPoint[]
  dvfParcellesAgg:     DvfParcelleAgg[]
  highlightedParcelles:string[]
  onAddressClick:      (id: string) => void
  onParcelClick:       (idParcelle: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  maison:          '#1D9E75',
  appartement:     '#3B82F6',
  commerce:        '#F59E0B',
  inconnu:         '#94A3B8',
  logement_social: '#A78BFA',
}

const CADASTRE_RASTER =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng'

function parcelColor(valeur: number): string {
  if (valeur >= 400000) return '#ef4444'
  if (valeur >= 250000) return '#f97316'
  if (valeur >= 150000) return '#facc15'
  return '#86efac'
}

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * 111000
  const dx = (lon2 - lon1) * 111000 * Math.cos(lat1 * Math.PI / 180)
  return Math.sqrt(dx * dx + dy * dy)
}

const WFS_URL = 'https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
  '&TYPENAMES=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle' +
  '&OUTPUTFORMAT=application/json&COUNT=600'

const SATELLITE_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg'

const TYPE_LEGEND = [
  { color: '#1D9E75', label: 'Maison' },
  { color: '#3B82F6', label: 'Appartement' },
  { color: '#F59E0B', label: 'Commerce' },
  { color: '#94A3B8', label: 'Inconnu' },
]

export default function ExplorerMap({
  addresses, zones, selectedId,
  showAddresses, dvfHeatmapMode, showZones, showCadastre,
  dvfPoints, dvfParcellesAgg, highlightedParcelles,
  onAddressClick, onParcelClick,
}: ExplorerMapProps) {
  const [showSatellite, setShowSatellite] = useState(false)
  const containerRef          = useRef<HTMLDivElement>(null)
  const mapRef                = useRef<any>(null)
  const markersRef            = useRef<any[]>([])
  const scRef                 = useRef<any>(null)
  const mapReadyRef           = useRef(false)

  // Refs for stable access inside map event handlers
  const addressesRef          = useRef<Address[]>(addresses)
  const dvfParcellesAggRef    = useRef<DvfParcelleAgg[]>(dvfParcellesAgg)
  const highlightedRef        = useRef<string[]>(highlightedParcelles)
  const showAddressesRef      = useRef(showAddresses)
  const showCadastreRef       = useRef(showCadastre)
  const onParcelClickRef      = useRef(onParcelClick)
  const onAddressClickRef     = useRef(onAddressClick)
  const rawParcelFeaturesRef  = useRef<any[]>([])
  const wfsFetchTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wfsAbortRef           = useRef<AbortController | null>(null)

  useEffect(() => { addressesRef.current       = addresses       }, [addresses])
  useEffect(() => { dvfParcellesAggRef.current = dvfParcellesAgg }, [dvfParcellesAgg])
  useEffect(() => { highlightedRef.current     = highlightedParcelles }, [highlightedParcelles])
  useEffect(() => { showAddressesRef.current   = showAddresses   }, [showAddresses])
  useEffect(() => { showCadastreRef.current    = showCadastre    }, [showCadastre])
  useEffect(() => { onParcelClickRef.current   = onParcelClick   }, [onParcelClick])
  useEffect(() => { onAddressClickRef.current  = onAddressClick  }, [onAddressClick])

  // ── Helper: safely remove layers + sources ────────────────────
  const safeRemove = useCallback((map: any, layers: string[], sources: string[]) => {
    for (const l of layers) if (map.getLayer(l)) map.removeLayer(l)
    for (const s of sources) if (map.getSource(s)) map.removeSource(s)
  }, [])

  // ── Build colored GeoJSON from raw WFS features ───────────────
  const buildParcelGeoJson = useCallback(() => {
    const agg         = dvfParcellesAggRef.current
    const highlighted = new Set(highlightedRef.current)
    const aggMap      = new Map(agg.map(p => [p.id_parcelle, p]))

    const features = rawParcelFeaturesRef.current
      .filter((f: any) => {
        const idu = f.properties?.IDU ?? f.properties?.idu
        return aggMap.has(idu) || highlighted.has(idu)
      })
      .map((f: any) => {
        const idu   = f.properties?.IDU ?? f.properties?.idu ?? ''
        const isH   = highlighted.has(idu)
        const pd    = aggMap.get(idu)
        return {
          ...f,
          properties: {
            ...f.properties,
            _idu:     idu,
            _color:   isH ? '#ffffff' : parcelColor(pd?.valeur_moyenne ?? 0),
            _opacity: isH ? 0.65 : 0.45,
          },
        }
      })

    return { type: 'FeatureCollection', features }
  }, [])

  // Update the parcel-dvf source with rebuilt GeoJSON
  const rebuildParcelLayer = useCallback(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    const source = map.getSource('parcel-dvf') as any
    if (!source) return
    source.setData(buildParcelGeoJson())
  }, [buildParcelGeoJson])

  // ── WFS fetch for parcels in viewport ────────────────────────
  const fetchParcels = useCallback(async (map: any) => {
    if (map.getZoom() < 13.5) return
    wfsAbortRef.current?.abort()
    const ctrl = new AbortController()
    wfsAbortRef.current = ctrl
    const b = map.getBounds()
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`
    try {
      const res = await fetch(`${WFS_URL}&BBOX=${bbox},EPSG:4326`, { signal: ctrl.signal })
      const data = await res.json()
      rawParcelFeaturesRef.current = data.features ?? []
      rebuildParcelLayer()
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('[ExplorerMap] WFS error:', e)
    }
  }, [rebuildParcelLayer])

  const scheduleFetch = useCallback((map: any) => {
    if (wfsFetchTimerRef.current) clearTimeout(wfsFetchTimerRef.current)
    wfsFetchTimerRef.current = setTimeout(() => fetchParcels(map), 600)
  }, [fetchParcels])

  // ── Render address clusters ───────────────────────────────────
  const renderClusters = useCallback(() => {
    const map = mapRef.current
    if (!map || !scRef.current) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    if (!showAddressesRef.current) return

    const zoom = Math.round(map.getZoom())
    const b    = map.getBounds()
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const clusters = scRef.current.getClusters(bbox, zoom)

    const ml = (window as any).maplibregl
    if (!ml) return

    for (const f of clusters) {
      const [lon, lat] = f.geometry.coordinates
      const el = document.createElement('div')

      if (f.properties.cluster) {
        const count = f.properties.point_count
        const size  = count > 100 ? 42 : count > 20 ? 34 : 26
        el.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:#1D9E75;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:${size < 30 ? 10 : 12}px;font-weight:700;
          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;
          pointer-events:all;
        `
        el.textContent = count > 999 ? `${Math.round(count / 1000)}k` : String(count)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          const z = scRef.current.getClusterExpansionZoom(f.properties.cluster_id)
          map.easeTo({ center: [lon, lat], zoom: Math.min(z, 18) })
        })
      } else {
        const type  = f.properties.type_bien ?? 'inconnu'
        const color = TYPE_COLORS[type] ?? TYPE_COLORS.inconnu
        const isSel = f.properties.id === selectedId
        const size  = isSel ? 14 : 10
        el.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};
          border:${isSel ? '3px solid #fff' : '1.5px solid rgba(255,255,255,0.5)'};
          box-shadow:${isSel ? `0 0 0 3px ${color}` : '0 1px 3px rgba(0,0,0,0.4)'};
          cursor:pointer;transition:transform 0.1s;pointer-events:all;
        `
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onAddressClickRef.current(f.properties.id)
        })
      }
      markersRef.current.push(new ml.Marker({ element: el }).setLngLat([lon, lat]).addTo(map))
    }
  }, [selectedId])

  // ── Init map ──────────────────────────────────────────────────
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
      const ml = (window as any).maplibregl
      const map = new ml.Map({
        container: containerRef.current!,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-2.5, 48.2], zoom: 10,
      })
      mapRef.current = map

      map.on('load', () => {
        mapReadyRef.current = true

        // Clic sur la carte → adresse la plus proche (si pas de parcelle cliquée)
        map.on('click', (e: any) => {
          // Si on a cliqué sur une parcelle colorée → géré par le handler dédié
          if (showCadastreRef.current) {
            const parcelHit = map.queryRenderedFeatures(e.point, { layers: ['parcel-dvf-fill'] })
            if (parcelHit.length) return
          }
          const { lng, lat } = e.lngLat
          const addrs = addressesRef.current
          if (!addrs.length) return
          let nearest: Address | null = null
          let minD = Infinity
          for (const a of addrs) {
            const d = distM(lat, lng, a.lat, a.lon)
            if (d < minD) { minD = d; nearest = a }
          }
          if (nearest && minD < 100) onAddressClickRef.current(nearest.id)
        })

        map.on('moveend', renderClusters)
        renderClusters()
      })
    }
    return () => { mapRef.current?.remove(); mapRef.current = null; mapReadyRef.current = false }
  }, [])

  // ── Supercluster update ───────────────────────────────────────
  useEffect(() => {
    if (addresses.length === 0) return
    const features = addresses.map(a => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      properties: { id: a.id, type_bien: a.type_bien },
    }))
    scRef.current = new Supercluster({ radius: 40, maxZoom: 16 })
    scRef.current.load(features)
    const map = mapRef.current
    if (map?.loaded()) {
      if (!map._centered) {
        const lats = addresses.map(a => a.lat)
        const lons = addresses.map(a => a.lon)
        map.setCenter([(Math.min(...lons)+Math.max(...lons))/2, (Math.min(...lats)+Math.max(...lats))/2])
        map._centered = true
      }
      renderClusters()
    }
  }, [addresses, renderClusters])

  useEffect(() => {
    if (mapRef.current?.loaded()) renderClusters()
  }, [selectedId, renderClusters])

  useEffect(() => {
    if (mapRef.current?.loaded()) renderClusters()
  }, [showAddresses, renderClusters])

  // ── Satellite ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    safeRemove(map, ['satellite-layer'], ['satellite'])
    if (!showSatellite) return
    try {
      map.addSource('satellite', { type: 'raster', tiles: [SATELLITE_URL], tileSize: 256 })
      // Insérer avant la première couche pour rester en fond
      const firstLayer = map.getStyle().layers?.[0]?.id
      map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 0.9 } }, firstLayer)
    } catch (e) { console.error('[ExplorerMap] satellite error:', e) }
  }, [showSatellite, safeRemove])

  // ── Zones ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    safeRemove(map, ['zones-fill', 'zones-border'], ['zones'])
    if (!showZones || !zones.length) return
    const features = zones.filter(z => z.polygone_geojson).map(z => {
      let geo = z.polygone_geojson
      if (typeof geo === 'string') try { geo = JSON.parse(geo) } catch { return null }
      return { type: 'Feature', geometry: geo, properties: { couleur: z.couleur } }
    }).filter(Boolean)
    map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features } })
    map.addLayer({ id: 'zones-fill',   type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'couleur'], 'fill-opacity': 0.12 } })
    map.addLayer({ id: 'zones-border', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'couleur'], 'line-width': 1.5, 'line-opacity': 0.7 } })
  }, [zones, showZones, safeRemove])

  // ── Heatmap DVF ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    safeRemove(map, ['dvf-heat'], ['dvf-heat'])
    if (!dvfHeatmapMode || !dvfPoints.length) return

    // Calcul du poids selon le mode
    const features = dvfPoints
      .filter(p => {
        if (!p.lat || !p.lon) return false
        if (dvfHeatmapMode === 'prix_bati')    return (p.surface_reelle_bati ?? 0) > 0
        if (dvfHeatmapMode === 'prix_terrain') return (p.surface_terrain ?? 0) > 0
        return true
      })
      .map(p => {
        let poids = 1
        if (dvfHeatmapMode === 'prix_bati')    poids = Math.min((p.valeur_fonciere ?? 0) / p.surface_reelle_bati!, 8000)
        if (dvfHeatmapMode === 'prix_terrain') poids = Math.min((p.valeur_fonciere ?? 0) / p.surface_terrain!, 500)
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
          properties: { poids },
        }
      })

    try {
      map.addSource('dvf-heat', { type: 'geojson', data: { type: 'FeatureCollection', features } })
      const maxPoids = dvfHeatmapMode === 'prix_bati' ? 8000 : dvfHeatmapMode === 'prix_terrain' ? 500 : 1
      map.addLayer({
        id: 'dvf-heat', type: 'heatmap', source: 'dvf-heat',
        paint: {
          'heatmap-weight':    dvfHeatmapMode === 'densite'
            ? 1
            : ['interpolate', ['linear'], ['get', 'poids'], 0, 0, maxPoids, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 14, 2.5],
          'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 7, 12, 14, 35],
          'heatmap-opacity':   0.8,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.15,'rgba(59,130,246,0.6)',
            0.4, 'rgba(99,102,241,0.75)',
            0.65,'rgba(239,68,68,0.85)',
            0.85,'rgba(249,115,22,0.9)',
            1,   'rgba(255,200,0,1)',
          ],
        },
      })
    } catch (e) {
      console.error('[ExplorerMap] heatmap error:', e)
    }
  }, [dvfHeatmapMode, dvfPoints, safeRemove])

  // ── Cadastre raster + couche parcelles DVF (WFS) ─────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return

    safeRemove(map,
      ['cadastre-raster', 'parcel-dvf-fill', 'parcel-dvf-border'],
      ['cadastre', 'parcel-dvf']
    )

    // Supprimer les anciens event handlers
    map.off('moveend', scheduleFetch)

    if (!showCadastre) return

    // Raster cadastral IGN (fond)
    try {
      map.addSource('cadastre', { type: 'raster', tiles: [CADASTRE_RASTER], tileSize: 256, minzoom: 13 })
      map.addLayer({ id: 'cadastre-raster', type: 'raster', source: 'cadastre', paint: { 'raster-opacity': 0.55 } })
    } catch (e) { console.error('[ExplorerMap] raster cadastre error:', e) }

    // Source GeoJSON pour les parcelles colorées (remplie par WFS)
    try {
      map.addSource('parcel-dvf', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      map.addLayer({
        id: 'parcel-dvf-fill', type: 'fill', source: 'parcel-dvf',
        paint: {
          'fill-color':   ['coalesce', ['get', '_color'], 'transparent'],
          'fill-opacity': ['coalesce', ['get', '_opacity'], 0],
        },
      })
      map.addLayer({
        id: 'parcel-dvf-border', type: 'line', source: 'parcel-dvf',
        paint: { 'line-color': ['coalesce', ['get', '_color'], 'transparent'], 'line-width': 1.5, 'line-opacity': 0.9 },
      })

      // Clic sur parcelle DVF → ouvre ParcelCard
      map.on('click', 'parcel-dvf-fill', (e: any) => {
        const f   = e.features?.[0]
        const idu = f?.properties?._idu ?? f?.properties?.IDU ?? f?.properties?.idu
        if (idu) onParcelClickRef.current(idu)
      })
      map.on('mouseenter', 'parcel-dvf-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'parcel-dvf-fill', () => { map.getCanvas().style.cursor = '' })

    } catch (e) { console.error('[ExplorerMap] parcel-dvf error:', e) }

    // Déclencher la première récupération WFS + abonnement moveend
    fetchParcels(map)
    map.on('moveend', () => scheduleFetch(map))
  }, [showCadastre, safeRemove, fetchParcels, scheduleFetch])

  // ── Rebuild parcelles quand agg ou highlights changent ────────
  useEffect(() => {
    rebuildParcelLayer()
  }, [dvfParcellesAgg, highlightedParcelles, rebuildParcelLayer])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Bouton satellite */}
      <button
        onClick={() => setShowSatellite(v => !v)}
        title={showSatellite ? 'Désactiver satellite' : 'Vue satellite'}
        style={{
          position: 'absolute', top: 12, right: 12,
          background: showSatellite ? 'rgba(29,158,117,0.9)' : 'rgba(14,14,16,0.88)',
          border: `1px solid ${showSatellite ? '#1D9E75' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
          color: '#fff', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(4px)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        Satellite
      </button>

      {/* Légende adresses */}
      {showAddresses && (
        <div style={{
          position: 'absolute', top: 12, right: 100,
          background: 'rgba(14,14,16,0.88)', borderRadius: 8, padding: '8px 12px',
          fontSize: 11, color: '#fff', pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {TYPE_LEGEND.map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Légende heatmap */}
      {dvfHeatmapMode && (
        <div style={{
          position: 'absolute', bottom: 36, right: 12,
          background: 'rgba(14,14,16,0.88)', borderRadius: 10, padding: '10px 14px',
          fontSize: 11, color: '#fff', pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>
            {dvfHeatmapMode === 'densite'     && 'Densité transactions DVF'}
            {dvfHeatmapMode === 'prix_bati'   && 'Prix/m² bâti (DVF)'}
            {dvfHeatmapMode === 'prix_terrain'&& 'Prix/m² terrain (DVF)'}
          </div>
          <div style={{ display: 'flex', marginBottom: 4 }}>
            {['#3B82F6','#6366F1','#EF4444','#F97316','#FFC800'].map(c => (
              <div key={c} style={{ width: 20, height: 12, background: c }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
            {dvfHeatmapMode === 'densite'
              ? <><span>Faible</span><span>Fort</span></>
              : <><span>Bas €/m²</span><span>Élevé €/m²</span></>
            }
          </div>
        </div>
      )}

      {/* Légende cadastre */}
      {showCadastre && (
        <div style={{
          position: 'absolute', bottom: 36, left: 12,
          background: 'rgba(14,14,16,0.88)', borderRadius: 10, padding: '10px 14px',
          fontSize: 11, color: '#fff', pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>Prix de vente DVF</div>
          {[
            ['#86efac', '< 150 000 €'],
            ['#facc15', '150 – 250 k€'],
            ['#f97316', '250 – 400 k€'],
            ['#ef4444', '> 400 000 €'],
            ['#ffffff', 'Sélectionné'],
          ].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
              <span>{l}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            Visible à partir du zoom 13+<br/>Cliquer une parcelle → fiche DVF
          </div>
        </div>
      )}
    </div>
  )
}
