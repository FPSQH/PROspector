'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const ZoneEditorMap = dynamic(() => import('@/components/map/ZoneEditorMap'), { ssr: false })

interface Zone {
  id:               string
  nom:              string
  numero:           number
  couleur:          string
  nb_adresses:      number
  nb_prospectables: number
  statut:           string
  polygone_geojson?: any
  centroide_geojson?: any
}

type Mode = 'idle' | 'edit' | 'draw' | 'merge' | 'split'

export default function ZonesEditPage() {
  const router = useRouter()

  const [zones, setZones]               = useState<Zone[]>([])
  const [loading, setLoading]           = useState(true)
  const [mode, setMode]                 = useState<Mode>('idle')
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [mergeTarget, setMergeTarget]   = useState<Zone | null>(null)
  const [saving, setSaving]             = useState(false)
  const [status, setStatus]             = useState<{ type: 'success'|'error'|'warn'|'info'; msg: string } | null>(null)

  // Split state
  const [splitAxis, setSplitAxis]         = useState<'horizontal'|'vertical'>('vertical')
  const [splitPosition, setSplitPosition] = useState<number>(0)
  const [splitNomA, setSplitNomA]         = useState('')
  const [splitNomB, setSplitNomB]         = useState('')
  const [splitBounds, setSplitBounds]     = useState<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null)

  // Confirmation transfert
  const [confirmTransfert, setConfirmTransfert] = useState<{ nb: number; pendingGeoJSON: any } | null>(null)

  // Polygone en cours d'édition (vient de ZoneEditorMap)
  const pendingPolygonRef = useRef<any>(null)

  const loadZones = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/zones')
    const data = await res.json()
    setZones(data.zones ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadZones() }, [loadZones])

  const showStatus = (type: 'success'|'error'|'warn'|'info', msg: string) => {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 4000)
  }

  // ── Sélection de zone ──────────────────────────────────────────────────
  const handleSelectZone = (zone: Zone) => {
    if (mode === 'merge' && selectedZone && zone.id !== selectedZone.id) {
      setMergeTarget(zone)
      return
    }
    if (mode === 'draw') return
    setSelectedZone(zone)
    setMergeTarget(null)
    if (mode !== 'split') setMode('edit')

    // Initialiser le split sur le centroïde de la zone
    if (zone.polygone_geojson) {
      const geo = typeof zone.polygone_geojson === 'string'
        ? JSON.parse(zone.polygone_geojson) : zone.polygone_geojson
      const coords = geo?.coordinates?.[0] ?? []
      if (coords.length > 0) {
        const lons = coords.map((c: number[]) => c[0])
        const lats = coords.map((c: number[]) => c[1])
        const minLat = Math.min(...lats), maxLat = Math.max(...lats)
        const minLon = Math.min(...lons), maxLon = Math.max(...lons)
        setSplitBounds({ minLat, maxLat, minLon, maxLon })
        setSplitPosition(splitAxis === 'horizontal'
          ? (minLat + maxLat) / 2
          : (minLon + maxLon) / 2
        )
        setSplitNomA(`${zone.nom}a`)
        setSplitNomB(`${zone.nom}b`)
      }
    }
  }

  // ── Réception du polygone depuis la carte ─────────────────────────────
  const handlePolygonChange = (geojson: any) => {
    pendingPolygonRef.current = geojson
  }

  // ── Sauvegarder une modification ──────────────────────────────────────
  const handleSaveEdit = async (confirme = false) => {
    if (!selectedZone || !pendingPolygonRef.current) {
      showStatus('error', 'Aucune modification à sauvegarder')
      return
    }
    setSaving(true)
    const res = await fetch(`/api/zones/${selectedZone.id}/recalc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygone_geojson: pendingPolygonRef.current,
        confirme,
      }),
    })
    const data = await res.json()
    setSaving(false)

    if (data.confirmer_transfert) {
      setConfirmTransfert({ nb: data.nb_transferees, pendingGeoJSON: pendingPolygonRef.current })
      return
    }
    if (!res.ok) { showStatus('error', data.error ?? 'Erreur sauvegarde'); return }

    pendingPolygonRef.current = null
    showStatus('success', `Zone sauvegardée — ${data.nb_incluses} adresses`)
    await loadZones()
    setMode('idle')
    setSelectedZone(null)
  }

  // ── Confirmer le transfert d'adresses ─────────────────────────────────
  const handleConfirmTransfert = async () => {
    if (!confirmTransfert || !selectedZone) return
    setConfirmTransfert(null)
    pendingPolygonRef.current = confirmTransfert.pendingGeoJSON
    await handleSaveEdit(true)
  }

  // ── Sauvegarder une nouvelle zone dessinée ────────────────────────────
  const handleSaveDraw = async () => {
    if (!pendingPolygonRef.current) {
      showStatus('error', 'Dessinez d\'abord un polygone sur la carte')
      return
    }
    const nomBase = `Zone ${zones.length + 1}`
    setSaving(true)
    const res = await fetch('/api/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom:              nomBase,
        polygone_geojson: pendingPolygonRef.current,
      }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { showStatus('error', data.error ?? 'Erreur création'); return }
    pendingPolygonRef.current = null
    showStatus('success', `${nomBase} créée — ${data.nb_adresses} adresses`)
    await loadZones()
    setMode('idle')
  }

  // ── Fusionner ──────────────────────────────────────────────────────────
  const handleMerge = async () => {
    if (!selectedZone || !mergeTarget) return
    setSaving(true)
    const res = await fetch('/api/zones/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone_a_id: selectedZone.id, zone_b_id: mergeTarget.id }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { showStatus('error', data.error ?? 'Erreur fusion'); return }
    if (data.alerte_surcharge) {
      showStatus('warn', `Fusion réalisée mais la zone résultante (${data.nb_adresses} adresses) dépasse 200% de la capacité cible`)
    } else {
      showStatus('success', `Zones fusionnées — ${data.nb_adresses} adresses au total`)
    }
    await loadZones()
    setMode('idle')
    setSelectedZone(null)
    setMergeTarget(null)
  }

  // ── Diviser ───────────────────────────────────────────────────────────
  const handleSplit = async () => {
    if (!selectedZone || splitPosition === 0) return
    setSaving(true)
    const res = await fetch('/api/zones/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_id:  selectedZone.id,
        axis:     splitAxis,
        position: splitPosition,
        nom_a:    splitNomA,
        nom_b:    splitNomB,
      }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { showStatus('error', data.error ?? 'Erreur division'); return }
    if (data.alerte_petite_zone) {
      showStatus('warn', `Division réalisée — attention : une des deux zones a moins de 50 adresses`)
    } else {
      showStatus('success', `Zone divisée : "${data.zone_a.nom}" (${data.zone_a.nb_adresses} adr.) et "${data.zone_b.nom}" (${data.zone_b.nb_adresses} adr.)`)
    }
    await loadZones()
    setMode('idle')
    setSelectedZone(null)
  }

  const handleCancel = () => {
    setMode('idle')
    setSelectedZone(null)
    setMergeTarget(null)
    pendingPolygonRef.current = null
    setConfirmTransfert(null)
  }

  // ── Rendu ─────────────────────────────────────────────────────────────
  const STATUS_COLORS = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
    warn:    { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  }

  const modeLabel: Record<Mode, string> = {
    idle:  'Cliquez sur une zone pour l\'éditer',
    edit:  `Édition : ${selectedZone?.nom ?? ''}`,
    draw:  'Dessin : cliquez pour poser les sommets, double-clic pour fermer',
    merge: mergeTarget
      ? `Fusionner ${selectedZone?.nom} + ${mergeTarget.nom}`
      : `Fusion : Shift+clic sur la 2e zone à fusionner avec ${selectedZone?.nom ?? ''}`,
    split: `Division : ${selectedZone?.nom ?? ''}`,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8f7f4' }}>

      {/* ── Header ── */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 20px', height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/zones" style={{ color: '#9b9b96', textDecoration: 'none', fontSize: '0.8rem' }}>
            ← Zones
          </Link>
          <span style={{ color: '#e8e7e0' }}>|</span>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>
            ✏️ Éditeur de zones
          </span>
          {zones.length > 0 && (
            <span style={{
              background: '#f0fdf4', color: '#16a34a',
              fontSize: '0.75rem', fontWeight: 600,
              padding: '2px 8px', borderRadius: 20,
              border: '1px solid #bbf7d0',
            }}>
              {zones.length} zones
            </span>
          )}
        </div>
        <button
          onClick={() => router.push('/zones')}
          style={{
            padding: '6px 14px', borderRadius: 7,
            border: '1px solid #e8e7e0', background: '#fff',
            fontSize: '0.8rem', color: '#5F5E5A', cursor: 'pointer',
          }}>
          Fermer l'éditeur
        </button>
      </header>

      {/* ── Barre de statut ── */}
      {status && (
        <div style={{
          background: STATUS_COLORS[status.type].bg,
          borderBottom: `1px solid ${STATUS_COLORS[status.type].border}`,
          padding: '8px 20px', fontSize: '0.8rem',
          color: STATUS_COLORS[status.type].text, fontWeight: 500,
        }}>
          {status.msg}
        </div>
      )}

      {/* ── Corps principal ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden' }}>

        {/* ── Panneau gauche ── */}
        <aside style={{
          borderRight: '1px solid #e8e7e0', background: '#fff',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Mode actif */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #f0efeb',
            fontSize: '0.75rem', color: '#5F5E5A', minHeight: 36,
            display: 'flex', alignItems: 'center',
          }}>
            {modeLabel[mode]}
          </div>

          {/* Boutons de mode */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0efeb', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={() => { setMode('draw'); setSelectedZone(null); setMergeTarget(null) }}
              style={{
                padding: '8px 12px', borderRadius: 7, border: 'none',
                background: mode === 'draw' ? '#1D9E75' : '#f0fdf4',
                color: mode === 'draw' ? '#fff' : '#166534',
                fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left',
              }}>
              + Nouvelle zone
            </button>

            {selectedZone && mode === 'edit' && (
              <>
                <button
                  onClick={() => setMode('merge')}
                  style={{
                    padding: '8px 12px', borderRadius: 7, border: 'none',
                    background: '#eff6ff', color: '#1e40af',
                    fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left',
                  }}>
                  Fusionner avec une autre zone
                </button>
                <button
                  onClick={() => setMode('split')}
                  style={{
                    padding: '8px 12px', borderRadius: 7, border: 'none',
                    background: '#fef9c3', color: '#854d0e',
                    fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left',
                  }}>
                  Diviser cette zone
                </button>
              </>
            )}
          </div>

          {/* Panel split */}
          {mode === 'split' && selectedZone && splitBounds && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0efeb' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#5F5E5A', marginBottom: 10 }}>
                Paramètres de division
              </div>

              {/* Axe */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 4 }}>Axe de coupe</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['vertical', 'horizontal'] as const).map((ax) => (
                    <button key={ax} onClick={() => {
                      setSplitAxis(ax)
                      setSplitPosition(ax === 'horizontal'
                        ? (splitBounds.minLat + splitBounds.maxLat) / 2
                        : (splitBounds.minLon + splitBounds.maxLon) / 2
                      )
                    }} style={{
                      flex: 1, padding: '5px', borderRadius: 6,
                      border: 'none', cursor: 'pointer',
                      background: splitAxis === ax ? '#1D9E75' : '#f0efeb',
                      color: splitAxis === ax ? '#fff' : '#5F5E5A',
                      fontSize: '0.75rem', fontWeight: 500,
                    }}>
                      {ax === 'vertical' ? '⬍ Vertical' : '⬌ Horizontal'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slider position */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginBottom: 4 }}>
                  Position : {splitPosition.toFixed(4)}°
                </div>
                <input
                  type="range"
                  min={splitAxis === 'horizontal' ? splitBounds.minLat : splitBounds.minLon}
                  max={splitAxis === 'horizontal' ? splitBounds.maxLat : splitBounds.maxLon}
                  step={0.0001}
                  value={splitPosition}
                  onChange={(e) => setSplitPosition(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9b9b96', marginTop: 2 }}>
                  <span>{splitAxis === 'horizontal' ? 'Sud' : 'Ouest'}</span>
                  <span>{splitAxis === 'horizontal' ? 'Nord' : 'Est'}</span>
                </div>
              </div>

              {/* Noms */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', color: '#9b9b96', marginBottom: 2 }}>
                    {splitAxis === 'vertical' ? 'Ouest' : 'Nord'}
                  </div>
                  <input
                    value={splitNomA}
                    onChange={(e) => setSplitNomA(e.target.value)}
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: 6,
                      border: '1px solid #e8e7e0', fontSize: '0.78rem', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', color: '#9b9b96', marginBottom: 2 }}>
                    {splitAxis === 'vertical' ? 'Est' : 'Sud'}
                  </div>
                  <input
                    value={splitNomB}
                    onChange={(e) => setSplitNomB(e.target.value)}
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: 6,
                      border: '1px solid #e8e7e0', fontSize: '0.78rem', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Panel merge — confirmation */}
          {mode === 'merge' && selectedZone && mergeTarget && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0efeb' }}>
              <div style={{ fontSize: '0.78rem', color: '#5F5E5A', marginBottom: 8 }}>
                Fusionner <strong>{selectedZone.nom}</strong> ({selectedZone.nb_adresses} adr.)
                avec <strong>{mergeTarget.nom}</strong> ({mergeTarget.nb_adresses} adr.)
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9b9b96' }}>
                Résultat estimé : {(selectedZone.nb_adresses ?? 0) + (mergeTarget.nb_adresses ?? 0)} adresses
              </div>
              {(selectedZone.nb_adresses ?? 0) + (mergeTarget.nb_adresses ?? 0) > 300 && (
                <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#d97706', fontWeight: 500 }}>
                  ⚠ Zone résultante très chargée
                </div>
              )}
            </div>
          )}

          {/* Liste des zones */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 24, color: '#9b9b96', fontSize: '0.875rem' }}>Chargement…</div>
            ) : (
              zones.map((zone) => {
                const isSelected  = selectedZone?.id === zone.id
                const isMergeTarget = mergeTarget?.id === zone.id
                return (
                  <div
                    key={zone.id}
                    onClick={() => handleSelectZone(zone)}
                    style={{
                      padding: '10px 16px', borderBottom: '1px solid #f8f7f4',
                      cursor: 'pointer',
                      background: isMergeTarget ? '#eff6ff'
                        : isSelected ? '#f0fdf4' : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: zone.couleur, flexShrink: 0,
                      outline: isSelected ? `2px solid ${zone.couleur}` : 'none',
                      outlineOffset: 2,
                    }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a1a18' }}>
                        {zone.nom}
                        {isMergeTarget && <span style={{ marginLeft: 5, fontSize: '0.7rem', color: '#2563eb' }}>cible fusion</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginTop: 1 }}>
                        {zone.nb_prospectables} adresses
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Boutons d'action bas de panneau */}
          {mode !== 'idle' && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f0efeb', display: 'flex', gap: 6 }}>
              {mode === 'edit' && (
                <button
                  onClick={() => handleSaveEdit()}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                    background: saving ? '#9b9b96' : '#1D9E75',
                    color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                  {saving ? 'Sauvegarde…' : 'Enregistrer'}
                </button>
              )}
              {mode === 'draw' && (
                <button
                  onClick={handleSaveDraw}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                    background: saving ? '#9b9b96' : '#1D9E75',
                    color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                  {saving ? 'Création…' : 'Créer la zone'}
                </button>
              )}
              {mode === 'merge' && mergeTarget && (
                <button
                  onClick={handleMerge}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                    background: saving ? '#9b9b96' : '#2563eb',
                    color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                  {saving ? 'Fusion…' : 'Confirmer la fusion'}
                </button>
              )}
              {mode === 'split' && selectedZone && (
                <button
                  onClick={handleSplit}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                    background: saving ? '#9b9b96' : '#d97706',
                    color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                  {saving ? 'Division…' : 'Confirmer la division'}
                </button>
              )}
              <button
                onClick={handleCancel}
                style={{
                  padding: '8px 12px', borderRadius: 7,
                  border: '1px solid #e8e7e0', background: '#fff',
                  color: '#5F5E5A', fontSize: '0.8rem', cursor: 'pointer',
                }}>
                Annuler
              </button>
            </div>
          )}
        </aside>

        {/* ── Carte ── */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <ZoneEditorMap
            zones={zones}
            mode={mode}
            selectedZoneId={selectedZone?.id ?? null}
            mergeTargetId={mergeTarget?.id ?? null}
            splitAxis={splitAxis}
            splitPosition={splitPosition}
            onZoneClick={handleSelectZone}
            onPolygonChange={handlePolygonChange}
          />
        </div>
      </div>

      {/* ── Modal confirmation transfert ── */}
      {confirmTransfert && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '24px 28px',
            width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 10 }}>
              Confirmer le transfert d'adresses
            </div>
            <div style={{ fontSize: '0.875rem', color: '#5F5E5A', lineHeight: 1.6, marginBottom: 20 }}>
              {confirmTransfert.nb} adresse{confirmTransfert.nb > 1 ? 's' : ''} appartenant déjà à d'autres zones
              seront transférées dans cette zone. Cette action est réversible via l'historique.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleConfirmTransfert}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8, border: 'none',
                  background: '#1D9E75', color: '#fff',
                  fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                }}>
                Confirmer le transfert
              </button>
              <button
                onClick={() => setConfirmTransfert(null)}
                style={{
                  padding: '9px 16px', borderRadius: 8,
                  border: '1px solid #e8e7e0', background: '#fff',
                  color: '#5F5E5A', fontSize: '0.875rem', cursor: 'pointer',
                }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
