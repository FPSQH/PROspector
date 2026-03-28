'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ZoneConfigModal, DEFAULT_CONFIG } from '@/components/zones/ZoneConfigModal'
import type { ZoneConfig } from '@/components/zones/ZoneConfigModal'

const ZonesMap = dynamic(() => import('@/components/map/ZonesMap'), { ssr: false })

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
}

interface AdresseItineraire {
  id: string
  lat: number
  lon: number
  numero?: string
  nom_voie?: string
  type_bien?: string
}

const PALETTE = [
  '#E63946','#2196F3','#FF9800','#4CAF50','#9C27B0',
  '#00BCD4','#FF5722','#607D8B','#795548','#E91E63',
  '#00897B','#F57F17',
]

export default function ZonesPage() {
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chevauchements, setChevauchements] = useState<Chevauchement[]>([])
  const [historique, setHistorique] = useState<VersionHistorique[]>([])
  const [loadingHistorique, setLoadingHistorique] = useState(false)
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null)
  const [nbAdressesTotal, setNbAdressesTotal] = useState(0)

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

  // Charger aussi le nb total d'adresses du secteur si pas encore dans /api/zones
  useEffect(() => {
    loadZones()
    // Charger séparément le nb d'adresses total
    fetch('/api/communes').then(r => r.json()).then(d => {
      // On va chercher via une route dédiée ou on le calcule à partir des zones
    })
  }, [loadZones])

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

  // Ouvrir le modal de config avant de générer
  const handleGenerateClick = () => {
    setShowConfig(true)
  }

  // Lancer la génération avec la config choisie
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
          nb_zones:          config.nb_zones,
          capacite_cible:    config.capacite_cible,
          rayon_alerte_metres: config.rayon_alerte_metres,
          exclure_commerces: config.exclure_commerces,
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

  // Édition zone
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
      setSaveStatus('saved')
      await loadZones()
      await loadChevauchements()
      setTimeout(() => { setEditingZone(null); setSaveStatus('idle') }, 700)
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

  const totalAdresses = zones.reduce((s, z) => s + (z.nb_prospectables ?? 0), 0)
  const zonesEnAttention = zones.filter((z) => z.statut === 'attention').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8f7f4' }}>
      <style>{`
        @media (max-width: 768px) {
          .zones-header { padding: 0 12px !important; height: 48px !important; }
          .zones-header-title { font-size: 0.875rem !important; }
          .zones-header-btns { gap: 5px !important; }
          .zones-header-btn-text { display: none !important; }
          .zones-edit-link { padding: 6px 10px !important; font-size: 0.78rem !important; }
          .zones-gen-btn { padding: 6px 10px !important; font-size: 0.78rem !important; }
          .zones-sidebar { width: 100% !important; max-width: 100% !important; border-right: none !important; border-bottom: 1px solid #e8e7e0 !important; max-height: 200px !important; }
          .zones-sidebar-item { padding: 8px 12px !important; }
          .zones-main-layout { flex-direction: column !important; }
          .zones-map { min-height: 50dvh !important; }
          .zones-stats-row { font-size: 0.72rem !important; gap: 6px !important; flex-wrap: wrap !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 20px', height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" style={{ color: '#9b9b96', textDecoration: 'none', fontSize: '0.8rem' }}>
            ← Dashboard
          </Link>
          <span style={{ color: '#e8e7e0' }}>|</span>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>
            🗺️ Zones de prospection
          </span>
          {zones.length > 0 && (
            <span style={{
              background: '#f0fdf4', color: '#16a34a',
              fontSize: '0.75rem', fontWeight: 600,
              padding: '2px 8px', borderRadius: 20,
              border: '1px solid #bbf7d0',
            }}>
              {zones.length} zones · {totalAdresses.toLocaleString('fr-FR')} adresses
            </span>
          )}
          {zonesEnAttention > 0 && (
            <span style={{
              background: '#fffbeb', color: '#d97706',
              fontSize: '0.75rem', fontWeight: 600,
              padding: '2px 8px', borderRadius: 20,
              border: '1px solid #fde68a',
            }}>
              ⚠ {zonesEnAttention} zone{zonesEnAttention > 1 ? 's' : ''} à revoir
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              padding: '6px 10px', borderRadius: 7,
              border: '1px solid #e8e7e0', background: '#fff',
              fontSize: '0.8rem', color: '#5F5E5A', cursor: 'pointer',
            }}>
            {sidebarOpen ? '◀' : '▶ Zones'}
          </button>
          {zones.length > 0 && (
            <Link
              href="/zones/edit"
              style={{
                padding: '7px 14px', borderRadius: 8,
                background: '#f0fdf4', color: '#16a34a',
                border: '1px solid #bbf7d0',
                fontSize: '0.875rem', fontWeight: 600,
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              ✏️ Éditer les zones
            </Link>
          )}
          <button
            onClick={handleGenerateClick}
            disabled={generating}
            style={{
              padding: '7px 16px', borderRadius: 8,
              background: generating ? '#9b9b96' : '#1D9E75',
              color: '#fff', border: 'none',
              fontSize: '0.875rem', fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {generating
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Génération…</>
              : zones.length > 0 ? '↺ Régénérer' : '✦ Générer les zones'
            }
          </button>
        </div>
      </header>

      {/* Erreurs */}
      {generateError && (
        <div style={{
          background: '#fef2f2', borderBottom: '1px solid #fecaca',
          padding: '10px 20px', fontSize: '0.875rem', color: '#dc2626',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>⚠ {generateError}</span>
          <button onClick={() => setGenerateError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Chevauchements détectés */}
      {chevauchements.length > 0 && (
        <div style={{
          background: '#fef2f2', borderBottom: '1px solid #fecaca',
          padding: '8px 20px', fontSize: '0.8rem', color: '#dc2626',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontWeight: 600 }}>⚠ {chevauchements.length} chevauchement{chevauchements.length > 1 ? 's' : ''} détecté{chevauchements.length > 1 ? 's' : ''} :</span>
          <span>{chevauchements.map(c => `${c.zone_a_nom} ↔ ${c.zone_b_nom} (${c.nb_adresses} adresses)`).join(' · ')}</span>
          <button onClick={loadChevauchements} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>↺</button>
        </div>
      )}

      {/* Avertissements */}
      {warnings.length > 0 && (
        <div style={{
          background: '#fffbeb', borderBottom: '1px solid #fde68a',
          padding: '10px 20px', fontSize: '0.8rem', color: '#d97706',
        }}>
          <strong>⚠ Avertissements :</strong> {warnings.slice(0, 3).join(' · ')}
          {warnings.length > 3 && ` (+${warnings.length - 3} autres)`}
          <button onClick={() => setWarnings([])} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#d97706', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Corps */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} className="zones-main-layout">

        {/* Sidebar */}
        {sidebarOpen && (
          <aside style={{
            width: 280, flexShrink: 0,
            borderRight: '1px solid #e8e7e0', background: '#fff',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: 24, color: '#9b9b96', fontSize: '0.875rem' }}>Chargement…</div>
            ) : zones.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗺️</div>
                <p style={{ fontSize: '0.875rem', color: '#5F5E5A', lineHeight: 1.5 }}>
                  Cliquez sur <strong>"Générer les zones"</strong> pour démarrer.
                </p>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid #f0efeb', fontSize: '0.75rem', color: '#9b9b96' }}>
                  Cliquez sur une zone pour voir l'itinéraire
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {zones.map((zone) => (
                    <div
                      key={zone.id}
                      onClick={() => handleSelectZone(zone)}
                      style={{
                        padding: '10px 16px', borderBottom: '1px solid #f8f7f4',
                        cursor: 'pointer',
                        background: selectedZone?.id === zone.id ? '#f0fdf4' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <div style={{
                        width: 12, height: 12, borderRadius: '50%',
                        background: zone.couleur, flexShrink: 0,
                      }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1a1a18', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.nom}</span>
                          {zone.statut === 'attention' && (
                            <span title="Zone trop grande ou surchargée" style={{ flexShrink: 0 }}>⚠️</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#5F5E5A', marginTop: 1 }}>
                          {zone.nb_prospectables} adresses
                        </div>
                      </div>
                      <button
                        onClick={(e) => openEdit(zone, e)}
                        style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '0.875rem', flexShrink: 0 }}
                      >✎</button>
                    </div>
                  ))}
                </div>

                {/* Barres capacité */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f0efeb', background: '#fafaf8' }}>
                  <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 6 }}>
                    Charge par zone (cible ~100)
                  </div>
                  {zones.map((z) => {
                    const pct   = Math.min(100, (z.nb_prospectables / 150) * 100)
                    const color = z.nb_prospectables < 60 ? '#3b82f6' : z.nb_prospectables > 150 ? '#ef4444' : '#22c55e'
                    return (
                      <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.couleur, flexShrink: 0 }}/>
                        <div style={{ flex: 1, height: 4, background: '#e8e7e0', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }}/>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#9b9b96', width: 26, textAlign: 'right' }}>
                          {z.nb_prospectables}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </aside>
        )}

        {/* Carte */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ZonesMap
            zones={zones}
            selectedZoneId={selectedZone?.id}
            itineraire={itineraire}
            chevauchements={chevauchements}
            onZoneClick={handleSelectZone}
          />

          {selectedZone && (
            <div style={{
              position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
              background: '#fff', borderRadius: 12, border: '1px solid #e8e7e0',
              padding: '10px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap',
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: selectedZone.couleur }}/>
              <strong style={{ color: '#1a1a18', fontSize: '0.875rem' }}>{selectedZone.nom}</strong>
              <span style={{ color: '#5F5E5A', fontSize: '0.8rem' }}>{itineraire.length} adresses</span>
              {itineraire.length > 0 && (
                <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600 }}>
                  Itinéraire affiché
                </span>
              )}
              <button onClick={() => { setSelectedZone(null); setItineraire([]) }}
                style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          )}

          {!loading && zones.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
                borderRadius: 16, padding: '24px 32px', textAlign: 'center',
                border: '1px solid #e8e7e0',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🗺️</div>
                <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: 4 }}>Aucune zone</p>
                <p style={{ fontSize: '0.8rem', color: '#9b9b96' }}>Cliquez sur "Générer les zones"</p>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setEditingZone(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 18px', fontSize: '1rem', fontWeight: 700 }}>Modifier la zone</h3>

            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 6 }}>Nom</label>
            <input value={editNom} onChange={(e) => setEditNom(e.target.value)} maxLength={50}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e8e7e0', fontSize: '0.9rem', marginBottom: 16, boxSizing: 'border-box' as const }}/>

            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 8 }}>Couleur</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 20 }}>
              {PALETTE.map((c) => (
                <button key={c} onClick={() => setEditCouleur(c)}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: editCouleur === c ? '3px solid #1a1a18' : '2px solid transparent', cursor: 'pointer', transform: editCouleur === c ? 'scale(1.2)' : 'scale(1)' }}/>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button onClick={() => deleteZone(editingZone.id)}
                style={{ padding: '8px 12px', borderRadius: 8, background: 'none', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>
                Supprimer
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditingZone(null)}
                  style={{ padding: '8px 14px', borderRadius: 8, background: '#f8f7f4', border: '1px solid #e8e7e0', color: '#5F5E5A', cursor: 'pointer', fontSize: '0.875rem' }}>
                  Annuler
                </button>
                <button onClick={saveEdit} disabled={saveStatus === 'saving'}
                  style={{ padding: '8px 18px', borderRadius: 8, background: saveStatus === 'saved' ? '#4CAF50' : '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
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
