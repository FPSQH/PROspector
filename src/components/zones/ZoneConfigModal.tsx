'use client'

import { useState, useEffect } from 'react'

export interface ZoneConfig {
  nb_zones:         number   // nombre de zones cibles
  capacite_cible:   number   // adresses cibles par zone
  rayon_max_metres: number   // rayon max à pied (mètres)
  exclure_commerces: boolean // exclure les commerces
  exclure_logements_sociaux: boolean // toujours true par défaut
}

export const DEFAULT_CONFIG: ZoneConfig = {
  nb_zones:                  12,
  capacite_cible:            100,
  rayon_max_metres:          700,
  exclure_commerces:         false,
  exclure_logements_sociaux: true,
}

interface Props {
  nbAdressesTotal: number
  onConfirm: (config: ZoneConfig) => void
  onCancel: () => void
}

function Slider({
  label, value, min, max, step = 1, unit = '', onChange, hint,
}: {
  label: string, value: number, min: number, max: number,
  step?: number, unit?: string, onChange: (v: number) => void, hint?: string,
}) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a18' }}>{label}</span>
        <span style={{
          fontSize: '0.85rem', fontWeight: 700,
          color: '#1D9E75', background: '#f0fdf4',
          padding: '1px 8px', borderRadius: 6,
        }}>
          {value}{unit}
        </span>
      </div>
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 6,
          background: '#e8e7e0', borderRadius: 3,
        }}/>
        <div style={{
          position: 'absolute', left: 0, width: `${pct}%`, height: 6,
          background: '#1D9E75', borderRadius: 3, pointerEvents: 'none',
        }}/>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', left: 0, right: 0,
            width: '100%', opacity: 0, cursor: 'pointer', height: 20,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: '0.7rem', color: '#9b9b96' }}>{min}{unit}</span>
        {hint && <span style={{ fontSize: '0.7rem', color: '#9b9b96', fontStyle: 'italic' }}>{hint}</span>}
        <span style={{ fontSize: '0.7rem', color: '#9b9b96' }}>{max}{unit}</span>
      </div>
    </div>
  )
}

export function ZoneConfigModal({ nbAdressesTotal, onConfirm, onCancel }: Props) {
  const [config, setConfig] = useState<ZoneConfig>(DEFAULT_CONFIG)

  const set = (key: keyof ZoneConfig, value: number | boolean) =>
    setConfig((prev) => ({ ...prev, [key]: value }))

  // Calcul indicateurs live
  const adressesProspectables = Math.round(
    nbAdressesTotal * (config.exclure_logements_sociaux ? 0.85 : 1) *
    (config.exclure_commerces ? 0.92 : 1)
  )
  const adressesParZone = Math.round(adressesParZoneCalc())

  function adressesParZoneCalc() {
    if (config.nb_zones === 0) return 0
    return adressesProspectables / config.nb_zones
  }

  const ratio = adressesParZone / config.capacite_cible
  const statusColor = ratio <= 1.0 ? '#16a34a' : ratio <= 1.5 ? '#d97706' : '#dc2626'
  const statusBg    = ratio <= 1.0 ? '#f0fdf4' : ratio <= 1.5 ? '#fffbeb' : '#fef2f2'
  const statusBorder= ratio <= 1.0 ? '#bbf7d0' : ratio <= 1.5 ? '#fde68a' : '#fecaca'
  const statusLabel = ratio <= 1.0 ? '✓ Bon dimensionnement' : ratio <= 1.5 ? '⚠ Légèrement surchargé' : '✗ Zones trop grandes'

  // Zones recommandées pour atteindre la capacité cible
  const zonesRecommandees = Math.ceil(adressesProspectables / config.capacite_cible)

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16,
          width: 480, maxWidth: '95vw',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #f0efeb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18' }}>
                ⚙️ Paramètres de génération
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#9b9b96' }}>
                {nbAdressesTotal.toLocaleString('fr-FR')} adresses dans le secteur
              </p>
            </div>
            <button onClick={onCancel} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9b9b96', fontSize: '1.1rem', padding: 4,
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Indicateur live */}
          <div style={{
            background: statusBg,
            border: `1px solid ${statusBorder}`,
            borderRadius: 10, padding: '12px 16px',
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#5F5E5A', marginBottom: 4 }}>
                  {adressesProspectables.toLocaleString('fr-FR')} adresses ÷ {config.nb_zones} zones
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: statusColor, lineHeight: 1 }}>
                  ~{adressesParZone} adresses/zone
                </div>
                <div style={{ fontSize: '0.75rem', color: statusColor, marginTop: 4, fontWeight: 600 }}>
                  {statusLabel}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 2 }}>Cible</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18' }}>
                  {config.capacite_cible}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96' }}>adresses/zone</div>
              </div>
            </div>

            {/* Suggestion si trop grand */}
            {ratio > 1.2 && (
              <div style={{
                marginTop: 10, paddingTop: 10,
                borderTop: `1px solid ${statusBorder}`,
                fontSize: '0.78rem', color: statusColor,
              }}>
                💡 Pour respecter la cible de {config.capacite_cible} adresses/zone,
                il faudrait <strong>{zonesRecommandees} zones</strong>.
                <button
                  onClick={() => set('nb_zones', Math.min(zonesRecommandees, 30))}
                  style={{
                    marginLeft: 8, fontSize: '0.72rem',
                    background: statusColor, color: '#fff',
                    border: 'none', borderRadius: 4, padding: '2px 8px',
                    cursor: 'pointer', fontWeight: 600,
                  }}>
                  Appliquer
                </button>
              </div>
            )}
          </div>

          {/* Sliders */}
          <Slider
            label="Nombre de zones"
            value={config.nb_zones}
            min={6} max={30} step={1}
            onChange={(v) => set('nb_zones', v)}
            hint="3 séances/sem × 4 sem = 12"
          />

          <Slider
            label="Capacité cible par zone"
            value={config.capacite_cible}
            min={40} max={200} step={5} unit=" adresses"
            onChange={(v) => set('capacite_cible', v)}
            hint="2h à pied = 80–120 adresses"
          />

          <Slider
            label="Rayon max à pied"
            value={config.rayon_max_metres}
            min={300} max={1500} step={50} unit="m"
            onChange={(v) => set('rayon_max_metres', v)}
            hint="Zone couvrable en 2h"
          />

          {/* Types à exclure */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a18', marginBottom: 10 }}>
              Types de biens à exclure
            </div>
            {[
              { key: 'exclure_logements_sociaux', label: 'Logements sociaux', desc: 'Peu de potentiel vendeur', locked: true },
              { key: 'exclure_commerces', label: 'Commerces / locaux', desc: 'Garder uniquement le résidentiel', locked: false },
            ].map(({ key, label, desc, locked }) => {
              const checked = config[key as keyof ZoneConfig] as boolean
              return (
                <div
                  key={key}
                  onClick={() => !locked && set(key as keyof ZoneConfig, !checked)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${checked ? '#bbf7d0' : '#e8e7e0'}`,
                    background: checked ? '#f0fdf4' : '#fafaf8',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    marginBottom: 6,
                    opacity: locked ? 0.75 : 1,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: checked ? '2px solid #1D9E75' : '2px solid #d0cfc9',
                    background: checked ? '#1D9E75' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1a1a18' }}>
                      {label} {locked && <span style={{ fontSize: '0.7rem', color: '#9b9b96' }}>(toujours exclu)</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{desc}</div>
                  </div>
                </div>
              )
            })}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 20px',
          borderTop: '1px solid #f0efeb',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 20px', borderRadius: 8,
              background: '#f8f7f4', border: '1px solid #e8e7e0',
              color: '#5F5E5A', cursor: 'pointer', fontSize: '0.875rem',
            }}>
            Annuler
          </button>
          <button
            onClick={() => onConfirm(config)}
            style={{
              padding: '9px 24px', borderRadius: 8,
              background: '#1D9E75', border: 'none',
              color: '#fff', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600,
            }}>
            Générer {config.nb_zones} zones →
          </button>
        </div>
      </div>
    </div>
  )
}
