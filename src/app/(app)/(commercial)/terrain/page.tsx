'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/terrain/BottomSheet'

const TerrainMap = dynamic(() => import('@/components/terrain/TerrainMap'), { ssr: false })

interface Zone {
  id: string
  nom: string
  couleur: string
  numero: number
  nb_prospectables: number
}

interface Adresse {
  id: string
  lat: number
  lon: number
  numero?: string
  nom_voie?: string
  code_postal?: string
  commune?: string
  type_bien?: string
  nb_bal?: number
  prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite'
  interaction?: any
  ordre: number
  score?: number
  latest_dpe_date?: string | null
  type_habitat?: string
  mode_prospection?: string
  statut_prospectabilite?: string
  nom_syndic?: string
  nb_acces_observe?: number
  courrier_cible_possible?: boolean
  commentaire_adresse?: string
}

interface Session {
  id: string
  zone_id: string
  statut: string
  date_session: string
  zones_prospection: { nom: string; couleur: string; numero: number }
}

type AppState = 'choix_zone' | 'pre_session' | 'en_cours' | 'terminee'

export default function TerrainPage() {
  const router = useRouter()

  const [appState, setAppState]     = useState<AppState>('choix_zone')
  const [zones, setZones]           = useState<Zone[]>([])
  const [session, setSession]       = useState<Session | null>(null)
  const [adresses, setAdresses]     = useState<Adresse[]>([])
  const [nbTotal, setNbTotal]       = useState(0)
  const [nbVisites, setNbVisites]   = useState(0)
  const [pctCouvert, setPctCouvert] = useState(0)
  const [loading, setLoading]       = useState(false)
  const [selectedAdresse, setSelectedAdresse] = useState<Adresse | null>(null)
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [itineraire, setItineraire] = useState<string[]>([])
  const [idxCourant, setIdxCourant] = useState(0)

  // ── TSP nearest-neighbor ──────────────────────────────────────────
  const calculerItineraire = (adrs: Adresse[]): string[] => {
    const points = adrs.filter((a) => a.lat && a.lon && a.prospectable !== false)
    if (points.length === 0) return []
    const visited = new Set<string>()
    const result: string[] = []
    let current = points.reduce((best, p) =>
      p.lat + p.lon < best.lat + best.lon ? p : best
    )
    while (result.length < points.length) {
      visited.add(current.id)
      result.push(current.id)
      let nearest: Adresse | null = null
      let minDist = Infinity
      for (const p of points) {
        if (visited.has(p.id)) continue
        const d = Math.pow(p.lat - current.lat, 2) + Math.pow(p.lon - current.lon, 2)
        if (d < minDist) { minDist = d; nearest = p }
      }
      if (!nearest) break
      current = nearest
    }
    return result
  }

  // Charger les zones
  useEffect(() => {
    fetch('/api/zones')
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
  }, [])

  // Aperçu de zone avant démarrage
  const handleZonePreview = async (zone: Zone) => {
    setPreZone(zone)
    setDpeFlags([])
    setPreAdresses([])
    setAppState('pre_session')
    setPreLoading(true)
    const now = new Date()
    setDpeTo(now.toISOString().split('T')[0])
    setDpeFrom(new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0])
    try {
      const res = await fetch(`/api/zones/${zone.id}/adresses`)
      const data = await res.json()
      setPreAdresses(data.adresses ?? [])
    } finally {
      setPreLoading(false)
    }
  }

  useEffect(() => {
    if (!dpeFrom && !dpeTo) { setDpeFlags([]); return }
    const from = dpeFrom ? new Date(dpeFrom) : new Date(0)
    const to = dpeTo ? new Date(dpeTo + 'T23:59:59') : new Date()
    const flags = preAdresses
      .filter((a: any) => {
        if (!a.latest_dpe_date) return false
        const d = new Date(a.latest_dpe_date)
        return d >= from && d <= to
      })
      .map((a: any) => a.id)
    setDpeFlags(flags)
  }, [preAdresses, dpeFrom, dpeTo])

  // Démarrer une session
  const handleStartSession = async (zone: Zone) => {
    setActiveDpeFlags(dpeFlags)
    setLoading(true)
    try {
      const res  = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zone.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.session) {
        console.error('[terrain] POST /api/sessions erreur:', data)
        return
      }
      setSession(data.session)
      try {
        await loadSessionData(data.session.id)
      } catch (e) {
        console.error('[terrain] loadSessionData erreur:', e)
        // On continue quand même — la carte s'affiche vide
      }
      setAppState('en_cours')
    } catch (e) {
      console.error('[terrain] handleStartSession erreur:', e)
    } finally {
      setLoading(false)
    }
  }

  // Charger les adresses de la session
  const loadSessionData = useCallback(async (sessionId: string) => {
    const res  = await fetch(`/api/sessions/${sessionId}`)
    const data = await res.json()
    if (!res.ok) return
    setAdresses(data.adresses ?? [])
    setNbTotal(data.nb_total ?? 0)
    setNbVisites(data.nb_visites ?? 0)
    setPctCouvert(data.pct_couvert ?? 0)
    const itin = calculerItineraire(data.adresses ?? [])
    setItineraire(itin)
    setIdxCourant(0)
  }, [])

  // Clic sur une adresse → ouvrir bottom sheet
  const handleAdresseClick = (adresse: Adresse) => {
    setSelectedAdresse(adresse)
    setSheetOpen(true)
  }

  // Après qualification → mettre à jour l'adresse localement + recharger
  const handleQualification = async (interactionData: any) => {
    if (!session || !selectedAdresse) return

    const res = await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        adresse_id: selectedAdresse.id,
        ...interactionData,
      }),
    })
    if (!res.ok) return

    // Mise à jour locale immédiate (UX fluide)
    const statut: Adresse['statut_carte'] =
      interactionData.resultat === 'contact_etabli' ? 'contact'
      : interactionData.action === 'flyer' || interactionData.action === 'courrier' ? 'boite'
      : 'visite'

    setAdresses((prev) =>
      prev.map((a) =>
        a.id === selectedAdresse.id
          ? { ...a, statut_carte: statut, interaction: interactionData }
          : a
      )
    )
    setNbVisites((prev) => {
      const wasVisited = selectedAdresse.statut_carte !== 'a_faire'
      return wasVisited ? prev : prev + 1
    })
    setPctCouvert(nbTotal > 0 ? Math.round(((nbVisites + 1) / nbTotal) * 100) : 0)

    setSheetOpen(false)
    setSelectedAdresse(null)
    setIdxCourant((prev) => Math.min(prev + 1, itineraire.length - 1))
  }

  // Aller à la prochaine adresse non visitée
  const allerAdresseSuivante = () => {
    for (let i = idxCourant; i < itineraire.length; i++) {
      const adr = adresses.find((a) => a.id === itineraire[i])
      if (adr && adr.statut_carte === 'a_faire') {
        setIdxCourant(i)
        setSelectedAdresse(adr)
        setSheetOpen(true)
        return
      }
    }
    const premiere = adresses.find((a) => a.statut_carte === 'a_faire')
    if (premiere) { setSelectedAdresse(premiere); setSheetOpen(true) }
  }

  // Ouvrir Google Maps vers la prochaine adresse
  const ouvrirGoogleMaps = () => {
    const adr = adresses.find((a) => a.id === itineraire[idxCourant])
    if (!adr?.lat || !adr?.lon) return
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${adr.lat},${adr.lon}&travelmode=walking`,
      '_blank'
    )
  }

  const prochaineAdresseId = itineraire[idxCourant] ?? null

  // Terminer la session
  const handleEndSession = async () => {
    if (!session) return
    if (!confirm('Terminer cette session de prospection ?')) return
    setLoading(true)
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statut:   'realisee',
        nb_portes: nbVisites,
      }),
    })
    setLoading(false)
    setAppState('terminee')
  }

  // ── Écran choix de zone ───────────────────────────────────────────
  if (appState === 'choix_zone') {
    return (
      <div style={{
        minHeight: '100dvh', background: '#f8f7f4',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          background: '#fff', borderBottom: '1px solid #e8e7e0',
          padding: '0 20px', height: 52,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'none', border: 'none',
              color: '#9b9b96', cursor: 'pointer', fontSize: '0.9rem',
            }}>
            ←
          </button>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>
            Démarrer une tournée
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <p style={{ fontSize: '0.82rem', color: '#9b9b96', marginBottom: 16 }}>
            Choisissez la zone à prospecter aujourd'hui
          </p>

          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗺️</div>
              <p style={{ color: '#5F5E5A', fontSize: '0.875rem' }}>
                Aucune zone configurée
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => handleZonePreview(zone)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: '#fff', border: '1px solid #e8e7e0',
                    borderRadius: 12, padding: '14px 16px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    textAlign: 'left', width: '100%',
                  }}
                >
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: zone.couleur, flexShrink: 0,
                  }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18' }}>
                      {zone.nom}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>
                      {zone.nb_prospectables} adresses
                    </div>
                  </div>
                  <div style={{ color: '#1D9E75', fontSize: '1.1rem' }}>→</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Écran récapitulatif fin de session ───────────────────────────
  if (appState === 'terminee') {
    return (
      <div style={{
        minHeight: '100dvh', background: '#f8f7f4',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          background: '#fff', borderRadius: 16,
          border: '1px solid #e8e7e0',
          padding: '32px 28px', width: '100%', maxWidth: 380,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: 6 }}>
            Session terminée !
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#5F5E5A', marginBottom: 24 }}>
            {session?.zones_prospection?.nom} · {nbVisites} adresses visitées sur {nbTotal}
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24,
          }}>
            {[
              { label: 'Visitées', value: nbVisites, color: '#1D9E75' },
              { label: 'Couverture', value: `${pctCouvert}%`, color: '#2196F3' },
              { label: 'Contacts', value: adresses.filter((a) => a.statut_carte === 'contact').length, color: '#FF9800' },
              { label: 'Flyers', value: adresses.filter((a) => a.statut_carte === 'boite').length, color: '#9C27B0' },
            ].map((s) => (
              <div key={s.label} style={{
                background: '#f8f7f4', borderRadius: 10,
                padding: '12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9b9b96', marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: '#1D9E75', color: '#fff',
              fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer',
            }}>
            Retour au dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Écran principal — carte terrain ─────────────────────────────
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#000' }}>

      {/* Header compact */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 12px', height: 48, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        <button
          onClick={() => setAppState('choix_zone')}
          style={{
            background: 'none', border: 'none',
            color: '#9b9b96', cursor: 'pointer', fontSize: '1rem', padding: '4px',
          }}>
          ←
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: session?.zones_prospection?.couleur ?? '#1D9E75',
          }}/>
          <span style={{
            fontWeight: 600, fontSize: '0.875rem', color: '#1a1a18',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {session?.zones_prospection?.nom}
          </span>
        </div>

        {/* Compteur avancement */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{
            width: 80, height: 5, background: '#f0efeb', borderRadius: 3,
          }}>
            <div style={{
              width: `${pctCouvert}%`, height: '100%',
              background: '#1D9E75', borderRadius: 3,
              transition: 'width 0.3s ease',
            }}/>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#5F5E5A', fontWeight: 500, minWidth: 30 }}>
            {nbVisites}/{nbTotal}
          </span>
        </div>

        <button
          onClick={allerAdresseSuivante}
          style={{
            padding: '5px 10px', borderRadius: 7,
            background: '#1D9E75', color: '#fff',
            border: 'none', fontSize: '0.72rem', fontWeight: 600,
            cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Suivante
        </button>

        {prochaineAdresseId && (
          <button
            onClick={ouvrirGoogleMaps}
            title="Naviguer vers cette adresse"
            style={{
              padding: '5px 8px', borderRadius: 7,
              background: '#eff6ff', color: '#1e40af',
              border: '1px solid #bfdbfe',
              fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', flexShrink: 0,
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </button>
        )}

        <button
          onClick={handleEndSession}
          disabled={loading}
          style={{
            padding: '5px 10px', borderRadius: 7,
            background: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca',
            fontSize: '0.72rem', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0,
          }}>
          Terminer
        </button>
      </div>

      {/* Carte plein écran */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <TerrainMap
          adresses={adresses}
          zonePolygon={null}
          prochaineAdresseId={prochaineAdresseId}
          onAdresseClick={handleAdresseClick}
        />

        {/* Légende couleurs */}
        <div style={{
          position: 'absolute', bottom: sheetOpen ? 320 : 16, left: 12,
          background: 'rgba(255,255,255,0.95)', borderRadius: 8,
          padding: '6px 10px', fontSize: '0.68rem', color: '#5F5E5A',
          border: '1px solid #e8e7e0', transition: 'bottom 0.3s ease',
          pointerEvents: 'none',
        }}>
          {[
            { color: '#ef4444', label: 'À faire' },
            { color: '#3b82f6', label: 'Boîté' },
            { color: '#22c55e', label: 'Contact' },
            { color: '#9b9b96', label: 'Autre' },
          ].map((item) => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: item.color, flexShrink: 0,
              }}/>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sheet qualification */}
      {selectedAdresse && (
        <BottomSheet
          open={sheetOpen}
          adresse={selectedAdresse}
          sessionId={session?.id ?? ''}
          onClose={() => { setSheetOpen(false); setSelectedAdresse(null) }}
          onQualification={handleQualification}
        />
      )}
    </div>
  )
}
