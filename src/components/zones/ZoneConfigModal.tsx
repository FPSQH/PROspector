'use client'

import { useState } from 'react'

interface ZoneConfig {
  nb_zones:                  number
  capacite_cible:            number
  rayon_metres:              number   // LIMITE DURE
  exclure_commerces:         boolean
  exclure_logements_sociaux: boolean
  dpe_fenetre_mois:          number   // 3 | 6 | 12 | 24
  dpe_poids:                 number   // 0..2 (0% a 200%)
  dpe_seuil_inclusion:       number
}

export type { ZoneConfig }

const DEFAULT_CONFIG: ZoneConfig = {
  nb_zones:                  12,
  capacite_cible:            100,
  rayon_metres:              800,
  exclure_commerces:         false,
  exclure_logements_sociaux: true,
  dpe_fenetre_mois:          6,
  dpe_poids:                 1.0,
  dpe_seuil_inclusion:       10,
}

interface Props {
  nbAdressesTotal: number
  onConfirm: (config: ZoneConfig) => void
  onCancel: () => void
}

function Slider({
  label, value, min, max, step = 1, unit = '', onChange, hint, sublabel,
}: {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; onChange: (v: number) => void; hint?: string; sublabel?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{label}</span>
          {sublabel && <span style={{ fontSize: 11, color: '#B4B2A9', marginLeft: 6 }}>{sublabel}</span>}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75' }}>{value}{unit}</span>
      </div>
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: '#E8E6DF', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 0, width: `${((value - min) / (max - min)) * 100}%`, height: 4, background: '#1D9E75', borderRadius: 2 }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: 20 }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 11, color: '#B4B2A9' }}>{min}{unit}</span>
        {hint && <span style={{ fontSize: 11, color: '#B4B2A9', textAlign: 'center', flex: 1, padding: '0 8px' }}>{hint}</span>}
        <span style={{ fontSize: 11, color: '#B4B2A9' }}>{max}{unit}</span>
      </div>
    </div>
  )
}

const DPE_FENETRES = [
  { label: '3 mois',  value: 3,  desc: 'Biens en cours de mise en vente (signal tres chaud)' },
  { label: '6 mois',  value: 6,  desc: 'Biens recemment diagnostiques (signal chaud)' },
  { label: '12 mois', value: 12, desc: 'Biens probablement sur le marche (signal modere)' },
  { label: '24 mois', value: 24, desc: 'Tous les diagnostics recents (signal large)' },
]

function dpePoidLabel(poids: number): string {
  if (poids === 0)       return 'DPE ignore — selection par densite uniquement'
  if (poids <= 0.5)      return 'Faible — DPE complement a la densite'
  if (poids <= 1.0)      return 'Equilibre — densite et DPE a egalite'
  if (poids <= 1.5)      return 'Fort — DPE priorise sur la densite'
  return                        'Dominant — DPE determinant dans la selection'
}

export function ZoneConfigModal({ nbAdressesTotal, onConfirm, onCancel }: Props) {
  const [config, setConfig] = useState<ZoneConfig>(DEFAULT_CONFIG)
  const set = (key: keyof ZoneConfig, value: number | boolean) =>
    setConfig(prev => ({ ...prev, [key]: value }))

  const zonesRecommandees = Math.ceil(nbAdressesTotal / config.capacite_cible)
  const dpeActif = config.dpe_poids > 0
  const dpePct   = Math.round(config.dpe_poids * 100)

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
        maxHeight: '90dvh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #E8E6DF',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2C2C2A' }}>
              Parametres de generation
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#5F5E5A' }}>
              {nbAdressesTotal.toLocaleString('fr-FR')} adresses disponibles
            </p>
          </div>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: '#B4B2A9', lineHeight: 1, padding: '0 4px',
          }}>x</button>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Section zones */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#B4B2A9', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>
            Decoupage en zones
          </p>

          <Slider label="Nombre de zones" value={config.nb_zones} min={3} max={30}
            onChange={v => set('nb_zones', v)}
            hint={'recommande : ' + zonesRecommandees} />

          <Slider label="Adresses max par zone" value={config.capacite_cible} min={40} max={400} step={5} unit=" adresses"
            onChange={v => set('capacite_cible', v)} />

          <Slider
            label="Rayon maximum par zone"
            sublabel="(limite stricte)"
            value={config.rayon_metres} min={200} max={2000} step={50} unit="m"
            onChange={v => set('rayon_metres', v)}
            hint="Aucune adresse au-dela de ce rayon depuis le centre"
          />

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {([
              { key: 'exclure_logements_sociaux' as const, label: 'Exclure les logements sociaux', locked: true },
              { key: 'exclure_commerces' as const, label: 'Exclure les commerces', locked: false },
            ]).map(({ key, label, locked }) => (
              <label key={key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: locked ? 'not-allowed' : 'pointer',
                padding: '10px 12px', borderRadius: 8, background: '#F8F7F4',
              }}>
                <input type="checkbox" checked={config[key] as boolean} disabled={locked}
                  onChange={e => !locked && set(key, e.target.checked)}
                  style={{ accentColor: '#1D9E75', width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: locked ? '#B4B2A9' : '#2C2C2A' }}>
                  {label}
                  {locked && <span style={{ fontSize: 11, color: '#B4B2A9', marginLeft: 6 }}>(toujours actif)</span>}
                </span>
              </label>
            ))}
          </div>

          {/* Section DPE */}
          <div style={{ borderTop: '1px solid #E8E6DF', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#B4B2A9', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                Signal DPE
              </p>
              {dpeActif && (
                <span style={{ fontSize: 11, background: '#E8F7F2', color: '#0F6E56', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>
                  Actif
                </span>
              )}
            </div>

            <p style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 16, lineHeight: 1.55 }}>
              Score de selection = 1 pt par adresse + <strong>{dpePct}%</strong> par DPE recent.
              Un secteur avec beaucoup de DPE sera priorise dans la selection des zones.
            </p>

            {/* Slider poids DPE — 0 a 200% */}
            <Slider
              label="Poids du signal DPE"
              value={dpePct} min={0} max={200} step={10} unit="%"
              onChange={v => set('dpe_poids', v / 100)}
              hint={dpePoidLabel(config.dpe_poids)}
            />

            {dpeActif && (
              <>
                {/* Fenetre temporelle */}
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2A', margin: '0 0 10px' }}>
                    Fenetre temporelle DPE
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {DPE_FENETRES.map(f => (
                      <button key={f.value} onClick={() => set('dpe_fenetre_mois', f.value)} style={{
                        padding: '10px 4px', borderRadius: 8,
                        border: '1.5px solid ' + (config.dpe_fenetre_mois === f.value ? '#1D9E75' : '#E8E6DF'),
                        background: config.dpe_fenetre_mois === f.value ? '#E8F7F2' : '#fff',
                        color: config.dpe_fenetre_mois === f.value ? '#0F6E56' : '#5F5E5A',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'center',
                      }}>{f.label}</button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: '#5F5E5A', margin: '8px 0 0', lineHeight: 1.4 }}>
                    {DPE_FENETRES.find(f => f.value === config.dpe_fenetre_mois)?.desc}
                  </p>
                </div>

                {/* Resume */}
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#0F6E56', lineHeight: 1.6 }}>
                    Chaque adresse = <strong>1 pt</strong> &bull; Chaque DPE des <strong>{config.dpe_fenetre_mois} derniers mois</strong> = <strong>{dpePct / 100} pt</strong>.
                    Les hotspots avec le meilleur score seront selectionnes en priorite.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onCancel} style={{
              padding: '9px 20px', borderRadius: 8, border: '1px solid #E8E6DF',
              background: '#fff', color: '#5F5E5A', cursor: 'pointer', fontSize: 14, fontWeight: 500,
            }}>Annuler</button>
            <button onClick={() => onConfirm(config)} style={{
              padding: '9px 24px', borderRadius: 8, background: '#1D9E75',
              border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>Generer les zones</button>
          </div>
        </div>
      </div>
    </div>
  )
}
