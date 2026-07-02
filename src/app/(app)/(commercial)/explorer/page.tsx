'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import ExplorerFilters, { FilterState } from '@/components/explorer/ExplorerFilters'
import AddressCard from '@/components/explorer/AddressCard'
import ParcelCard from '@/components/explorer/ParcelCard'

const ExplorerMap = dynamic(() => import('@/components/explorer/ExplorerMap'), { ssr: false })

const C = {
  bg:    '#0C0C0E',
  text:  '#F0F0F2',
  mid:   '#9A9AA8',
  border:'rgba(255,255,255,0.08)',
}

interface Address {
  id: string; lat: number; lon: number
  type_bien: string; zone_id: string | null
  dpe_etiquette?: string | null
  latest_dpe_date?: string | null
  statut_prospection?: string | null
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

interface SearchResult {
  id: string; numero: string | null; nom_voie: string
  code_postal: string | null; commune: string
  lat: number; lon: number
}

const DEFAULT_FILTERS: FilterState = {
  type_bien: '', zone_id: '', has_dpe: false, has_dvf: false,
  statut: '', dpe_classes: [], dpe_recence: 0, has_audit: false, non_visitee_mois: 0,
  colorMode: 'type',
  showAddresses: true, showZones: true, showDvf: '', showCadastre: false,
  dvfAnnees: [], dvfPeriode: 5,
}

// ── Barre de recherche d'adresse ────────────────────────────────
function AddressSearch({ onSelect }: { onSelect: (r: SearchResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/adresses/recherche?q=${encodeURIComponent(q.trim())}`)
        .then(r => r.json())
        .then(d => { setResults(d.adresses ?? []); setOpen(true) })
        .catch(() => {})
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q])

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 340, minWidth: 120 }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Rechercher une adresse…"
        style={{
          width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8, fontSize: 12,
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
          color: C.text, outline: 'none',
        }}
      />
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2"
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 500,
          background: '#1A1A1E', border: `1px solid ${C.border}`, borderRadius: 10,
          maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {results.map(r => (
            <button
              key={r.id}
              onMouseDown={() => { onSelect(r); setQ(''); setResults([]); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`,
                color: C.text, fontSize: 12, cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 600 }}>{[r.numero, r.nom_voie].filter(Boolean).join(' ')}</span>
              <span style={{ color: C.mid }}> · {r.code_postal ?? ''} {r.commune}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExplorerPage() {
  const [addresses, setAddresses]               = useState<Address[]>([])
  const [zones, setZones]                       = useState<Zone[]>([])
  const [dvfPoints, setDvfPoints]               = useState<DvfPoint[]>([])
  const [filters, setFilters]                   = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId]             = useState<string | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null)
  const [parcelData, setParcelData]             = useState<any>(null)
  const [loadingParcel, setLoadingParcel]       = useState(false)
  const [loading, setLoading]                   = useState(false)
  const [loadingDvf, setLoadingDvf]             = useState(false)
  const [count, setCount]                       = useState(0)
  const [showFilters, setShowFilters]           = useState(true)
  const [flyTarget, setFlyTarget]               = useState<{ lat: number; lon: number } | null>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dvfLoadedRef = useRef(false)

  // Zones
  useEffect(() => {
    fetch('/api/zones').then(r => r.json()).then(d => setZones(d.zones ?? [])).catch(() => {})
  }, [])

  // DVF points – chargement lazy, une seule fois
  useEffect(() => {
    if ((!filters.showDvf && !filters.showCadastre) || dvfLoadedRef.current) return
    // showDvf est maintenant un mode string : '' = off
    dvfLoadedRef.current = true
    setLoadingDvf(true)
    fetch('/api/explorer/dvf-points')
      .then(r => r.json())
      .then(d => setDvfPoints(d.points ?? []))
      .catch(() => {})
      .finally(() => setLoadingDvf(false))
  }, [filters.showDvf, filters.showCadastre])

  // Filtre client-side sur les années DVF
  const dvfPointsFiltered = useMemo(() => {
    if (!dvfPoints.length) return dvfPoints
    if (filters.dvfAnnees.length > 0) {
      const set = new Set(filters.dvfAnnees)
      return dvfPoints.filter(p => p.date_mutation && set.has(new Date(p.date_mutation).getFullYear()))
    }
    if (filters.dvfPeriode > 0) {
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - filters.dvfPeriode)
      return dvfPoints.filter(p => p.date_mutation && new Date(p.date_mutation) >= cutoff)
    }
    return dvfPoints
  }, [dvfPoints, filters.dvfAnnees, filters.dvfPeriode])

  // Agrégation des parcelles DVF depuis les points filtrés (client-side)
  const dvfParcellesAgg = useMemo(() => {
    const map = new Map<string, { nb: number; total: number }>()
    for (const p of dvfPointsFiltered) {
      if (!p.id_parcelle) continue
      const e = map.get(p.id_parcelle) ?? { nb: 0, total: 0 }
      e.nb++
      e.total += p.valeur_fonciere ?? 0
      map.set(p.id_parcelle, e)
    }
    return Array.from(map.entries()).map(([id_parcelle, { nb, total }]) => ({
      id_parcelle,
      nb_ventes:      nb,
      valeur_moyenne: nb > 0 ? total / nb : 0,
    }))
  }, [dvfPointsFiltered])

  // Parcelles à mettre en surbrillance (toutes les parcelles des mutations de la parcelle sélectionnée)
  const highlightedParcelles = useMemo<string[]>(() => {
    if (!parcelData) return []
    const ids: string[] = []
    for (const m of parcelData.mutations ?? []) {
      for (const p of m.parcelles ?? []) ids.push(p)
    }
    return ids.filter((v, i, a) => a.indexOf(v) === i)
  }, [parcelData])

  // Fetch adresses
  const fetchAddresses = useCallback(async (f: FilterState) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.type_bien)             params.set('type_bien', f.type_bien)
    if (f.zone_id)               params.set('zone_id', f.zone_id)
    if (f.statut)                params.set('statut', f.statut)
    if (f.has_dpe)               params.set('has_dpe', 'true')
    if (f.has_dvf)               params.set('has_dvf', 'true')
    if (f.dpe_classes.length)    params.set('dpe_classes', f.dpe_classes.join(','))
    if (f.dpe_recence > 0)       params.set('dpe_recence', String(f.dpe_recence))
    if (f.has_audit)             params.set('has_audit', 'true')
    if (f.non_visitee_mois > 0)  params.set('non_visitee_mois', String(f.non_visitee_mois))
    try {
      const res  = await fetch(`/api/explorer/addresses?${params}`)
      const data = await res.json()
      setAddresses(data.addresses ?? [])
      setCount(data.total ?? 0)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchAddresses(filters), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, fetchAddresses])

  const updateFilter = useCallback((partial: Partial<FilterState>) => {
    setFilters(f => ({ ...f, ...partial }))
  }, [])

  // Clic sur une parcelle cadastrale DVF
  const handleParcelClick = useCallback((idParcelle: string) => {
    setSelectedParcelId(idParcelle)
    setSelectedId(null)
    if (window.innerWidth < 768) setShowFilters(false)
    setLoadingParcel(true)
    setParcelData(null)
    fetch(`/api/explorer/parcel/${idParcelle}`)
      .then(r => r.json())
      .then(d => setParcelData(d))
      .catch(() => {})
      .finally(() => setLoadingParcel(false))
  }, [])

  // Clic sur une adresse
  const handleAddressClick = useCallback((id: string) => {
    setSelectedId(id)
    setSelectedParcelId(null)
    setParcelData(null)
    if (window.innerWidth < 768) setShowFilters(false)
  }, [])

  // Sélection d'un résultat de recherche → zoom + fiche
  const handleSearchSelect = useCallback((r: SearchResult) => {
    setFlyTarget({ lat: r.lat, lon: r.lon })
    setSelectedId(r.id)
    setSelectedParcelId(null)
    setParcelData(null)
  }, [])

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    if (mobile) setShowFilters(false)
  }, [])

  const showPanel = selectedId || (selectedParcelId && (loadingParcel || parcelData))

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text }}>
      {/* Topbar */}
      <div style={{ height: 52, flexShrink: 0, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>Exploration</span>
        <AddressSearch onSelect={handleSearchSelect} />
        {!isMobile && (
          <span style={{ fontSize: 12, color: C.mid, whiteSpace: 'nowrap' }}>
            {loading ? 'Chargement…' : `${count.toLocaleString('fr-FR')} adresses`}
            {loadingDvf && ' · DVF en cours…'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowFilters(v => !v)}
          style={{
            background: showFilters ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
            color: showFilters ? '#1D9E75' : C.mid, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
          </svg>
          Filtres
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Panneau filtres — repliable sur desktop, overlay sur mobile */}
        {showFilters && (
          <div style={{ position: isMobile ? 'absolute' : 'relative', top: 0, left: 0, bottom: 0, zIndex: isMobile ? 200 : undefined, height: '100%' }}>
            <ExplorerFilters filters={filters} zones={zones} onChange={updateFilter} />
          </div>
        )}

        {/* Carte */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ExplorerMap
            addresses={addresses}
            zones={zones}
            selectedId={selectedId}
            showAddresses={filters.showAddresses}
            colorMode={filters.colorMode}
            dvfHeatmapMode={filters.showDvf}
            showZones={filters.showZones}
            showCadastre={filters.showCadastre}
            dvfPoints={dvfPointsFiltered}
            dvfParcellesAgg={dvfParcellesAgg}
            highlightedParcelles={highlightedParcelles}
            flyTarget={flyTarget}
            onAddressClick={handleAddressClick}
            onParcelClick={handleParcelClick}
          />
          {loading && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 20, padding: '6px 16px', fontSize: 12, pointerEvents: 'none' }}>
              Chargement des adresses…
            </div>
          )}
        </div>

        {/* Panneau latéral : fiche adresse OU fiche parcelle */}
        {showPanel && (
          <div style={{
            width: isMobile ? '100%' : 340,
            position: isMobile ? 'absolute' : 'relative',
            bottom: isMobile ? 0 : undefined,
            left: isMobile ? 0 : undefined,
            right: isMobile ? 0 : undefined,
            height: isMobile ? '65vh' : '100%',
            borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
            borderTop: isMobile ? `1px solid ${C.border}` : 'none',
            zIndex: isMobile ? 300 : undefined,
            borderRadius: isMobile ? '16px 16px 0 0' : undefined,
            overflow: 'hidden',
          }}>
            {selectedId && (
              <AddressCard addressId={selectedId} onClose={() => setSelectedId(null)} />
            )}
            {selectedParcelId && (loadingParcel || parcelData) && (
              loadingParcel
                ? <div style={{ padding: 32, textAlign: 'center', color: C.mid, background: '#141416', height: '100%' }}>Chargement…</div>
                : <ParcelCard
                    data={parcelData}
                    onClose={() => { setSelectedParcelId(null); setParcelData(null) }}
                  />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
