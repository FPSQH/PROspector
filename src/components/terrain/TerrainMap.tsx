'use client'

import { useEffect, useRef, useState, useMemo } from 'react'

interface Adresse {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string; type_bien?: string; prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite' | 'supprimee'
  ordre: number; score?: number; latest_dpe_date?: string | null
  dpe_etiquette?: string | null
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  nom_syndic?: string; nb_bal?: number
}

export interface ContactPoint {
  id: string; lat: number; lon: number
  prenom?: string | null; nom?: string | null; statut_pipeline?: string | null
}

// Modes de couleur disponibles sur la carte terrain
type ColorMode = 'statut' | 'type' | 'dpe_etiquette' | 'dpe_date'

const COLOR_MODE_CYCLE: ColorMode[] = ['statut', 'type', 'dpe_etiquette', 'dpe_date']
const COLOR_MODE_LABEL: Record<ColorMode, string> = {
  statut:       '📍 Statut',
  type:         '🏠 Type',
  dpe_etiquette:'⚡ DPE A-G',
  dpe_date:     '🕐 DPE date',
}

const STATUT_COLOR: Record<string, string> = {
  a_faire:   '#ef4444',
  boite:     '#3b82f6',
  contact:   '#22c55e',
  visite:    '#9b9b96',
  supprimee: '#1a1a18',
}

const TYPE_COLOR: Record<string, string> = {
  maison:      '#4CAF50',
  appartement: '#2196F3',
  commerce:    '#FF9800',
  inconnu:     '#9E9E9E',
}

const PIPELINE_COLORS: Record<string, string> = {
  prospect:      '#9A9AA8',
  qualification: '#60A5FA',
  estimation:    '#FBBF24',
  mandat:        '#4ADE80',
  perdu:         '#F87171',
}

function dpeEtiquetteColor(etiquette?: string | null): string {
  switch (etiquette?.toUpperCase()) {
    case 'A': return '#16a34a'; case 'B': return '#4ade80'
    case 'C': return '#84cc16'; case 'D': return '#facc15'
    case 'E': return '#f97316'; case 'F': return '#ef4444'
    case 'G': return '#b91c1c'; default:  return '#cbd5e1'
  }
}

interface Props {
  adresses:           Adresse[]
  zonePolygon:        any
  prochaineAdresseId: string | null
  onAdresseClick:     (adresse: Adresse) => void
  contacts?:          ContactPoint[]
  defaultShowDpe?:    boolean
}

function createContactMarkerEl(label: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 26px; height: 26px; border-radius: 50%;
    background: ${color}; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800;
    border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    pointer-events: none; user-select: none;
  `
  el.textContent = (label.slice(0, 1) || '?').toUpperCase()
  return el
}

export default function TerrainMap({
  adresses, zonePolygon, prochaineAdresseId, onAdresseClick,
  contacts, defaultShowDpe = false,
}: Props) {
  const containerRef       = useRef<HTMLDivElement>(null)
  const mapRef             = useRef<any>(null)
  const adressesRef        = useRef<Adresse[]>([])
  const onClickRef         = useRef<(a: Adresse) => void>(onAdresseClick)
  const watchIdRef         = useRef<number | null>(null)
  const prevCountRef       = useRef<number>(0)
  const contactMarkersRef  = useRef<any[]>([])

  const [mapLoaded,    setMapLoaded]    = useState(false)
  const [satellite,    setSatellite]    = useState(false)
  const [gpsActive,    setGpsActive]    = useState(false)
  const [gpsError,     setGpsError]     = useState(false)
  const [showContacts, setShowContacts] = useState(true)
  const [showFilters,  setShowFilters]  = useState(false)
  const [filterTypes,  setFilterTypes]  = useState<string[]>([])
  const [filterStatut, setFilterStatut] = useState<string[]>([])
  // Mode couleur : démarre sur 'dpe_date' si defaultShowDpe, sinon 'statut'
  const [colorMode,    setColorMode]    = useState<ColorMode>(defaultShowDpe ? 'dpe_date' : 'statut')

  useEffect(() => { adressesRef.current = adresses },      [adresses])
  useEffect(() => { onClickRef.current  = onAdresseClick }, [onAdresseClick])

  const toggleFilter = (list: string[], val: string, setter: (v: string[]) => void) =>
    setter(list.includes(val) ? list.filter(x => x !== val) : [...list, val])

  const activeFilterCount = filterTypes.length + filterStatut.length

  // ── Init carte ──────────────────────────────────────────────────────────────
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
              tileSize: 256, maxzoom: 19,
            },
          },
          layers: [
            { id: 'osm',       type: 'raster', source: 'osm' },
            { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
          ],
        },
        center: [2.5, 46.8], zoom: 14,
        attributionControl: false,
      })

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        mapRef.current = map

        map.addSource('adresses',   { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('gps',        { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('itineraire', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        map.addLayer({
          id: 'itineraire-line', type: 'line', source: 'itineraire',
          paint: { 'line-color': '#9b9b96', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.6 },
        })
        map.addLayer({
          id: 'adresses-touch', type: 'circle', source: 'adresses',
          paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-opacity': 0 },
        })
        map.addLayer({
          id: 'adresses-circle', type: 'circle', source: 'adresses',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'prochaine'], true], 16,
              ['>=', ['get', 'score'], 80], 9,
              8,
            ],
            'circle-color': ['get', 'couleur'],
            'circle-stroke-width': ['case', ['==', ['get', 'prochaine'], true], 3, 2],
            'circle-stroke-color': '#fff',
            'circle-opacity': [
              'case',
              ['==', ['get', 'statut'], 'supprimee'], 1.0,
              ['==', ['get', 'prospectable'], false],  0.4,
              1,
            ],
          },
        })
        map.addLayer({
          id: 'adresses-dpe-halo', type: 'circle', source: 'adresses',
          filter: ['==', ['get', 'dpe_hot'], true],
          paint: { 'circle-radius': 14, 'circle-color': '#F59E0B', 'circle-opacity': 0.25, 'circle-blur': 0.5 },
        })
        map.addLayer({
          id: 'adresses-prochaine-pulse', type: 'circle', source: 'adresses',
          filter: ['==', ['get', 'prochaine'], true],
          paint: { 'circle-radius': 20, 'circle-color': '#ef4444', 'circle-opacity': 0.2 },
        })
        map.addLayer({ id: 'gps-pulse', type: 'circle', source: 'gps', paint: { 'circle-radius': 12, 'circle-color': '#3b82f6', 'circle-opacity': 0.2 } })
        map.addLayer({ id: 'gps-dot',   type: 'circle', source: 'gps', paint: { 'circle-radius': 6,  'circle-color': '#3b82f6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })

        map.on('click', 'adresses-touch', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          const adresse = adressesRef.current.find(a => a.id === f.properties.id)
          if (adresse) onClickRef.current(adresse)
        })
        map.on('mouseenter', 'adresses-touch', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'adresses-touch', () => { map.getCanvas().style.cursor = '' })

        prevCountRef.current = 0
        setMapLoaded(true)
      })
    }

    init()

    return () => {
      if (map) { map.remove(); mapRef.current = null }
      contactMarkersRef.current.forEach(m => { try { m.remove() } catch(e) {} })
      contactMarkersRef.current = []
      setMapLoaded(false)
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mise à jour adresses sur la carte ──────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    if (typeof map.getSource !== 'function') return

    const pId = prochaineAdresseId
    const twoMonthsAgo = Date.now() - 60 * 24 * 3600 * 1000

    // Filtrage visuel (itinéraire et logique parent inchangés)
    const visibleAdresses = adresses.filter(a => {
      if (filterTypes.length  && !filterTypes.includes(a.type_bien ?? 'inconnu')) return false
      if (filterStatut.length && !filterStatut.includes(a.statut_carte))           return false
      return true
    })

    const features = visibleAdresses.filter(a => a.lat && a.lon).map(a => {
      const dpeTs   = a.latest_dpe_date ? new Date(a.latest_dpe_date).getTime() : null
      const dpe_hot = dpeTs !== null && dpeTs >= twoMonthsAgo

      const couleur = (() => {
        // Les adresses supprimées restent toujours sombres
        if (a.statut_carte === 'supprimee') return '#1a1a18'
        switch (colorMode) {
          case 'type':
            return TYPE_COLOR[a.type_bien ?? 'inconnu'] ?? '#9E9E9E'
          case 'dpe_etiquette':
            return dpeEtiquetteColor(a.dpe_etiquette)
          case 'dpe_date': {
            if (!dpeTs) return '#9b9b96'
            const days = (Date.now() - dpeTs) / 86400000
            if (days <= 60)  return '#F59E0B'
            if (days <= 365) return '#86efac'
            return '#9b9b96'
          }
          default: // statut
            return STATUT_COLOR[a.statut_carte] ?? '#9b9b96'
        }
      })()

      return {
        type: 'Feature' as const,
        properties: {
          id:           a.id,
          statut:       a.statut_carte,
          couleur,
          dpe_hot,
          prospectable: a.prospectable !== false,
          label:        [a.numero, a.nom_voie].filter(Boolean).join(' '),
          prochaine:    a.id === pId,
          score:        a.score ?? 50,
        },
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      }
    })

    try {
      ;(map.getSource('adresses') as any)?.setData({ type: 'FeatureCollection', features })

      // Itinéraire toujours basé sur toutes les adresses (non filtré)
      const orderedCoords = adresses
        .filter(a => a.lat && a.lon)
        .sort((a, b) => a.ordre - b.ordre)
        .map(a => [a.lon, a.lat])

      if (orderedCoords.length > 1) {
        ;(map.getSource('itineraire') as any)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: orderedCoords }, properties: {} }],
        })
      }

      if (adresses.length > 0 && prevCountRef.current === 0) {
        const lons = adresses.filter(a => a.lon).map(a => a.lon)
        const lats = adresses.filter(a => a.lat).map(a => a.lat)
        if (lons.length && lats.length) {
          map.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: 60, maxZoom: 17, duration: 800 }
          )
        }
      }
      prevCountRef.current = adresses.length
    } catch (err) {
      console.warn('[TerrainMap] setData erreur:', err)
    }
  }, [adresses, prochaineAdresseId, mapLoaded, colorMode, filterTypes, filterStatut])

  // ── Marqueurs contacts ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    contactMarkersRef.current.forEach(m => { try { m.remove() } catch(e) {} })
    contactMarkersRef.current = []
    if (!showContacts || !contacts?.length) return
    import('maplibre-gl').then(ml => {
      const currentMap = mapRef.current
      if (!currentMap) return
      contacts.forEach(c => {
        if (!c.lat || !c.lon) return
        const label = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'
        const color = PIPELINE_COLORS[c.statut_pipeline ?? 'prospect'] ?? '#9A9AA8'
        const el    = createContactMarkerEl(label, color)
        try {
          const marker = new ml.Marker({ element: el, anchor: 'center' })
            .setLngLat([c.lon, c.lat])
            .addTo(currentMap)
          contactMarkersRef.current.push(marker)
        } catch(e) {}
      })
    })
  }, [contacts, mapLoaded, showContacts])

  // ── GPS ────────────────────────────────────────────────────────────────────
  const startGps = () => {
    if (!navigator.geolocation) return
    setGpsActive(true); setGpsError(false)
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        const map = mapRef.current
        if (!map || typeof map.getSource !== 'function') return
        try {
          ;(map.getSource('gps') as any)?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }],
          })
        } catch (e) {}
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  const stopGps = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setGpsActive(false); setGpsError(false)
    const map = mapRef.current
    if (map && typeof map.getSource === 'function') {
      try { ;(map.getSource('gps') as any)?.setData({ type: 'FeatureCollection', features: [] }) } catch (e) {}
    }
  }

  const toggleSatellite = () => {
    const map = mapRef.current
    if (!map) return
    setSatellite(v => {
      const next = !v
      map.setLayoutProperty('satellite', 'visibility', next ? 'visible' : 'none')
      return next
    })
  }

  // Cycle entre les modes de couleur
  const cycleColorMode = () => {
    setColorMode(current => {
      const idx = COLOR_MODE_CYCLE.indexOf(current)
      return COLOR_MODE_CYCLE[(idx + 1) % COLOR_MODE_CYCLE.length]
    })
  }

  const hasContacts = (contacts?.length ?? 0) > 0

  // Décalage vertical des boutons droite selon ce qui est visible
  const contactsBottom  = 200
  const filtersBottom   = hasContacts ? contactsBottom + 40 : contactsBottom
  const modeBottom      = filtersBottom + 40
  const dpeBottom       = modeBottom + 40
  const gpsBottom       = dpeBottom + 40
  const satelliteBottom = gpsBottom + 40

  const btnBase: React.CSSProperties = {
    position: 'absolute', right: 10, zIndex: 10,
    padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    border: '1px solid',
  }

  // ── Légende selon mode ─────────────────────────────────────────────────────
  const legend = (() => {
    switch (colorMode) {
      case 'statut':
        return [
          {color:'#ef4444',label:'À faire'},{color:'#3b82f6',label:'Boîté'},
          {color:'#22c55e',label:'Contact'},{color:'#9b9b96',label:'Visité'},
          {color:'#4A4A58',label:'Supprimée'},
        ]
      case 'type':
        return [
          {color:'#4CAF50',label:'Maison'},{color:'#2196F3',label:'Appartement'},
          {color:'#FF9800',label:'Commerce'},{color:'#9E9E9E',label:'Inconnu'},
        ]
      case 'dpe_etiquette':
        return ['A','B','C','D','E','F','G'].map(c => ({ color: dpeEtiquetteColor(c), label: `DPE ${c}` }))
      case 'dpe_date':
        return [
          {color:'#F59E0B',label:'< 2 mois'},{color:'#86efac',label:'2–12 mois'},
          {color:'#9b9b96',label:'> 12 mois / N/A'},
        ]
    }
  })()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Boutons droite (ordre bas→haut) */}

      {/* Satellite */}
      <button onClick={toggleSatellite} style={{
        ...btnBase, bottom: satelliteBottom,
        background: satellite ? '#1D9E75' : 'rgba(255,255,255,0.95)',
        color:      satellite ? '#fff'    : '#374151',
        borderColor: satellite ? '#1D9E75' : '#e8e7e0',
      }}>
        {satellite ? '🛰 Satellite' : '🗺 Carte'}
      </button>

      {/* GPS */}
      <button onClick={gpsActive ? stopGps : startGps} style={{
        ...btnBase, bottom: gpsBottom,
        background:  gpsActive ? '#3b82f6' : 'rgba(255,255,255,0.95)',
        color:       gpsActive ? '#fff'    : (gpsError ? '#ef4444' : '#374151'),
        borderColor: gpsError  ? '#ef4444' : gpsActive ? '#3b82f6' : '#e8e7e0',
      }}>
        {gpsError ? '⚠️ GPS' : gpsActive ? '📍 Actif' : '📍 GPS'}
      </button>

      {/* Sélecteur de mode couleur (cycle au tap) */}
      <button onClick={cycleColorMode} style={{
        ...btnBase, bottom: modeBottom,
        background:  colorMode !== 'statut' ? '#1D9E75' : 'rgba(255,255,255,0.95)',
        color:       colorMode !== 'statut' ? '#fff'    : '#374151',
        borderColor: colorMode !== 'statut' ? '#1D9E75' : '#e8e7e0',
        maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title="Changer le mode de couleur">
        {COLOR_MODE_LABEL[colorMode]}
      </button>

      {/* Filtres */}
      <button onClick={() => setShowFilters(v => !v)} style={{
        ...btnBase, bottom: filtersBottom,
        background:  showFilters || activeFilterCount > 0 ? '#7c3aed' : 'rgba(255,255,255,0.95)',
        color:       showFilters || activeFilterCount > 0 ? '#fff'    : '#374151',
        borderColor: showFilters || activeFilterCount > 0 ? '#7c3aed' : '#e8e7e0',
      }}>
        🔍{activeFilterCount > 0 ? ` (${activeFilterCount})` : ' Filtres'}
      </button>

      {/* Contacts */}
      {hasContacts && (
        <button onClick={() => setShowContacts(v => !v)} style={{
          ...btnBase, bottom: contactsBottom,
          background:  showContacts ? '#4ADE80' : 'rgba(255,255,255,0.95)',
          color:       showContacts ? '#fff'    : '#374151',
          borderColor: showContacts ? '#4ADE80' : '#e8e7e0',
        }}>
          👥 Contacts
        </button>
      )}

      {/* Panneau filtres (droite, au-dessus du bouton filtres) */}
      {showFilters && (
        <div style={{
          position: 'absolute', right: 10, bottom: filtersBottom + 44, zIndex: 20,
          background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '10px 12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', minWidth: 180, fontSize: 12,
        }}>
          {/* Filtre type_bien */}
          <div style={{ marginBottom: 8 }}>
            <div style={sectionTitle}>Type de bien</div>
            {[
              { key: 'maison',      color: '#4CAF50', label: 'Maison' },
              { key: 'appartement', color: '#2196F3', label: 'Appartement' },
              { key: 'commerce',    color: '#FF9800', label: 'Commerce' },
              { key: 'inconnu',     color: '#9E9E9E', label: 'Inconnu' },
            ].map(t => (
              <label key={t.key} style={filterRowStyle}>
                <input type="checkbox" checked={filterTypes.includes(t.key)} onChange={() => toggleFilter(filterTypes, t.key, setFilterTypes)} style={{ accentColor: t.color }} />
                <span style={{ color: t.color }}>●</span> {t.label}
              </label>
            ))}
          </div>
          {/* Filtre statut_carte */}
          <div style={{ marginBottom: activeFilterCount > 0 ? 8 : 0 }}>
            <div style={sectionTitle}>Statut visite</div>
            {[
              { key: 'a_faire', color: '#ef4444', label: 'À faire' },
              { key: 'boite',   color: '#3b82f6', label: 'Boîté' },
              { key: 'contact', color: '#22c55e', label: 'Contact' },
              { key: 'visite',  color: '#9b9b96', label: 'Visité' },
            ].map(s => (
              <label key={s.key} style={filterRowStyle}>
                <input type="checkbox" checked={filterStatut.includes(s.key)} onChange={() => toggleFilter(filterStatut, s.key, setFilterStatut)} style={{ accentColor: s.color }} />
                <span style={{ color: s.color }}>●</span> {s.label}
              </label>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={() => { setFilterTypes([]); setFilterStatut([]) }}
              style={{ width: '100%', padding: '4px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
              ✕ Effacer
            </button>
          )}
        </div>
      )}

      {/* Légende bas-gauche */}
      <div style={{
        position: 'absolute', bottom: 16, left: 12, background: 'rgba(12,12,14,0.88)',
        borderRadius: 8, padding: '6px 10px', fontSize: '0.68rem', color: '#ccc',
        border: '1px solid rgba(255,255,255,0.08)', pointerEvents: 'none', zIndex: 10,
      }}>
        {legend.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span>{item.label}</span>
          </div>
        ))}
        {activeFilterCount > 0 && (
          <div style={{ marginTop: 4, color: '#a78bfa', fontWeight: 700 }}>
            {adresses.filter(a => {
              if (filterTypes.length  && !filterTypes.includes(a.type_bien ?? 'inconnu')) return false
              if (filterStatut.length && !filterStatut.includes(a.statut_carte))           return false
              return true
            }).length} / {adresses.length} adresses
          </div>
        )}
      </div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 10, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
}
const filterRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 2,
}
