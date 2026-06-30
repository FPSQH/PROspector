'use client'

import { useEffect, useRef, useCallback } from 'react'
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
}

interface DvfParcelle {
  id_parcelle: string; nb_ventes: number; valeur_moyenne: number
}

export interface ExplorerMapProps {
  addresses:      Address[]
  zones:          Zone[]
  selectedId:     string | null
  showDvfHeatmap: boolean
  showZones:      boolean
  showCadastre:   boolean
  dvfPoints:      DvfPoint[]
  dvfParcelles:   DvfParcelle[]
  onAddressClick: (id: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  maison:          '#1D9E75',
  appartement:     '#3B82F6',
  commerce:        '#F59E0B',
  inconnu:         '#94A3B8',
  logement_social: '#A78BFA',
}

// IGN cadastral raster tiles (free, no key needed)
const CADASTRE_RASTER =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng'

function dvfCircleColor(valeur: number): string {
  if (valeur >= 400000) return '#ef4444'
  if (valeur >= 250000) return '#f97316'
  if (valeur >= 150000) return '#facc15'
  return '#86efac'
}

// Distance approximative en mètres entre deux points
function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * 111000
  const dx = (lon2 - lon1) * 111000 * Math.cos(lat1 * Math.PI / 180)
  return Math.sqrt(dx * dx + dy * dy)
}

export default function ExplorerMap({
  addresses, zones, selectedId,
  showDvfHeatmap, showZones, showCadastre,
  dvfPoints, dvfParcelles,
  onAddressClick,
}: ExplorerMapProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<any>(null)
  const markersRef     = useRef<any[]>([])
  const scRef          = useRef<any>(null)
  const addressesRef   = useRef<Address[]>(addresses)
  const mapReadyRef    = useRef(false)

  // Keep addresses ref in sync for click handler
  useEffect(() => { addressesRef.current = addresses }, [addresses])

  // ── Helper: safely add/remove layers + sources ────────────────
  const safeRemove = useCallback((map: any, layers: string[], sources: string[]) => {
    for (const l of layers) if (map.getLayer(l)) map.removeLayer(l)
    for (const s of sources) if (map.getSource(s)) map.removeSource(s)
  }, [])

  // ── Render address clusters ───────────────────────────────────
  const renderClusters = useCallback(() => {
    const map = mapRef.current
    if (!map || !scRef.current) return
    const zoom = Math.round(map.getZoom())
    const b    = map.getBounds()
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const clusters = scRef.current.getClusters(bbox, zoom)

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

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
          onAddressClick(f.properties.id)
        })
      }
      markersRef.current.push(new ml.Marker({ element: el }).setLngLat([lon, lat]).addTo(map))
    }
  }, [addresses, selectedId, onAddressClick])

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

        // Clic sur fond de carte → adresse la plus proche (<100m)
        map.on('click', (e: any) => {
          const { lng, lat } = e.lngLat
          const addrs = addressesRef.current
          if (!addrs.length) return
          let nearest: Address | null = null
          let minD = Infinity
          for (const a of addrs) {
            const d = distM(lat, lng, a.lat, a.lon)
            if (d < minD) { minD = d; nearest = a }
          }
          if (nearest && minD < 100) onAddressClick(nearest.id)
        })

        // Clic sur cercle DVF → adresse la plus proche
        map.on('click', 'dvf-circles', (e: any) => {
          e.preventDefault()
          const f = e.features?.[0]
          if (!f) return
          const [lon, lat] = f.geometry.coordinates
          const addrs = addressesRef.current
          let nearest: Address | null = null
          let minD = Infinity
          for (const a of addrs) {
            const d = distM(lat, lon, a.lat, a.lon)
            if (d < minD) { minD = d; nearest = a }
          }
          if (nearest) onAddressClick(nearest.id)
        })
        map.on('mouseenter', 'dvf-circles', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'dvf-circles', () => { map.getCanvas().style.cursor = '' })

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
  // Représentation : densité de transactions → dégradé de couleur
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    safeRemove(map, ['dvf-heat'], ['dvf-heat'])
    if (!showDvfHeatmap || !dvfPoints.length) return

    const features = dvfPoints
      .filter(p => p.lat && p.lon)
      .map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { valeur: Math.min(p.valeur_fonciere ?? 0, 600000) },
      }))

    try {
      map.addSource('dvf-heat', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      })
      map.addLayer({
        id: 'dvf-heat',
        type: 'heatmap',
        source: 'dvf-heat',
        // Pas de beforeId — on laisse MapLibre décider de l'ordre
        paint: {
          'heatmap-weight':     ['interpolate', ['linear'], ['get', 'valeur'], 0, 0, 600000, 1],
          'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 7, 0.5, 14, 2.5],
          'heatmap-radius':     ['interpolate', ['linear'], ['zoom'], 7, 12, 14, 35],
          'heatmap-opacity':    0.8,
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
  }, [showDvfHeatmap, dvfPoints, safeRemove])

  // ── Cadastre raster + cercles DVF colorés ────────────────────
  // - Cadastre : raster IGN (frontières parcellaires fiables)
  // - Cercles DVF : transactions colorées par prix, cliquables
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    safeRemove(map,
      ['cadastre-layer', 'dvf-circles', 'dvf-circles-label'],
      ['cadastre', 'dvf-circles']
    )
    if (!showCadastre) return

    // Raster cadastral IGN (limites parcellaires visibles dès zoom 14)
    try {
      map.addSource('cadastre', {
        type: 'raster',
        tiles: [CADASTRE_RASTER],
        tileSize: 256,
        minzoom: 13, maxzoom: 21,
      })
      map.addLayer({
        id: 'cadastre-layer', type: 'raster', source: 'cadastre',
        paint: { 'raster-opacity': 0.65 },
      })
    } catch (e) {
      console.error('[ExplorerMap] cadastre error:', e)
    }

    // Cercles DVF colorés par prix (transaction par transaction)
    if (dvfPoints.length > 0) {
      const features = dvfPoints.filter(p => p.lat && p.lon).map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: {
          valeur: p.valeur_fonciere ?? 0,
          type_local: p.type_local,
          color: dvfCircleColor(p.valeur_fonciere ?? 0),
        },
      }))
      try {
        map.addSource('dvf-circles', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
          cluster: true, clusterMaxZoom: 14, clusterRadius: 30,
        })
        map.addLayer({
          id: 'dvf-circles', type: 'circle', source: 'dvf-circles',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius':       8,
            'circle-color':        ['get', 'color'],
            'circle-opacity':      0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.8)',
          },
        })
        // Clusters de transactions
        map.addLayer({
          id: 'dvf-clusters', type: 'circle', source: 'dvf-circles',
          filter: ['has', 'point_count'],
          paint: {
            'circle-radius':       ['step', ['get', 'point_count'], 14, 5, 20, 20, 26],
            'circle-color':        '#f97316',
            'circle-opacity':      0.75,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        })
        map.addLayer({
          id: 'dvf-clusters-count', type: 'symbol', source: 'dvf-circles',
          filter: ['has', 'point_count'],
          layout: {
            'text-field':  ['get', 'point_count_abbreviated'],
            'text-size':   11, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: { 'text-color': '#fff' },
        })
        map.on('click', 'dvf-clusters', (e: any) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ['dvf-clusters'] })?.[0]
          if (!f) return
          const coords = (f.geometry as any).coordinates
          map.easeTo({ center: coords, zoom: map.getZoom() + 2 })
        })
        map.on('mouseenter', 'dvf-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'dvf-clusters', () => { map.getCanvas().style.cursor = '' })
      } catch (e) {
        console.error('[ExplorerMap] dvf-circles error:', e)
      }
    }
  }, [showCadastre, dvfPoints, safeRemove])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Légende heatmap */}
      {showDvfHeatmap && (
        <div style={{
          position: 'absolute', bottom: 36, right: 12,
          background: 'rgba(14,14,16,0.88)', borderRadius: 10, padding: '10px 14px',
          fontSize: 11, color: '#fff', pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>Densité transactions DVF</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 4 }}>
            {['#3B82F6','#6366F1','#EF4444','#F97316','#FFC800'].map(c => (
              <div key={c} style={{ width: 20, height: 12, background: c }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
            <span>Faible</span><span>Fort</span>
          </div>
        </div>
      )}

      {/* Légende cadastre + DVF cercles */}
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
          ].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: '1.5px solid rgba(255,255,255,0.6)', flexShrink: 0 }} />
              <span>{l}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            Cadastre visible à partir du zoom 13<br/>Cliquer un cercle → fiche adresse
          </div>
        </div>
      )}
    </div>
  )
}
