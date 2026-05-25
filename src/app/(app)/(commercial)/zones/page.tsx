'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ZoneConfigModal, DEFAULT_CONFIG } from '@/components/zones/ZoneConfigModal'
import type { ZoneConfig } from '@/components/zones/ZoneConfigModal'

const ZonesMap = dynamic(() => import('@/components/map/ZonesMap'), { ssr: false })

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.10)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  success: '#22C55E',
  danger:  '#EF4444',
  gold:    '#D97706',
}

interface Chevauchement {
  zone_a_id:   string
  zone_a_nom:  string
  zone_b_id:   string
  zone_b_nom:  string
  nb_adresses: number
}

interface VersionHistorique {
  id:          string
  version:     number
  nom:         string
  nb_adresses: number
  type_modif:  string
  created_at:  string
}

interface Zone {
  id: string
  nom: string
  couleur: string
  numero: number
  nb_adresses: number
  nb_prospectables: number
  statut?: string
  polygone_geojson?: any
  centroide_geojson?: any
  dpe_score?: number | null
  nb_dpe?: number | null
  ratio_dpe_recents?: number | null
}

interface AdresseItineraire {
  id: string
  lat: number
  lon: number
  numero?: string
  nom_voie?: string
  type_bien?: string
}

interface DpeAdresse {
  id: string
  lat: number
  lon: number
  dpe_etiquette?: string | null
  dpe_date?: string | null
}

const PALETTE = [
  '#22C55E','#3B82F6','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#14B8A6','#F97316','#6366F1','#0EA5E9',
  '#84CC16','#A855F7',
]

export default function ZonesPage() {
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set())

  const togglePrint = (id: string) => setSelectedForPrint(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const selectAllForPrint = () => setSelectedForPrint(new Set(zones.map(z => z.id)))

  const [zones, setZones]           = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [itineraire, setItineraire]  = useState<AdresseItineraire[]>([])
  const [loading, setLoading]        = useState(true)
  const [generating, setGenerating]  = useState(false)
  const [showConfig, setShowConfig]  = useState(false)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [editNom, setEditNom]         = useState('')
  const [editCouleur, setEditCouleur] = useState('')
  const [saveStatus, setSaveStatus]   = useState<'idle'|'saving'|'saved'>('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [warnings, setWarnings]       = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [chevauchements, setChevauchements] = useState<Chevauchement[]>([])
  const [snapshots, setSnapshots]         = useState<any[]>([])
  const [resetting, setResetting]         = useState(false)
  const [historique, setHistorique] = useState<VersionHistorique[]>([])
  const [loadingHistorique, setLoadingHistorique] = useState(false)
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [nbAdressesTotal, setNbAdressesTotal] = useState(0)

  // ── DPE récents ──────────────────────────────────────────────────────────
  const [showDpeRecents, setShowDpeRecents]   = useState(false)
  const [dpeAdresses, setDpeAdresses]         = useState<DpeAdresse[]>([])
  const [loadingDpe, setLoadingDpe]           = useState(false)
  const [communesCodes, setCommunesCodes]     = useState<string[]>([])

  const loadSnapshots = useCallback(async () => {
    const res = await fetch('/api/zones/snapshot')
    const d   = await res.json()
    setSnapshots(d.snapshots ?? [])
  }, [])

  const loadZones = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/zones')
      const data = await res.json()
      const z = data.zones ?? []
      setZones(z)
      setNbAdressesTotal(data.nb_adresses_total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadChevauchements = useCallback(async () => {
    const res  = await fetch('/api/zones/chevauchements')
    const data = await res.json()
    setChevauchements(data.chevauchements ?? [])
  }, [])

  const loadCommunesCodes = useCallback(async () => {
    try {
      const res  = await fetch('/api/dpe/statut')
      const data = await res.json()
      const codes = (data.statuts ?? [])
        .filter((s: any) => s.ban_chargee)
        .map((s: any) => s.code_insee as string)
      setCommunesCodes(codes)
    } catch {
      // silencieux
    }
  }, [])

  useEffect(() => {
    loadZones()
    loadSnapshots()
    loadCommunesCodes()
  }, [loadZones, loadSnapshots, loadCommunesCodes])

  useEffect(() => {
    if (!showDpeRecents) { setDpeAdresses([]); return }
    if (communesCodes.length === 0) return
    setLoadingDpe(true)
    fetch(`/api/dpe/recents?code_insee=${communesCodes.join(',')}`)
      .then(r => r.json())
      .then(data => setDpeAdresses(data.adresses ?? []))
      .catch(() => setDpeAdresses([]))
      .finally(() => setLoadingDpe(false))
  }, [showDpeRecents, communesCodes])

  const loadItineraire = useCallback(async (zoneId: string) => {
    const res  = await fetch(`/api/zones/${zoneId}`)
    const data = await res.json()
    const adresses = (data.itineraire ?? []).map((row: any) => row.adresse).filter(Boolean)
    setItineraire(adresses)
  }, [])

  const handleSelectZone = useCallback((zone: Zone) => {
    setSelectedZone(zone)
    loadItineraire(zone.id)
  }, [loadItineraire])

  const handleReset = async () => {
    if (!confirm('Supprimer TOUTES les zones et repartir à zéro ?\nUn snapshot sera sauvegardé automatiquement.\nLes sessions de prospection sont conservées.')) return
    setResetting(true)
    const res = await fetch('/api/zones/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sauvegarder: true }),
    })
    const data = await res.json()
    setResetting(false)
    if (!res.ok) { alert(data.error ?? 'Erreur reset'); return }
    await loadZones()
    await loadSnapshots()
  }

  const handleDeleteSnapshot = async (id: string) => {
    if (!confirm('Supprimer cet enregistrement ?')) return
    await fetch(`/api/zones/snapshots/${id}`, { method: 'DELETE' })
    await loadSnapshots()
  }

  const handleGenerateClick = () => setShowConfig(true)

  const handleConfirmGenerate = async (config: ZoneConfig) => {
    setShowConfig(false)
    setGenerating(true)
    setGenerateError(null)
    setWarnings([])
    try {
      const res  = await fetch('/api/zones/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nb_zones:            config.nb_zones,
          capacite_cible:      config.capacite_cible,
          rayon_alerte_metres: (config as any).rayon_alerte_metres,
          exclure_commerces:   config.exclure_commerces,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenerateError(data.error ?? 'Erreur inconnue')
      } else {
        if (data.warnings?.length > 0) setWarnings(data.warnings)
        await loadZones()
        setSelectedZone(null)
        setItineraire([])
      }
    } catch {
      setGenerateError('Erreur réseau')
    } finally {
      setGenerating(false)
    }
  }

  const openEdit = async (zone: Zone, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingZone(zone)
    setEditNom(zone.nom)
    setEditCouleur(zone.couleur)
    setHistorique([])
    setLoadingHistorique(true)
    const res  = await fetch(`/api/zones/${zone.id}/historique`)
    const data = await res.json()
    setHistorique(data.historique ?? [])
    setLoadingHistorique(false)
  }

  const saveEdit = async () => {
    if (!editingZone) return
    setSaveStatus('saving')
    const res = await fetch(`/api/zones/${editingZone.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: editNom, couleur: editCouleur }),
    })
    if (res.ok) {
      setZones(prev => prev.map(z =>
        z.id === editingZone.id ? { ...z, nom: editNom, couleur: editCouleur } : z
      ))
      if (selectedZone?.id === editingZone.id) {
        setSelectedZone(prev => prev ? { ...prev, nom: editNom, couleur: editCouleur } : null)
      }
      setSaveStatus('saved')
      setTimeout(() => { setEditingZone(null); setSaveStatus('idle') }, 600)
    } else {
      const d = await res.json().catch(() => ({}))
      alert('Erreur : ' + (d.error ?? 'impossible de sauvegarder'))
      setSaveStatus('idle')
    }
  }

  const handleRestaurer = async (version: number) => {
    if (!editingZone) return
    if (!confirm(`Restaurer la version ${version} de cette zone ?`)) return
    setRestoringVersion(version)
    const res = await fetch(`/api/zones/${editingZone.id}/restaurer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    })
    setRestoringVersion(null)
    if (res.ok) {
      await loadZones()
      await loadChevauchements()
      setEditingZone(null)
    }
  }

  const deleteZone = async (zoneId: string) => {
    if (!confirm('Supprimer cette zone ?')) return
    await fetch(`/api/zones/${zoneId}`, { method: 'DELETE' })
    await loadZones()
    if (selectedZone?.id === zoneId) { setSelectedZone(null); setItineraire([]) }
    setEditingZone(null)
  }

  const totalAdresses    = zones.reduce((s, z) => s + (z.nb_prospectables ?? 0), 0)
  const zonesEnAttention = zones.filter((z) => z.statut === 'attention').length
  const nbDpeRecents     = dpeAdresses.length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background: C.bg }}>

      {/* ── Header ── */}
      <header style={{
        background: C.card, borderBottom:`1px solid ${C.border}`,
        padding:'0 20px', height:52, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/dashboard" style={{ color: C.muted, textDecoration:'none', fontSize:'0.8rem' }}>
            ← Dashboard
          </Link>
          <span style={{ color: C.border }}>|</span>
          <span style={{ fontWeight:600, fontSize:'0.9375rem', color: C.text }}>
            🗺️ Zones de prospection
          </span>
          {zones.length > 0 && (
            <span style={{
              background:'rgba(34,197,94,0.1)', color:'#4ADE80',
              fontSize:'0.75rem', fontWeight:600,
              padding:'2px 8px', borderRadius:20,
              border:'1px solid rgba(34,197,94,0.25)',
            }}>
              {zones.length} zones · {totalAdresses.toLocaleString('fr-FR')} adresses
            </span>
          )}
          {zonesEnAttention > 0 && (
            <span style={{
              background:'rgba(251,191,36,0.1)', color:'#FBBF24',
              fontSize:'0.75rem', fontWeight:600,
              padding:'2px 8px', borderRadius:20,
              border:'1px solid rgba(251,191,36,0.25)',
            }}>
              ⚠ {zonesEnAttention} zone{zonesEnAttention > 1 ? 's' : ''} à revoir
            </span>
          )}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setSidebarOpen(v => !v)}
            style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${C.borderl}`, background:'rgba(255,255,255,0.06)', fontSize:'0.8rem', color: C.mid, cursor:'pointer' }}>
            {sidebarOpen ? '◀' : '▶ Zones'}
          </button>

          {zones.length > 0 && (
            <Link href="/zones/edit" style={{
              padding:'7px 14px', borderRadius:8,
              background:'rgba(34,197,94,0.1)', color:'#4ADE80',
              border:'1px solid rgba(34,197,94,0.25)',
              fontSize:'0.875rem', fontWeight:600,
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5,
            }}>
              ✏️ Éditer les zones
            </Link>
          )}
          {snapshots.length > 0 && (
            <button onClick={() => setShowSnapshots(v => !v)} style={{
              cursor:'pointer', padding:'7px 12px', borderRadius:8,
              background:'rgba(255,255,255,0.06)', color: C.mid,
              border:`1px solid ${C.borderl}`,
              fontSize:'0.875rem', fontWeight:500,
              display:'inline-flex', alignItems:'center', gap:5,
            }}>
              🗂 {snapshots.length} sauvegarde{snapshots.length > 1 ? 's' : ''}
              {showSnapshots ? ' ▲' : ' ▼'}
            </button>
          )}
          {zones.length > 0 && (
            <button onClick={handleReset} disabled={resetting} style={{
              padding:'7px 12px', borderRadius:8,
              background:'rgba(239,68,68,0.1)', color:'#FCA5A5',
              border:'1px solid rgba(239,68,68,0.25)',
              fontSize:'0.875rem', fontWeight:600,
              cursor: resetting ? 'not-allowed' : 'pointer',
            }}>
              {resetting ? '…' : '🗑 Reset'}
            </button>
          )}
          {selectedForPrint.size > 0 && (
            <button onClick={() => window.open('/zones/print?ids=' + [...selectedForPrint].join(','), '_blank')}
              style={{ padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:600, background:'rgba(29,158,117,0.1)', border:`1.5px solid ${C.primary}`, color:'#4ADE80', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              🖨 Imprimer ({selectedForPrint.size})
            </button>
          )}
          <button onClick={handleGenerateClick} disabled={generating} style={{
            padding:'7px 16px', borderRadius:8,
            background: generating ? C.dim : C.primary,
            color:'#fff', border:'none',
            fontSize:'0.875rem', fontWeight:600,
            cursor: generating ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', gap:6,
          }}>
            {generating
              ? <><span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>⟳</span> Génération…</>
              : zones.length > 0 ? '↺ Régénérer' : '✦ Générer les zones'
            }
          </button>
        </div>
      </header>

      {/* Légende DPE — visible quand le toggle est actif */}
      {showDpeRecents && (
        <div style={{
          background:'rgba(251,191,36,0.06)', borderBottom:`1px solid rgba(251,191,36,0.15)`,
          padding:'6px 20px',
          display:'flex', alignItems:'center', gap:16,
          fontSize:'0.75rem', color:'#FBBF24',
        }}>
          <span style={{ fontWeight:600 }}>⚡ DPE établis dans les 6 derniers mois :</span>
          {[
            { label:'A', color:'#16a34a' }, { label:'B', color:'#4ade80' },
            { label:'C', color:'#84cc16' }, { label:'D', color:'#facc15' },
            { label:'E', color:'#f97316' }, { label:'F', color:'#ef4444' },
            { label:'G', color:'#b91c1c' },
          ].map(({ label, color }) => (
            <span key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:10, height:10, borderRadius:'50%', background:color, display:'inline-block' }}/>
              {label}
            </span>
          ))}
          {zones.length > 0 && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button onClick={selectAllForPrint} style={{ fontSize:11, color: C.primary, background:'none', border:'none', cursor:'pointer', padding:0 }}>
                Tout sélectionner
              </button>
              {selectedForPrint.size > 0 && (
                <button onClick={() => setSelectedForPrint(new Set())} style={{ fontSize:11, color: C.muted, background:'none', border:'none', cursor:'pointer', padding:0 }}>
                  Désélectionner ({selectedForPrint.size})
                </button>
              )}
            </div>
          )}
          <span style={{ marginLeft:'auto', color:'#D97706' }}>
            {nbDpeRecents > 0 ? `${nbDpeRecents} adresses` : 'Aucun DPE récent trouvé'}
          </span>
        </div>
      )}

      {/* Panneau historique snapshots */}
      {showSnapshots && snapshots.length > 0 && (
        <div style={{ background: C.card, borderBottom:`1px solid ${C.border}`, padding:'12px 20px' }}>
          <div style={{ fontSize:'0.78rem', fontWeight:600, color: C.mid, marginBottom:8 }}>
            Historique des découpages ({snapshots.length}/5)
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {snapshots.map((s: any) => (
              <div key={s.id} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'8px 12px', borderRadius:8,
                background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}`,
              }}>
                <div>
                  <div style={{ fontSize:'0.82rem', fontWeight:500, color: C.text }}>{s.nom}</div>
                  <div style={{ fontSize:'0.72rem', color: C.muted, marginTop:1 }}>
                    {s.nb_zones} zones · {new Date(s.created_at).toLocaleDateString('fr-FR', {
                      day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
                    })}
                  </div>
                </div>
                <button onClick={() => handleDeleteSnapshot(s.id)} style={{
                  padding:'4px 10px', borderRadius:6,
                  background:'transparent', color:'#FCA5A5',
                  border:'1px solid rgba(239,68,68,0.3)', fontSize:'0.75rem', cursor:'pointer',
                }}>Supprimer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Erreurs */}
      {generateError && (
        <div style={{ background:'rgba(239,68,68,0.08)', borderBottom:`1px solid rgba(239,68,68,0.25)`, padding:'10px 20px', fontSize:'0.875rem', color:'#FCA5A5', display:'flex', justifyContent:'space-between' }}>
          <span>⚠ {generateError}</span>
          <button onClick={() => setGenerateError(null)} style={{ background:'none', border:'none', color:'#FCA5A5', cursor:'pointer' }}>✕</button>
        </div>
      )}

      {/* Chevauchements */}
      {chevauchements.length > 0 && (
        <div style={{ background:'rgba(239,68,68,0.08)', borderBottom:`1px solid rgba(239,68,68,0.25)`, padding:'8px 20px', fontSize:'0.8rem', color:'#FCA5A5', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontWeight:600 }}>⚠ {chevauchements.length} chevauchement{chevauchements.length > 1 ? 's' : ''} détecté{chevauchements.length > 1 ? 's' : ''} :</span>
          <span>{chevauchements.map(c => `${c.zone_a_nom} ↔ ${c.zone_b_nom} (${c.nb_adresses} adresses)`).join(' · ')}</span>
          <button onClick={loadChevauchements} style={{ marginLeft:'auto', background:'none', border:'none', color:'#FCA5A5', cursor:'pointer' }}>↺</button>
        </div>
      )}

      {/* Avertissements */}
      {warnings.length > 0 && (
        <div style={{ background:'rgba(251,191,36,0.08)', borderBottom:`1px solid rgba(251,191,36,0.2)`, padding:'10px 20px', fontSize:'0.8rem', color:'#FBBF24' }}>
          <strong>⚠ Avertissements :</strong> {warnings.slice(0,3).join(' · ')}
          {warnings.length > 3 && ` (+${warnings.length - 3} autres)`}
          <button onClick={() => setWarnings([])} style={{ marginLeft:12, background:'none', border:'none', color:'#FBBF24', cursor:'pointer' }}>✕</button>
        </div>
      )}

      {/* Corps */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Sidebar */}
        {sidebarOpen && (
          <aside style={{
            width:280, flexShrink:0,
            borderRight:`1px solid ${C.border}`, background: C.card,
            display:'flex', flexDirection:'column', overflow:'hidden',
          }}>
            {loading ? (
              <div style={{ padding:24, color: C.muted, fontSize:'0.875rem' }}>Chargement…</div>
            ) : zones.length === 0 ? (
              <div style={{ padding:24, textAlign:'center' }}>
                <div style={{ fontSize:'2rem', marginBottom:12 }}>🗺️</div>
                <p style={{ fontSize:'0.875rem', color: C.mid, lineHeight:1.5 }}>
                  Cliquez sur <strong style={{ color: C.text }}>&ldquo;Générer les zones&rdquo;</strong> pour démarrer.
                </p>
              </div>
            ) : (
              <>
                <div style={{ padding:'10px 16px 6px', borderBottom:`1px solid ${C.border}`, fontSize:'0.75rem', color: C.muted }}>
                  Cliquez sur une zone pour voir l&apos;itinéraire
                </div>
                <div style={{ overflowY:'auto', flex:1 }}>
                  {zones.map((zone) => (
                    <div key={zone.id} onClick={() => handleSelectZone(zone)} style={{
                      padding:'10px 16px', borderBottom:`1px solid ${C.border}`,
                      cursor:'pointer',
                      background: selectedZone?.id === zone.id ? 'rgba(29,158,117,0.10)' : 'transparent',
                      display:'flex', alignItems:'center', gap:10,
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedForPrint.has(zone.id)}
                        onChange={e => { e.stopPropagation(); togglePrint(zone.id) }}
                        onClick={e => e.stopPropagation()}
                        style={{ accentColor: C.primary, width:14, height:14, flexShrink:0, cursor:'pointer' }}
                      />
                      <div style={{ width:12, height:12, borderRadius:'50%', background:zone.couleur, flexShrink:0 }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:'0.85rem', color: C.text, display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{zone.nom}</span>
                          {zone.statut === 'attention' && (
                            <span title="Zone trop grande ou surchargée" style={{ flexShrink:0 }}>⚠️</span>
                          )}
                        </div>
                        <div style={{ fontSize:'0.75rem', color: C.muted, marginTop:1, display:'flex', alignItems:'center', gap:6 }}>
                          <span>{zone.nb_prospectables} adresses</span>
                          {zone.dpe_score != null && (
                            <span style={{
                              background: zone.dpe_score >= 60 ? 'rgba(34,197,94,0.1)' : zone.dpe_score >= 35 ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)',
                              color:      zone.dpe_score >= 60 ? '#4ADE80'              : zone.dpe_score >= 35 ? '#FBBF24'              : C.muted,
                              border:     `1px solid ${zone.dpe_score >= 60 ? 'rgba(34,197,94,0.25)' : zone.dpe_score >= 35 ? 'rgba(251,191,36,0.25)' : C.border}`,
                              borderRadius:10, padding:'0px 5px',
                              fontSize:'0.68rem', fontWeight:600, flexShrink:0,
                            }}
                              title={`Score DPE : ${zone.dpe_score}/100`}>
                              ⚡ {zone.dpe_score}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={(e) => openEdit(zone, e)}
                        style={{ background:'none', border:'none', color: C.muted, cursor:'pointer', fontSize:'0.875rem', flexShrink:0 }}>
                        ✎
                      </button>
                    </div>
                  ))}
                </div>

                {/* Barres capacité */}
                <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, background:'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize:'0.72rem', color: C.muted, marginBottom:6 }}>
                    Charge par zone (cible ~100)
                  </div>
                  {zones.map((z) => {
                    const pct   = Math.min(100, (z.nb_prospectables / 150) * 100)
                    const color = z.nb_prospectables < 60 ? '#3b82f6' : z.nb_prospectables > 150 ? '#ef4444' : '#22c55e'
                    return (
                      <div key={z.id} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:z.couleur, flexShrink:0 }}/>
                        <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:2 }}/>
                        </div>
                        <span style={{ fontSize:'0.68rem', color: C.muted, width:26, textAlign:'right' }}>
                          {z.nb_prospectables}
                        </span>
                      </div>
                    )
                  })}

                  {showDpeRecents && nbDpeRecents > 0 && (
                    <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}`, fontSize:'0.72rem', color:'#FBBF24', fontWeight:500 }}>
                      ⚡ {nbDpeRecents} adresses avec DPE &lt; 6 mois
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}

        {/* Carte */}
        <div style={{ flex:1, position:'relative' }}>
          <ZonesMap
            zones={zones}
            selectedZoneId={selectedZone?.id}
            itineraire={itineraire}
            chevauchements={chevauchements}
            onZoneClick={handleSelectZone}
            showDpeRecents={showDpeRecents}
            dpeAdresses={dpeAdresses}
          />

          {selectedZone && (
            <div style={{
              position:'absolute', bottom:32, left:'50%', transform:'translateX(-50%)',
              background: C.card, borderRadius:12, border:`1px solid ${C.borderl}`,
              padding:'10px 18px', boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
              display:'flex', alignItems:'center', gap:14, whiteSpace:'nowrap',
            }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:selectedZone.couleur }}/>
              <strong style={{ color: C.text, fontSize:'0.875rem' }}>{selectedZone.nom}</strong>
              <span style={{ color: C.mid, fontSize:'0.8rem' }}>{itineraire.length} adresses</span>
              {itineraire.length > 0 && (
                <span style={{ background:'rgba(34,197,94,0.1)', color:'#4ADE80', padding:'2px 8px', borderRadius:10, fontSize:'0.72rem', fontWeight:600 }}>
                  Itinéraire affiché
                </span>
              )}
              {selectedZone.dpe_score != null && (
                <span style={{ background:'rgba(251,191,36,0.1)', color:'#FBBF24', padding:'2px 8px', borderRadius:10, fontSize:'0.72rem', fontWeight:600 }}>
                  ⚡ Score DPE {selectedZone.dpe_score}/100
                </span>
              )}
              <button onClick={() => { setSelectedZone(null); setItineraire([]) }}
                style={{ background:'none', border:'none', color: C.muted, cursor:'pointer', fontSize:'0.8rem' }}>✕</button>
            </div>
          )}

          {!loading && zones.length === 0 && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
              <div style={{
                background:'rgba(20,20,22,0.92)', backdropFilter:'blur(8px)',
                borderRadius:16, padding:'24px 32px', textAlign:'center',
                border:`1px solid ${C.borderl}`,
              }}>
                <div style={{ fontSize:'2rem', marginBottom:8 }}>🗺️</div>
                <p style={{ fontWeight:600, color: C.text, marginBottom:4 }}>Aucune zone</p>
                <p style={{ fontSize:'0.8rem', color: C.muted }}>Cliquez sur &ldquo;Générer les zones&rdquo;</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal config ── */}
      {showConfig && (
        <ZoneConfigModal
          nbAdressesTotal={nbAdressesTotal || zones.reduce((s, z) => s + z.nb_adresses, 0) || 9254}
          onConfirm={handleConfirmGenerate}
          onCancel={() => setShowConfig(false)}
        />
      )}

      {/* ── Modal édition zone ── */}
      {editingZone && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={() => setEditingZone(null)}>
          <div style={{ background: C.card, borderRadius:16, padding:28, width:340, boxShadow:'0 20px 60px rgba(0,0,0,0.5)', border:`1px solid ${C.borderl}` }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin:'0 0 6px', fontSize:'1rem', fontWeight:700, color: C.text }}>Modifier la zone</h3>
            <p style={{ fontSize:'0.75rem', color: C.muted, margin:'0 0 18px' }}>
              Le nom personnalisé sera affiché dans toutes les pages de l&apos;application.
            </p>

            <label style={{ fontSize:'0.8rem', fontWeight:600, color: C.mid, display:'block', marginBottom:6 }}>Nom</label>
            <input value={editNom} onChange={(e) => setEditNom(e.target.value)} maxLength={45}
              style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:`1.5px solid ${C.borderl}`, fontSize:'0.9rem', marginBottom:4, boxSizing:'border-box' as const, background:'rgba(255,255,255,0.05)', color: C.text, outline:'none' }}/>
            <div style={{ fontSize:'0.72rem', color: editNom.length >= 40 ? '#FBBF24' : C.muted, textAlign:'right', marginBottom:14 }}>
              {editNom.length}/45 caractères
            </div>

            <label style={{ fontSize:'0.8rem', fontWeight:600, color: C.mid, display:'block', marginBottom:8 }}>Couleur</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginBottom:10 }}>
              {PALETTE.map((c) => (
                <button key={c} onClick={() => setEditCouleur(c)}
                  style={{ width:26, height:26, borderRadius:'50%', background:c, border: editCouleur === c ? '3px solid #fff' : '2px solid transparent', cursor:'pointer', transform: editCouleur === c ? 'scale(1.2)' : 'scale(1)', transition:'transform 0.1s' }}/>
              ))}
            </div>

            {/* Colorpicker couleur libre */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}` }}>
              <span style={{ fontSize:'0.75rem', color: C.muted, fontWeight:500 }}>Couleur libre :</span>
              <input type="color" value={editCouleur} onChange={(e) => setEditCouleur(e.target.value)}
                style={{ width:32, height:32, borderRadius:6, border:`1.5px solid ${C.borderl}`, cursor:'pointer', padding:2, background:'none' }} />
              <div style={{ width:20, height:20, borderRadius:'50%', background:editCouleur, border:`2px solid ${C.borderl}`, flexShrink:0 }} />
              <span style={{ fontSize:'0.72rem', color: C.muted, fontFamily:'monospace' }}>{editCouleur.toUpperCase()}</span>
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'space-between' }}>
              <button onClick={() => deleteZone(editingZone.id)}
                style={{ padding:'8px 12px', borderRadius:8, background:'none', border:'1px solid rgba(239,68,68,0.3)', color:'#FCA5A5', cursor:'pointer', fontSize:'0.8rem' }}>
                Supprimer
              </button>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setEditingZone(null)}
                  style={{ padding:'8px 14px', borderRadius:8, background:'rgba(255,255,255,0.06)', border:`1px solid ${C.borderl}`, color: C.mid, cursor:'pointer', fontSize:'0.875rem' }}>
                  Annuler
                </button>
                <button onClick={saveEdit} disabled={saveStatus === 'saving'}
                  style={{ padding:'8px 18px', borderRadius:8, background: saveStatus === 'saved' ? '#22C55E' : C.primary, color:'#fff', border:'none', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 }}>
                  {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
