'use client'

import { useState } from 'react'

interface ZoneConfig {
  nb_zones:                  number
  capacite_cible:            number
  rayon_metres:              number
  exclure_commerces:         boolean
  exclure_logements_sociaux: boolean
  dpe_fenetre_mois:          number
  dpe_poids:                 number
  dpe_seuil_inclusion:       number
  poids_collectif:           number
}

export type { ZoneConfig }

export const DEFAULT_CONFIG: ZoneConfig = {
  nb_zones:                  12,
  capacite_cible:            100,
  rayon_metres:              800,
  exclure_commerces:         false,
  exclure_logements_sociaux: true,
  dpe_fenetre_mois:          6,
  dpe_poids:                 1.0,
  dpe_seuil_inclusion:       10,
  poids_collectif:           0,
}

interface Props {
  nbAdressesTotal: number
  onConfirm: (config: ZoneConfig) => void
  onCancel: () => void
}

const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  border:  'rgba(255,255,255,0.08)',
  borderl: 'rgba(255,255,255,0.12)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  success: '#22C55E',
}

function Slider({
  label, value, min, max, step = 1, unit = '', onChange, hint, sublabel,
}: {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; onChange: (v: number) => void; hint?: string; sublabel?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <div>
          <span style={{ fontSize:13, fontWeight:500, color: C.text }}>{label}</span>
          {sublabel && <span style={{ fontSize:11, color: C.muted, marginLeft:6 }}>{sublabel}</span>}
        </div>
        <span style={{ fontSize:13, fontWeight:700, color: C.primary }}>{value}{unit}</span>
      </div>
      <div style={{ position:'relative', height:20, display:'flex', alignItems:'center' }}>
        <div style={{ position:'absolute', left:0, right:0, height:4, background:'rgba(255,255,255,0.1)', borderRadius:2 }} />
        <div style={{ position:'absolute', left:0, width:`${((value - min) / (max - min)) * 100}%`, height:4, background: C.primary, borderRadius:2 }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position:'absolute', width:'100%', opacity:0, cursor:'pointer', height:20 }}
        />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
        <span style={{ fontSize:11, color: C.dim }}>{min}{unit}</span>
        {hint && <span style={{ fontSize:11, color: C.muted, textAlign:'center', flex:1, padding:'0 8px' }}>{hint}</span>}
        <span style={{ fontSize:11, color: C.dim }}>{max}{unit}</span>
      </div>
    </div>
  )
}

const DPE_FENETRES = [
  { label:'3 mois',  value:3,  desc:'Biens en cours de mise en vente (signal tres chaud)' },
  { label:'6 mois',  value:6,  desc:'Biens recemment diagnostiques (signal chaud)' },
  { label:'12 mois', value:12, desc:'Biens probablement sur le marche (signal modere)' },
  { label:'24 mois', value:24, desc:'Tous les diagnostics recents (signal large)' },
]

function dpePoidLabel(poids: number): string {
  if (poids === 0)  return 'DPE ignore — selection par densite uniquement'
  if (poids <= 0.5) return 'Faible — DPE complement a la densite'
  if (poids <= 1.0) return 'Equilibre — densite et DPE a egalite'
  if (poids <= 1.5) return 'Fort — DPE priorise sur la densite'
  return                   'Dominant — DPE determinant dans la selection'
}

export function ZoneConfigModal({ nbAdressesTotal, onConfirm, onCancel }: Props) {
  const [prequalLoading, setPrequalLoading] = useState(false)
  const [prequalResult, setPrequalResult]   = useState<{ nb_qualifiees: number; nb_adresses_distinctes: number } | null>(null)

  const runPrequalifier = async () => {
    setPrequalLoading(true); setPrequalResult(null)
    try {
      const res = await fetch('/api/adresses/prequalifier', { method:'POST' })
      const data = await res.json()
      setPrequalResult(data)
    } finally { setPrequalLoading(false) }
  }

  const [config, setConfig] = useState<ZoneConfig>(DEFAULT_CONFIG)
  const set = (key: keyof ZoneConfig, value: number | boolean) =>
    setConfig(prev => ({ ...prev, [key]: value }))

  const zonesRecommandees = Math.ceil(nbAdressesTotal / config.capacite_cible)
  const dpeActif = config.dpe_poids > 0
  const dpePct   = Math.round(config.dpe_poids * 100)

  return (
    <div onClick={onCancel} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius:16, width:'100%', maxWidth:520, maxHeight:'90dvh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.5)', border:`1px solid ${C.borderl}` }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:`1px solid ${C.border}`, position:'sticky', top:0, background: C.card, zIndex:1 }}>
          <div>
            <h2 style={{ margin:0, fontSize:16, fontWeight:700, color: C.text }}>Parametres de generation</h2>
            <p style={{ margin:'3px 0 0', fontSize:12, color: C.muted }}>{nbAdressesTotal.toLocaleString('fr-FR')} adresses disponibles</p>
          </div>
          <button onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, color: C.muted, lineHeight:1, padding:'0 4px' }}>×</button>
        </div>

        <div style={{ padding:'20px 24px' }}>

          <p style={{ fontSize:11, fontWeight:700, color: C.dim, letterSpacing:'0.08em', textTransform:'uppercase', margin:'0 0 14px' }}>
            Decoupage en zones
          </p>

          <Slider label="Nombre de zones" value={config.nb_zones} min={3} max={30}
            onChange={v => set('nb_zones', v)} hint={'recommande : ' + zonesRecommandees} />

          <Slider label="Adresses max par zone" value={config.capacite_cible} min={40} max={400} step={5} unit=" adresses"
            onChange={v => set('capacite_cible', v)} />

          <Slider label="Rayon maximum par zone" sublabel="(limite stricte)"
            value={config.rayon_metres} min={200} max={2000} step={50} unit="m"
            onChange={v => set('rayon_metres', v)}
            hint="Aucune adresse au-dela de ce rayon depuis le centre" />

          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
            {([
              { key:'exclure_logements_sociaux' as const, label:'Exclure les logements sociaux', locked:true },
              { key:'exclure_commerces' as const,         label:'Exclure les commerces',          locked:false },
            ]).map(({ key, label, locked }) => (
              <label key={key} style={{ display:'flex', alignItems:'center', gap:10, cursor: locked ? 'not-allowed' : 'pointer', padding:'10px 12px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}` }}>
                <input type="checkbox" checked={config[key] as boolean} disabled={locked}
                  onChange={e => !locked && set(key, e.target.checked)}
                  style={{ accentColor: C.primary, width:16, height:16, flexShrink:0 }} />
                <span style={{ fontSize:13, color: locked ? C.dim : C.text }}>
                  {label}
                  {locked && <span style={{ fontSize:11, color: C.muted, marginLeft:6 }}>(toujours actif)</span>}
                </span>
              </label>
            ))}
          </div>

          {/* Habitat collectif */}
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, marginBottom:4 }}>
            <p style={{ fontSize:11, fontWeight:700, color: C.dim, letterSpacing:'0.08em', textTransform:'uppercase', margin:'0 0 12px' }}>
              Ponderation Habitat
            </p>
            <p style={{ fontSize:12, color: C.mid, marginBottom:16, lineHeight:1.55 }}>
              Les appartements et immeubles collectifs sont <strong style={{ color: C.text }}>exclus par défaut</strong> — accès interphone, impossibilité de déposer un courrier, prospection interdite dans les parties communes.
              Augmentez ce curseur uniquement si vous souhaitez les inclure.
            </p>
            <Slider label="Inclusion habitat collectif" sublabel="(appartements)"
              value={Math.round(config.poids_collectif * 100)} min={0} max={100} step={10} unit="%"
              onChange={v => set('poids_collectif', v / 100)}
              hint={
                config.poids_collectif === 0   ? 'Exclus — zones orientées maisons uniquement' :
                config.poids_collectif <= 0.3  ? 'Faible — maisons très prioritaires' :
                config.poids_collectif <= 0.6  ? 'Modéré — équilibre maisons / collectif' :
                config.poids_collectif <= 0.9  ? 'Fort — collectif presque égal aux maisons' :
                'Égalité — maisons et collectif au même niveau'
              } />
          </div>

          {/* Signal DPE */}
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <p style={{ fontSize:11, fontWeight:700, color: C.dim, letterSpacing:'0.08em', textTransform:'uppercase', margin:0 }}>
                Signal DPE
              </p>
              {dpeActif && <span style={{ fontSize:11, background:'rgba(29,158,117,0.12)', color:'#4ADE80', borderRadius:20, padding:'2px 8px', fontWeight:600 }}>Actif</span>}
            </div>
            <p style={{ fontSize:12, color: C.mid, marginBottom:16, lineHeight:1.55 }}>
              Un DPE déposé = un propriétaire avec un <strong style={{ color: C.text }}>projet de vente ou location en cours</strong>, quel que soit le résultat énergétique (A→G).
              Les zones avec le plus d&apos;activité de transaction seront priorisées.
            </p>
            <Slider label="Poids du signal DPE" value={dpePct} min={0} max={200} step={10} unit="%"
              onChange={v => set('dpe_poids', v / 100)} hint={dpePoidLabel(config.dpe_poids)} />

            {dpeActif && (
              <>
                <div style={{ marginBottom:20 }}>
                  <p style={{ fontSize:13, fontWeight:600, color: C.text, margin:'0 0 10px' }}>
                    Fenetre temporelle DPE
                  </p>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
                    {DPE_FENETRES.map(f => (
                      <button key={f.value} onClick={() => set('dpe_fenetre_mois', f.value)} style={{
                        padding:'10px 4px', borderRadius:8,
                        border:'1.5px solid ' + (config.dpe_fenetre_mois === f.value ? 'rgba(29,158,117,0.5)' : C.border),
                        background: config.dpe_fenetre_mois === f.value ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.04)',
                        color: config.dpe_fenetre_mois === f.value ? '#4ADE80' : C.mid,
                        cursor:'pointer', fontSize:13, fontWeight:600, textAlign:'center',
                      }}>{f.label}</button>
                    ))}
                  </div>
                  <p style={{ fontSize:11, color: C.muted, margin:'8px 0 0', lineHeight:1.4 }}>
                    {DPE_FENETRES.find(f => f.value === config.dpe_fenetre_mois)?.desc}
                  </p>
                </div>
                <div style={{ background:'rgba(29,158,117,0.08)', border:'1px solid rgba(29,158,117,0.25)', borderRadius:10, padding:'12px 14px', marginBottom:20 }}>
                  <p style={{ margin:0, fontSize:12, color:'#4ADE80', lineHeight:1.6 }}>
                    Chaque maison = <strong>1 pt</strong> &bull; Chaque adresse avec un DPE des <strong>{config.dpe_fenetre_mois} derniers mois</strong> = <strong>+{dpePct}%</strong>.
                    Les zones avec forte activité de transaction sont sélectionnées en priorité.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Pre-qualification */}
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, marginBottom:20 }}>
            <p style={{ fontSize:11, fontWeight:700, color: C.dim, letterSpacing:'0.08em', textTransform:'uppercase', margin:'0 0 10px' }}>
              Pre-qualification depuis les DPE
            </p>
            <p style={{ fontSize:12, color: C.mid, marginBottom:12, lineHeight:1.5 }}>
              Qualifie automatiquement les adresses ayant un DPE : maison, appartement ou immeuble mixte (appart + commerce).
              Les qualifications manuelles existantes ne sont pas ecrasees.
            </p>
            <button onClick={runPrequalifier} disabled={prequalLoading} style={{
              width:'100%', padding:'9px 16px', borderRadius:8,
              background: prequalLoading ? 'rgba(255,255,255,0.04)' : 'rgba(29,158,117,0.1)',
              border:'1.5px solid ' + (prequalLoading ? C.border : 'rgba(29,158,117,0.35)'),
              color: prequalLoading ? C.dim : '#4ADE80',
              cursor: prequalLoading ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:600,
            }}>
              {prequalLoading ? 'Qualification en cours...' : 'Qualifier les adresses depuis les DPE'}
            </button>
            {prequalResult && (
              <div style={{ marginTop:10, background:'rgba(29,158,117,0.08)', border:'1px solid rgba(29,158,117,0.25)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#4ADE80' }}>
                {prequalResult.nb_qualifiees} adresse(s) qualifiee(s) sur {prequalResult.nb_adresses_distinctes} adresses avec DPE.
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
            <button onClick={onCancel} style={{ padding:'9px 20px', borderRadius:8, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.06)', color: C.mid, cursor:'pointer', fontSize:14, fontWeight:500 }}>
              Annuler
            </button>
            <button onClick={() => onConfirm(config)} style={{ padding:'9px 24px', borderRadius:8, background:'#1D9E75', border:'none', color:'#fff', cursor:'pointer', fontSize:14, fontWeight:600 }}>
              Generer les zones
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
