'use client'

import { useState } from 'react'

const C = {
  bg:     '#141416',
  border: 'rgba(255,255,255,0.08)',
  text:   '#F0F0F2',
  mid:    '#9A9AA8',
  muted:  '#6B6B7B',
  card:   '#1A1A1E',
  primary:'#1D9E75',
}

export type DvfHeatmapMode = '' | 'densite' | 'prix_bati' | 'prix_terrain'

export interface FilterState {
  type_bien:      string
  zone_id:        string
  has_dpe:        boolean
  has_dvf:        boolean
  statut:         string
  showAddresses:  boolean
  showZones:      boolean
  showDvf:        DvfHeatmapMode
  showCadastre:   boolean
  dvfAnnees:      number[]
  dvfPeriode:     number
}

interface Zone { id: string; nom: string; couleur: string }

interface ExplorerFiltersProps {
  filters:  FilterState
  zones:    Zone[]
  onChange: (f: Partial<FilterState>) => void
}

function Chip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: 600,
        background: active ? (color ? color + '33' : 'rgba(29,158,117,0.2)') : 'rgba(255,255,255,0.06)',
        color: active ? (color ?? C.primary) : C.mid,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 34, height: 18, borderRadius: 9, position: 'relative',
          background: checked ? C.primary : 'rgba(255,255,255,0.12)',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 12, color: C.text }}>{label}</span>
    </label>
  )
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div style={{ padding: '0 16px 12px' }}>{children}</div>}
    </div>
  )
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - i)

export default function ExplorerFilters({ filters, zones, onChange }: ExplorerFiltersProps) {
  const toggleAnnee = (y: number) => {
    const next = filters.dvfAnnees.includes(y)
      ? filters.dvfAnnees.filter(a => a !== y)
      : [...filters.dvfAnnees, y]
    onChange({ dvfAnnees: next, dvfPeriode: 0 })
  }

  const setPeriode = (p: number) => {
    onChange({ dvfPeriode: p, dvfAnnees: [] })
  }

  return (
    <div style={{
      background: C.bg, borderRight: `1px solid ${C.border}`,
      width: 220, flexShrink: 0, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      <div style={{ padding: '14px 16px 10px', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}>
        Filtres
      </div>

      {/* Type de bien */}
      <Section title="Type de bien">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { v: '', l: 'Tous' },
            { v: 'maison', l: 'Maison' },
            { v: 'appartement', l: 'Appart.' },
            { v: 'commerce', l: 'Commerce' },
            { v: 'inconnu', l: 'Inconnu' },
          ].map(({ v, l }) => (
            <Chip key={v} label={l} active={filters.type_bien === v} onClick={() => onChange({ type_bien: v })} />
          ))}
        </div>
      </Section>

      {/* Zone */}
      <Section title="Zone">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Toutes" active={filters.zone_id === ''} onClick={() => onChange({ zone_id: '' })} />
          {zones.map(z => (
            <Chip key={z.id} label={z.nom} active={filters.zone_id === z.id} color={z.couleur} onClick={() => onChange({ zone_id: z.id })} />
          ))}
        </div>
      </Section>

      {/* Statut prospection */}
      <Section title="Statut terrain">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { v: '', l: 'Tous' },
            { v: 'jamais_vue', l: 'Jamais vue' },
            { v: 'contact', l: 'Contact' },
            { v: 'rdv_pris', l: 'RDV' },
            { v: 'estimation', l: 'Estimation' },
            { v: 'mandat_signe', l: 'Mandat' },
          ].map(({ v, l }) => (
            <Chip key={v} label={l} active={filters.statut === v} onClick={() => onChange({ statut: v })} />
          ))}
        </div>
      </Section>

      {/* Signaux */}
      <Section title="Signaux">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Chip label="Avec DPE" active={filters.has_dpe} onClick={() => onChange({ has_dpe: !filters.has_dpe })} />
          <Chip label="Avec transaction DVF" active={filters.has_dvf} onClick={() => onChange({ has_dvf: !filters.has_dvf })} />
        </div>
      </Section>

      {/* Couches carte – non repliable */}
      <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Couches carte
        </div>
        <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle label="Adresses" checked={filters.showAddresses} onChange={v => onChange({ showAddresses: v })} />
          <Toggle label="Zones de prospection" checked={filters.showZones} onChange={v => onChange({ showZones: v })} />
          <Toggle label="Cadastre + DVF/parcelle" checked={filters.showCadastre} onChange={v => onChange({ showCadastre: v })} />
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Heatmap DVF</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {([
                { v: '' as const,            l: 'Off' },
                { v: 'densite' as const,     l: 'Densité' },
                { v: 'prix_bati' as const,   l: '€/m² bâti' },
                { v: 'prix_terrain' as const,l: '€/m² terrain' },
              ] as const).map(({ v, l }) => (
                <Chip key={v} label={l} active={filters.showDvf === v} onClick={() => onChange({ showDvf: v })} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filtre années DVF – toujours visible */}
      <Section title="Période DVF">
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            { v: 0, l: 'Tout' },
            { v: 3, l: '3 ans' },
            { v: 5, l: '5 ans' },
            { v: 10, l: '10 ans' },
          ].map(({ v, l }) => (
            <Chip
              key={v}
              label={l}
              active={filters.dvfPeriode === v && filters.dvfAnnees.length === 0}
              onClick={() => setPeriode(v)}
            />
          ))}
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Ou par année
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => toggleAnnee(y)}
              style={{
                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: filters.dvfAnnees.includes(y) ? 'rgba(96,165,250,0.25)' : 'rgba(255,255,255,0.06)',
                color: filters.dvfAnnees.includes(y) ? '#60a5fa' : C.mid,
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
