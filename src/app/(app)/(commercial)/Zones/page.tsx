'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const ZonesMap = dynamic(() => import('@/components/map/ZonesMap'), { ssr: false })

interface Zone {
  id: string
  nom: string
  couleur: string
  numero: number
  nb_adresses: number
  nb_prospectables: number
  polygone_geojson?: any
  centroide_geojson?: any
}

interface AdresseItineraire {
  id: string          // TEXT — identifiant BAN (ex: "22168_0440_00003")
  lat: number
  lon: number
  numero?: string
  nom_voie?: string
  type_bien?: string
}

const PALETTE = [
  '#E63946','#2196F3','#FF9800','#4CAF50','#9C27B0',
  '#00BCD4','#FF5722','#607D8B','#795548',
]

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [itineraire, setItineraire] = useState<AdresseItineraire[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editCouleur, setEditCouleur] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── Charger les zones ──
  const loadZones = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/zones')
      const data = await res.json()
      setZones(data.zones ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadZones() }, [loadZones])

  // ── Charger itinéraire d'une zone ──
  const loadItineraire = useCallback(async (zoneId: string) => {
    const res = await fetch(`/api/zones/${zoneId}`)
    const data = await res.json()
    const adresses = (data.itineraire ?? []).map((row: any) => row.adresse).filter(Boolean)
    setItineraire(adresses)
  }, [])

  const handleSelectZone = useCallback((zone: Zone) => {
    setSelectedZone(zone)
    loadItineraire(zone.id)
  }, [loadItineraire])

  // ── Générer les zones ──
  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/zones/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nb_zones: 9 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenerateError(data.error ?? 'Erreur inconnue')
      } else {
        await loadZones()
        setSelectedZone(null)
        setItineraire([])
      }
    } catch (e) {
      setGenerateError('Erreur réseau')
    } finally {
      setGenerating(false)
    }
  }

  // ── Éditer une zone ──
  const openEdit = (zone: Zone, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingZone(zone)
    setEditNom(zone.nom)
    setEditCouleur(zone.couleur)
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
      setTimeout(() => {
        setEditingZone(null)
        setSaveStatus('idle')
      }, 700)
    }
  }

  const deleteZone = async (zoneId: string) => {
    if (!confirm('Supprimer cette zone ? Les adresses seront désaffectées.')) return
    await fetch(`/api/zones/${zoneId}`, { method: 'DELETE' })
    await loadZones()
    if (selectedZone?.id === zoneId) {
      setSelectedZone(null)
      setItineraire([])
    }
    setEditingZone(null)
  }

  const totalAdresses = zones.reduce((s, z) => s + (z.nb_prospectables ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8f7f4' }}>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>🗺️</span>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>
              Zones de prospection
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
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            style={{
              padding: '6px 10px', borderRadius: 7,
              border: '1px solid #e8e7e0', background: '#fff',
              fontSize: '0.8rem', color: '#5F5E5A', cursor: 'pointer',
            }}
          >
            {sidebarOpen ? '◀ Masquer' : '▶ Zones'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '7px 16px', borderRadius: 8,
              background: generating ? '#9b9b96' : '#1D9E75',
              color: '#fff', border: 'none',
              fontSize: '0.875rem', fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.2s',
            }}
          >
            {generating ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                Génération…
              </>
            ) : zones.length > 0 ? (
              '↺ Régénérer les zones'
            ) : (
              '✦ Générer 9 zones'
            )}
          </button>
        </div>
      </header>

      {/* ── Erreur de génération ── */}
      {generateError && (
        <div style={{
          background: '#fef2f2', borderBottom: '1px solid #fecaca',
          padding: '10px 20px', fontSize: '0.875rem', color: '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>⚠ {generateError}</span>
          <button onClick={() => setGenerateError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* ── Corps principal ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 280, flexShrink: 0,
            borderRight: '1px solid #e8e7e0',
            background: '#fff',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: 24, color: '#9b9b96', fontSize: '0.875rem' }}>
                Chargement…
              </div>
            ) : zones.length === 0 ? (
              <div style={{ padding: 24 }}>
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🗺️</div>
                  <p style={{ fontSize: '0.875rem', color: '#5F5E5A', lineHeight: 1.5, marginBottom: 8 }}>
                    Aucune zone configurée.
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#9b9b96', lineHeight: 1.5 }}>
                    Cliquez sur <strong>"Générer 9 zones"</strong> pour découper automatiquement votre secteur.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #f0efeb' }}>
                  <p style={{ fontSize: '0.75rem', color: '#9b9b96', margin: 0 }}>
                    Cliquez sur une zone pour voir l'itinéraire
                  </p>
                </div>
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    onClick={() => handleSelectZone(zone)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f8f7f4',
                      cursor: 'pointer',
                      background: selectedZone?.id === zone.id ? '#f0fdf4' : 'transparent',
                      transition: 'background 0.15s',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    {/* Pastille couleur */}
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: zone.couleur, flexShrink: 0,
                      boxShadow: selectedZone?.id === zone.id ? `0 0 0 3px ${zone.couleur}33` : 'none',
                    }} />

                    {/* Infos */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600, fontSize: '0.875rem', color: '#1a1a18',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {zone.nom}
                        </span>
                        <span style={{
                          fontSize: '0.7rem', color: '#9b9b96',
                          background: '#f8f7f4', padding: '1px 6px', borderRadius: 10,
                          flexShrink: 0,
                        }}>
                          #{zone.numero}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#5F5E5A', marginTop: 2 }}>
                        {zone.nb_prospectables} adresses prospectables
                        {zone.nb_adresses !== zone.nb_prospectables && (
                          <span style={{ color: '#9b9b96' }}>
                            {' '}(+{zone.nb_adresses - zone.nb_prospectables} LS)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bouton édition */}
                    <button
                      onClick={(e) => openEdit(zone, e)}
                      style={{
                        background: 'none', border: 'none',
                        color: '#9b9b96', cursor: 'pointer',
                        padding: '2px 4px', borderRadius: 4,
                        fontSize: '0.875rem',
                        flexShrink: 0,
                      }}
                      title="Modifier"
                    >
                      ✎
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Légende capacité */}
            {zones.length > 0 && (
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid #f0efeb',
                background: '#fafaf8',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginBottom: 6 }}>
                  Capacité cible : 100–150 adresses/zone
                </div>
                {zones.map((z) => {
                  const pct = Math.min(100, (z.nb_prospectables / 150) * 100)
                  const color = z.nb_prospectables < 80
                    ? '#ef4444'
                    : z.nb_prospectables > 170
                    ? '#f97316'
                    : '#22c55e'
                  return (
                    <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.couleur, flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 4, background: '#e8e7e0', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#9b9b96', width: 24, textAlign: 'right' }}>
                        {z.nb_prospectables}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </aside>
        )}

        {/* ── Carte ── */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ZonesMap
            zones={zones}
            selectedZoneId={selectedZone?.id}
            itineraire={itineraire}
            onZoneClick={handleSelectZone}
          />

          {/* Info zone sélectionnée (overlay bas) */}
          {selectedZone && (
            <div style={{
              position: 'absolute', bottom: 32, left: '50%',
              transform: 'translateX(-50%)',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e8e7e0',
              padding: '12px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'center', gap: 16,
              fontSize: '0.875rem',
              whiteSpace: 'nowrap',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: selectedZone.couleur,
              }} />
              <strong style={{ color: '#1a1a18' }}>{selectedZone.nom}</strong>
              <span style={{ color: '#5F5E5A' }}>
                {itineraire.length} adresses
              </span>
              {itineraire.length > 0 && (
                <span style={{
                  background: '#f0fdf4', color: '#16a34a',
                  padding: '2px 8px', borderRadius: 10,
                  fontSize: '0.75rem', fontWeight: 600,
                }}>
                  Itinéraire affiché
                </span>
              )}
              <button
                onClick={() => { setSelectedZone(null); setItineraire([]) }}
                style={{
                  background: 'none', border: 'none',
                  color: '#9b9b96', cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Message si pas de zones */}
          {!loading && zones.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)',
                borderRadius: 16, padding: '24px 32px',
                textAlign: 'center',
                border: '1px solid #e8e7e0',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🗺️</div>
                <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: 4 }}>
                  Secteur sans zones
                </p>
                <p style={{ fontSize: '0.8rem', color: '#9b9b96' }}>
                  Cliquez sur "Générer 9 zones" pour commencer
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal édition zone ── */}
      {editingZone && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setEditingZone(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16,
              padding: 28, width: 360,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18' }}>
              Modifier la zone
            </h3>

            {/* Nom */}
            <label style={{ fontSize: '0.8rem', color: '#5F5E5A', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Nom de la zone
            </label>
            <input
              value={editNom}
              onChange={(e) => setEditNom(e.target.value)}
              maxLength={50}
              style={{
                width: '100%', padding: '9px 12px',
                borderRadius: 8, border: '1.5px solid #e8e7e0',
                fontSize: '0.9rem', color: '#1a1a18',
                outline: 'none', boxSizing: 'border-box',
                marginBottom: 18,
              }}
              onFocus={(e) => (e.target.style.borderColor = '#1D9E75')}
              onBlur={(e) => (e.target.style.borderColor = '#e8e7e0')}
            />

            {/* Couleur */}
            <label style={{ fontSize: '0.8rem', color: '#5F5E5A', fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Couleur
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setEditCouleur(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: c, border: editCouleur === c ? '3px solid #1a1a18' : '2px solid transparent',
                    cursor: 'pointer', outline: 'none',
                    transition: 'transform 0.15s',
                    transform: editCouleur === c ? 'scale(1.25)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            {/* Stats (lecture seule) */}
            <div style={{
              background: '#f8f7f4', borderRadius: 8,
              padding: '10px 14px', marginBottom: 20,
              fontSize: '0.8rem', color: '#5F5E5A',
            }}>
              <strong>{editingZone.nb_prospectables}</strong> adresses prospectables
              {editingZone.nb_adresses !== editingZone.nb_prospectables && (
                <span style={{ color: '#9b9b96' }}>
                  {' '}(+{editingZone.nb_adresses - editingZone.nb_prospectables} logements sociaux)
                </span>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button
                onClick={() => deleteZone(editingZone.id)}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: 'none', border: '1px solid #fecaca',
                  color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                Supprimer
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setEditingZone(null)}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    background: '#f8f7f4', border: '1px solid #e8e7e0',
                    color: '#5F5E5A', cursor: 'pointer', fontSize: '0.875rem',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saveStatus === 'saving'}
                  style={{
                    padding: '8px 20px', borderRadius: 8,
                    background: saveStatus === 'saved' ? '#4CAF50' : '#1D9E75',
                    color: '#fff', border: 'none',
                    cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
                    transition: 'background 0.2s',
                  }}
                >
                  {saveStatus === 'saving' ? 'Enregistrement…' : saveStatus === 'saved' ? '✓ Enregistré' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
