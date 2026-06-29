'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import ExplorerFilters, { FilterState } from '@/components/explorer/ExplorerFilters'
import AddressCard from '@/components/explorer/AddressCard'

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
  zones_prospection?: any
}

interface Zone { id: string; nom: string; couleur: string; polygone_geojson?: any }

const DEFAULT_FILTERS: FilterState = {
  type_bien: '', zone_id: '', has_dpe: false, has_dvf: false,
  statut: '', showZones: true, showDpe: false, showDvf: false,
}

export default function ExplorerPage() {
  const [addresses, setAddresses]     = useState<Address[]>([])
  const [zones, setZones]             = useState<Zone[]>([])
  const [filters, setFilters]         = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [count, setCount]             = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch zones once
  useEffect(() => {
    fetch('/api/zones')
      .then(r => r.json())
      .then(d => setZones(d.zones ?? []))
      .catch(() => {})
  }, [])

  const fetchAddresses = useCallback(async (f: FilterState) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.type_bien) params.set('type_bien', f.type_bien)
    if (f.zone_id)   params.set('zone_id', f.zone_id)
    if (f.statut)    params.set('statut', f.statut)
    if (f.has_dpe)   params.set('has_dpe', 'true')
    if (f.has_dvf)   params.set('has_dvf', 'true')

    try {
      const res = await fetch(`/api/explorer/addresses?${params}`)
      const data = await res.json()
      setAddresses(data.addresses ?? [])
      setCount(data.addresses?.length ?? 0)
    } catch {}
    setLoading(false)
  }, [])

  // Debounce filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchAddresses(filters), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, fetchAddresses])

  const updateFilter = useCallback((partial: Partial<FilterState>) => {
    setFilters(f => ({ ...f, ...partial }))
  }, [])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text }}>
      {/* Topbar */}
      <div style={{
        height: 52, flexShrink: 0, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Exploration</span>
        <span style={{ fontSize: 12, color: C.mid, marginLeft: 4 }}>
          {loading ? 'Chargement…' : `${count.toLocaleString('fr-FR')} adresses`}
        </span>
        <div style={{ flex: 1 }} />
        {/* Mobile: toggle filters */}
        <button
          onClick={() => setShowFilters(v => !v)}
          style={{
            background: showFilters ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
            color: showFilters ? '#1D9E75' : C.mid, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="10" y1="18" x2="14" y2="18"/>
          </svg>
          Filtres
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Filters panel — desktop sidebar, mobile overlay */}
        {(showFilters || (!isMobile)) && (
          <div style={{
            position: isMobile ? 'absolute' : 'relative',
            top: 0, left: 0, bottom: 0,
            zIndex: isMobile ? 200 : undefined,
            display: 'flex', flexDirection: 'column',
          }}>
            <ExplorerFilters filters={filters} zones={zones} onChange={updateFilter} />
          </div>
        )}

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ExplorerMap
            addresses={addresses}
            zones={zones}
            selectedId={selectedId}
            showDvfHeatmap={filters.showDvf}
            showDpeLayer={filters.showDpe}
            showZones={filters.showZones}
            onAddressClick={id => { setSelectedId(id); setShowFilters(false) }}
          />
          {loading && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 20,
              padding: '6px 16px', fontSize: 12, pointerEvents: 'none',
            }}>
              Chargement…
            </div>
          )}
        </div>

        {/* Address card — desktop right panel, mobile bottom sheet */}
        {selectedId && (
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
            <AddressCard addressId={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
