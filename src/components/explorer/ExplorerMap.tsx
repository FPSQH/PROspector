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
  addresses:       Address[]
  zones:           Zone[]
  selectedId:      string | null
  showDvfHeatmap:  boolean
  showZones:       boolean
  showCadastre:    boolean
  dvfPoints:       DvfPoint[]
  dvfParcelles:    DvfParcelle[]
  onAddressClick:  (id: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  maison:          '#1D9E75',
  appartement:     '#3B82F6',
  commerce:        '#F59E0B',
  inconnu:         '#94A3B8',
  logement_social: '#A78BFA',
}

// Cadastral vector tiles from etalab / gouvernement.fr
const CADASTRE_TILES = 'https://openmaptiles.geo.data.gouv.fr/data/cadastre/{z}/{x}/{y}.pbf'

// Couleur d'une parcelle selon nb de ventes (0→5+)
function parcelColor(nb: number): string {
  if (nb >= 5) return '#ef4444'
  if (nb >= 3) return '#f97316'
  if (nb >= 2) return '#facc15'
  return '#86efac'
}

export default function ExplorerMap({
  addresses, zones, selectedId,
  showDvfHeatmap, showZones, showCadastre,
  dvfPoints, dvfParcelles,
  onAddressClick,
}: ExplorerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<any[]>([])
  const scRef        = useRef<any>(null)

  // ── Render address clusters ───────────────────────────────────
  const renderClusters = useCallback(() => {
    if (!mapRef.current || !scRef.current) return
    const map  = mapRef.current
    const zoom = Math.round(map.getZoom())
    const b    = map.getBounds()
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const clusters = scRef.current.getClusters(bbox, zoom)

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const maplibregl = (window as any).maplibregl
    if (!maplibregl) return

    for (const feature of clusters) {
      const [lon, lat] = feature.geometry.coordinates
      const el = document.createElement('div')

      if (feature.properties.cluster) {
        const count = feature.properties.point_count
        const size  = count > 100 ? 42 : count > 20 ? 34 : 26
        el.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:#1D9E75;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:${size < 30 ? 10 : 12}px;font-weight:700;
          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;
        `
        el.textContent = count > 999 ? `${Math.round(count / 1000)}k` : String(count)
        el.addEventListener('click', () => {
          const z = scRef.current.getClusterExpansionZoom(feature.properties.cluster_id)
          map.easeTo({ center: [lon, lat], zoom: Math.min(z, 18) })
        })
      } else {
        const type     = feature.properties.type_bien ?? 'inconnu'
        const color    = TYPE_COLORS[type] ?? TYPE_COLORS.inconnu
        const isSel    = feature.properties.id === selectedId
        const size     = isSel ? 14 : 10
        el.style.cssText = `
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};
          border:${isSel ? '3px solid #fff' : '1.5px solid rgba(255,255,255,0.5)'};
          box-shadow:${isSel ? `0 0 0 3px ${color}` : '0 1px 3px rgba(0,0,0,0.4)'};
          cursor:pointer;transition:transform 0.1s;
        `
        el.addEventListener('click', (e) => { e.stopPropagation(); onAddressClick(feature.properties.id) })
      }

      markersRef.current.push(
        new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map)
      )
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
      const maplibregl = (window as any).maplibregl
      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-2.5, 48.2], zoom: 10,
      })
      mapRef.current = map
      map.on('load', () => {
        map.on('moveend', renderClusters)
        renderClusters()
      })
    }
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // ── Update Supercluster when addresses change ─────────────────
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
      if (!map._centered && addresses.length > 0) {
        const lats = addresses.map(a => a.lat)
        const lons = addresses.map(a => a.lon)
        map.setCenter([(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2])
        map._centered = true
      }
      renderClusters()
    }
  }, [addresses, renderClusters])

  useEffect(() => { if (mapRef.current?.loaded()) renderClusters() }, [selectedId, renderClusters])

  // ── Zone polygons ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    if (map.getLayer('zones-fill'))   map.removeLayer('zones-fill')
    if (map.getLayer('zones-border')) map.removeLayer('zones-border')
    if (map.getSource('zones'))       map.removeSource('zones')
    if (!showZones || zones.length === 0) return
    const features = zones.filter(z => z.polygone_geojson).map(z => {
      let geo = z.polygone_geojson
      if (typeof geo === 'string') try { geo = JSON.parse(geo) } catch { return null }
      return { type: 'Feature', geometry: geo, properties: { couleur: z.couleur } }
    }).filter(Boolean)
    map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features } })
    map.addLayer({ id: 'zones-fill',   type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'couleur'], 'fill-opacity': 0.12 } })
    map.addLayer({ id: 'zones-border', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'couleur'], 'line-width': 1.5, 'line-opacity': 0.7 } })
  }, [zones, showZones])

  // ── DVF heatmap ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return
    if (map.getLayer('dvf-heat'))   map.removeLayer('dvf-heat')
    if (map.getSource('dvf-heat'))  map.removeSource('dvf-heat')
    if (!showDvfHeatmap || dvfPoints.length === 0) return

    const features = dvfPoints
      .filter(p => p.lat && p.lon)
      .map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { valeur: Math.min(p.valeur_fonciere ?? 0, 600000) },
      }))

    map.addSource('dvf-heat', { type: 'geojson', data: { type: 'FeatureCollection', features } })
    map.addLayer({
      id: 'dvf-heat', type: 'heatmap', source: 'dvf-heat',
      paint: {
        'heatmap-weight':     ['interpolate', ['linear'], ['get', 'valeur'], 0, 0, 600000, 1],
        'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 2],
        'heatmap-radius':     ['interpolate', ['linear'], ['zoom'], 8, 15, 14, 30],
        'heatmap-opacity':    0.75,
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(0,0,0,0)',
          0.2, 'rgba(59,130,246,0.6)',
          0.4, 'rgba(99,102,241,0.7)',
          0.6, 'rgba(168,85,247,0.75)',
          0.8, 'rgba(239,68,68,0.85)',
          1,   'rgba(255,165,0,1)',
        ],
      },
    }, 'zones-fill') // insérer sous les zones si présentes
  }, [showDvfHeatmap, dvfPoints])

  // ── Couche cadastrale + colorisation DVF par parcelle ─────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded()) return

    // Nettoyage
    for (const id of ['cadastre-parcelles-dvf', 'cadastre-parcelles-border', 'cadastre-parcelles']) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    if (map.getSource('cadastre')) map.removeSource('cadastre')

    if (!showCadastre) return

    // Source vecteur cadastrale (etalab / gouvernement.fr)
    map.addSource('cadastre', {
      type: 'vector',
      tiles: [CADASTRE_TILES],
      minzoom: 13,
      maxzoom: 20,
      promoteId: { parcelles: 'id' }, // id = identifiant parcellaire (14 chars)
    })

    // Fond des parcelles (blanc très transparent)
    map.addLayer({
      id: 'cadastre-parcelles',
      type: 'fill',
      source: 'cadastre',
      'source-layer': 'parcelles',
      minzoom: 13,
      paint: {
        'fill-color': 'rgba(255,255,255,0.04)',
        'fill-opacity': 1,
      },
    })

    // Colorisation DVF par parcelle via feature-state
    map.addLayer({
      id: 'cadastre-parcelles-dvf',
      type: 'fill',
      source: 'cadastre',
      'source-layer': 'parcelles',
      minzoom: 13,
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'hasDvf'], false],
          ['feature-state', 'color'],
          'rgba(0,0,0,0)',
        ],
        'fill-opacity': 0.65,
      },
    })

    // Bordure des parcelles
    map.addLayer({
      id: 'cadastre-parcelles-border',
      type: 'line',
      source: 'cadastre',
      'source-layer': 'parcelles',
      minzoom: 13,
      paint: {
        'line-color': 'rgba(255,255,200,0.35)',
        'line-width': 0.5,
      },
    })

    // Appliquer les feature-states pour la colorisation DVF
    if (dvfParcelles.length > 0) {
      const applyStates = () => {
        for (const p of dvfParcelles) {
          map.setFeatureState(
            { source: 'cadastre', sourceLayer: 'parcelles', id: p.id_parcelle },
            { hasDvf: true, color: parcelColor(p.nb_ventes) }
          )
        }
      }
      // Attendre que les tuiles soient chargées
      if (map.isSourceLoaded('cadastre')) {
        applyStates()
      } else {
        map.once('sourcedata', (e: any) => {
          if (e.sourceId === 'cadastre' && e.isSourceLoaded) applyStates()
        })
      }
    }
  }, [showCadastre, dvfParcelles])

  // Re-appliquer feature-states quand les données changent mais la couche est déjà là
  useEffect(() => {
    const map = mapRef.current
    if (!map?.loaded() || !showCadastre || !map.getSource('cadastre')) return
    for (const p of dvfParcelles) {
      map.setFeatureState(
        { source: 'cadastre', sourceLayer: 'parcelles', id: p.id_parcelle },
        { hasDvf: true, color: parcelColor(p.nb_ventes) }
      )
    }
  }, [dvfParcelles, showCadastre])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Légende heatmap DVF */}
      {showDvfHeatmap && (
        <div style={{
          position: 'absolute', bottom: 32, right: 12,
          background: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '8px 12px',
          fontSize: 11, color: '#fff', pointerEvents: 'none',
        }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Densité DVF</div>
          {[['#3B82F6', 'Faible'], ['#8B5CF6', 'Moyen'], ['#EF4444', 'Fort'], ['#FFA500', 'Très fort']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
      {/* Légende parcelles cadastrales */}
      {showCadastre && (
        <div style={{
          position: 'absolute', bottom: 32, left: 12,
          background: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '8px 12px',
          fontSize: 11, color: '#fff', pointerEvents: 'none',
        }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Ventes DVF / parcelle</div>
          {[['#86efac', '1 vente'], ['#facc15', '2 ventes'], ['#f97316', '3-4 ventes'], ['#ef4444', '5+ ventes']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
              <span>{l}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Visible à partir du zoom 13</div>
        </div>
      )}
    </div>
  )
}
