'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/terrain/BottomSheet'

const TerrainMap = dynamic(() => import('@/components/terrain/TerrainMap'), { ssr: false })

interface Zone { id: string; nom: string; couleur: string; numero: number; nb_prospectables: number }

interface Adresse {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string; code_postal?: string; commune?: string
  type_bien?: string; nb_bal?: number; prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite' | 'supprimee'
  interaction?: any; ordre: number; score?: number
  latest_dpe_date?: string | null; dpe_etiquette?: string | null; has_audit?: boolean
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  nom_syndic?: string; nb_acces_observe?: number
  courrier_cible_possible?: boolean; commentaire_adresse?: string
}

const STATUT_COLOR: Record<string, string> = {
  a_faire: '#ef4444', boite: '#3b82f6', contact: '#22c55e', visite: '#9b9b96', supprimee: '#1a1a18',
}
const STATUT_LABEL: Record<string, string> = {
  a_faire: 'À faire', boite: 'Boîté', contact: 'Contact', visite: 'Visité', supprimee: 'Supprimée',
}

function calculerItineraire(adresses: Adresse[]): string[] {
  const points = adresses.filter(a => a.lat && a.lon)
  if (!points.length) return []
  let best: Adresse[] = [], bestDist = Infinity
  for (let r = 0; r < Math.min(3, points.length); r++) {
    const result: Adresse[] = [], visited = new Set<string>()
    let current = points[Math.floor(Math.random() * points.length)]
    while (result.length < points.length) {
      visited.add(current.id); result.push(current)
      let nearest: Adresse | null = null, minDist = Infinity
      for (const p of points) {
        if (visited.has(p.id)) continue
        const d = Math.pow(p.lat - current.lat, 2) + Math.pow(p.lon - current.lon, 2)
        if (d < minDist) { minDist = d; nearest = p }
      }
      if (!nearest) break; current = nearest
    }
    const dist = result.reduce((s, a, i) => i === 0 ? 0 : s + Math.hypot(a.lat - result[i-1].lat, a.lon - result[i-1].lon), 0)
    if (dist < bestDist) { bestDist = dist; best = result }
  }
  return best.map(a => a.id)
}

export default function TerrainPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  type AppState = 'choix_zone' | 'pre_session' | 'en_cours' | 'terminee'
  const [appState,       setAppState]      = useState<AppState>('choix_zone')
  const [isDesktop,      setIsDesktop]     = useState(false)
  const [zones,          setZones]         = useState<Zone[]>([])
  const [session,        setSession]       = useState<any>(null)
  const [preZone,        setPreZone]       = useState<Zone | null>(null)
  const [adresses,       setAdresses]      = useState<Adresse[]>([])
  const [preAdresses,    setPreAdresses]   = useState<any[]>([])
  const [itineraire,     setItineraire]    = useState<string[]>([])
  const [idxCourant,     setIdxCourant]    = useState(0)
  const [nbTotal,        setNbTotal]       = useState(0)
  const [nbVisites,      setNbVisites]     = useState(0)
  const [pctCouvert,     setPctCouvert]    = useState(0)
  const [loading,        setLoading]       = useState(false)
  const [preLoading,     setPreLoading]    = useState(false)
  const [sheetOpen,      setSheetOpen]     = useState(false)
  const [selectedAdresse,setSelectedAdresse] = useState<Adresse | null>(null)
  const [dpeFlags,       setDpeFlags]      = useState<string[]>([])
  const [activeDpeFlags, setActiveDpeFlags]= useState<string[]>([])
  const [dpeFrom,        setDpeFrom]       = useState('')
  const [dpeTo,          setDpeTo]         = useState('')
  const [pendingFrom,    setPendingFrom]    = useState('')
  const [pendingTo,      setPendingTo]     = useState('')
  const [showDpeFilter,  setShowDpeFilter] = useState(false)
  const [adresseFilter,  setAdresseFilter] = useState<'all'|'a_faire'|'contact'|'boite'|'supprimee'>('all')

  // Détection desktop/mobile
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // DPE flags
  useEffect(() => {
    if (!dpeFrom && !dpeTo) { setDpeFlags([]); return }
    const from = dpeFrom ? new Date(dpeFrom) : new Date(0)
    const to   = dpeTo   ? new Date(dpeTo + 'T23:59:59') : new Date()
    setDpeFlags(preAdresses
      .filter((a: any) => { if (!a.latest_dpe_date) return false; const d = new Date(a.latest_dpe_date); return d >= from && d <= to })
      .map((a: any) => a.id))
  }, [preAdresses, dpeFrom, dpeTo])

  const handleStartSession = async (zone: Zone) => {
    setActiveDpeFlags(dpeFlags); setLoading(true)
    try {
      const res  = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: zone.id }) })
      const data = await res.json()
      if (!res.ok || !data.session) { console.error('[terrain] POST /api/sessions erreur:', data); return }
      setSession(data.session)
      try { await loadSessionData(data.session.id) } catch(e) { console.error('[terrain] loadSessionData erreur:', e) }
      setAppState('en_cours')
    } catch(e) { console.error('[terrain] handleStartSession erreur:', e) }
    finally { setLoading(false) }
  }

  const loadSessionData = useCallback(async (sessionId: string) => {
    const res  = await fetch(`/api/sessions/${sessionId}`)
    const data = await res.json()
    if (!res.ok) return
    setAdresses(data.adresses ?? [])
    setNbTotal(data.nb_total ?? 0)
    setNbVisites(data.nb_visites ?? 0)
    setPctCouvert(data.pct_couvert ?? 0)
    setItineraire(calculerItineraire(data.adresses ?? []))
    setIdxCourant(0)
  }, [])

  const handleAdresseClick = (adresse: Adresse) => {
    setSelectedAdresse(adresse); setSheetOpen(true)
  }

  const handleQualification = async (interactionData: any) => {
    if (!session || !selectedAdresse) return
    const res = await fetch('/api/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, adresse_id: selectedAdresse.id, ...interactionData }),
    })
    if (!res.ok) return
    const statut: Adresse['statut_carte'] =
      interactionData.statut_adresse === 'supprimee' ? 'supprimee'
      : interactionData.resultat === 'contact_etabli' ? 'contact'
      : interactionData.action === 'flyer' || interactionData.action === 'courrier' ? 'boite'
      : 'visite'
    setAdresses(prev => prev.map(a => a.id === selectedAdresse.id ? { ...a, statut_carte: statut, interaction: interactionData } : a))
    setNbVisites(prev => selectedAdresse.statut_carte !== 'a_faire' ? prev : prev + 1)
    setPctCouvert(nbTotal > 0 ? Math.round(((nbVisites + 1) / nbTotal) * 100) : 0)
    setSheetOpen(false); setSelectedAdresse(null)
    setIdxCourant(prev => Math.min(prev + 1, itineraire.length - 1))
  }

  const allerAdresseSuivante = () => {
    for (let i = idxCourant; i < itineraire.length; i++) {
      const adr = adresses.find(a => a.id === itineraire[i])
      if (adr && adr.statut_carte === 'a_faire') { setIdxCourant(i); setSelectedAdresse(adr); setSheetOpen(true); return }
    }
    const premiere = adresses.find(a => a.statut_carte === 'a_faire')
    if (premiere) { setSelectedAdresse(premiere); setSheetOpen(true) }
  }

  const ouvrirGoogleMaps = () => {
    const adr = adresses.find(a => a.id === itineraire[idxCourant])
    if (!adr?.lat || !adr?.lon) return
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${adr.lat},${adr.lon}&travelmode=walking`, '_blank')
  }

  const handleEndSession = async () => {
    if (!session || !confirm('Terminer cette session de prospection ?')) return
    setLoading(true)
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'realisee', nb_portes: nbVisites }),
    })
    setLoading(false); setAppState('terminee')
  }

  const handleZonePreview = async (zone: Zone) => {
    setPreZone(zone); setDpeFlags([]); setPreAdresses([]); setAppState('pre_session'); setPreLoading(true)
    const now = new Date(), toDate = now.toISOString().split('T')[0]
    const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
    setDpeTo(toDate); setDpeFrom(fromDate); setPendingTo(toDate); setPendingFrom(fromDate)
    try {
      const res = await fetch(`/api/zones/${zone.id}/adresses`), data = await res.json()
      setPreAdresses(data.adresses ?? [])
    } finally { setPreLoading(false) }
  }

  useEffect(() => {
    fetch('/api/zones').then(r => r.json()).then(d => {
      const zonesData = d.zones ?? []; setZones(zonesData)
      const zoneIdParam = searchParams.get('zone_id')
      if (zoneIdParam) { const zone = zonesData.find((z: Zone) => z.id === zoneIdParam); if (zone) handleZonePreview(zone) }
    })
  }, []) // eslint-disable-line

  const prochaineAdresseId = itineraire[idxCourant] ?? null
  const aFaireCount        = adresses.filter(a => a.statut_carte === 'a_faire').length
  const adressesFiltrees   = adresseFilter === 'all' ? adresses : adresses.filter(a => a.statut_carte === adresseFilter)

  // ── Écran choix de zone ───────────────────────────────────────────────────
  if (appState === 'choix_zone') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '0.9rem' }}>←</button>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>Démarrer une tournée</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', maxWidth: 600, width: '100%', margin: '0 auto' }}>
          <p style={{ fontSize: '0.82rem', color: '#9b9b96', marginBottom: 16 }}>Choisissez la zone à prospecter aujourd&apos;hui</p>
          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗺️</div>
              <p style={{ color: '#5F5E5A', fontSize: '0.875rem' }}>Aucune zone configurée</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {zones.map(zone => (
                <button key={zone.id} onClick={() => handleZonePreview(zone)} disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e8e7e0', borderRadius: 12, padding: '14px 16px', cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: zone.couleur, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18' }}>{zone.nom}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>{zone.nb_prospectables} adresses</div>
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

  // ── Écran pré-session ─────────────────────────────────────────────────────
  if (appState === 'pre_session' && preZone) {
    const applyFilter = (from: string, to: string) => { setDpeFrom(from); setDpeTo(to); setPendingFrom(from); setPendingTo(to) }
    const quickSet = (days: number) => {
      const now = new Date(), to = now.toISOString().split('T')[0]
      const from = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0]
      applyFilter(from, to)
    }
    const preAdressesForMap = preAdresses.map((a: any, i: number) => ({ ...a, statut_carte: 'a_faire' as const, ordre: i, prospectable: a.prospectable !== false }))

    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f8f7f4' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '0 16px', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setAppState('choix_zone')} style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '1rem', padding: '4px' }}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: preZone.couleur, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: '#1a1a18', fontSize: '0.9375rem' }}>{preZone.nom}</span>
            <span style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{preZone.nb_prospectables} adresses</span>
          </div>
        </div>

        {/* Filtre DPE */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '10px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showDpeFilter ? 8 : 0 }}>
            <button onClick={() => setShowDpeFilter(v => !v)} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#5F5E5A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ⚡ DPE récents {showDpeFilter ? '▲' : '▼'}
            </button>
            {dpeFlags.length > 0 && <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{dpeFlags.length} DPE</span>}
          </div>
          {showDpeFilter && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[7,14,30,90].map(d => (
                <button key={d} onClick={() => quickSet(d)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer' }}>{d}j</button>
              ))}
              <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)} style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.72rem' }} />
              <span style={{ fontSize: '0.72rem', color: '#9b9b96' }}>→</span>
              <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)} style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.72rem' }} />
              <button onClick={() => applyFilter(pendingFrom, pendingTo)} disabled={!pendingFrom && !pendingTo}
                style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: (pendingFrom || pendingTo) ? '#1D9E75' : '#e8e7e0', color: '#fff', border: 'none', cursor: (pendingFrom || pendingTo) ? 'pointer' : 'not-allowed' }}>
                Appliquer
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {preLoading
            ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', fontSize: '0.875rem', color: '#9b9b96' }}>Chargement…</div>
            : <TerrainMap adresses={preAdressesForMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={() => {}} dpeFlags={dpeFlags} dpeFilterFrom={dpeFrom} dpeFilterTo={dpeTo} />
          }
          {dpeFlags.length > 0 && (
            <div style={{ position: 'absolute', bottom: 16, left: 12, background: 'rgba(245,158,11,0.92)', borderRadius: 8, padding: '5px 12px', fontSize: '0.72rem', color: '#fff', fontWeight: 600, pointerEvents: 'none' }}>
              🚩 {dpeFlags.length} DPE récent{dpeFlags.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
        <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #e8e7e0', flexShrink: 0 }}>
          <button onClick={() => handleStartSession(preZone)} disabled={loading}
            style={{ width: '100%', padding: '14px', borderRadius: 12, background: loading ? '#9b9b96' : '#1D9E75', color: '#fff', fontWeight: 700, fontSize: '1rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Démarrage…' : 'Démarrer la tournée →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Écran fin de session ──────────────────────────────────────────────────
  if (appState === 'terminee') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8e7e0', padding: '32px 28px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: 6 }}>Session terminée !</h2>
          <p style={{ color: '#5F5E5A', fontSize: '0.875rem', marginBottom: 24 }}>
            {nbVisites} adresse{nbVisites > 1 ? 's' : ''} visitée{nbVisites > 1 ? 's' : ''} sur {nbTotal} ({pctCouvert}%)
          </p>
          <button onClick={() => router.push('/dashboard')}
            style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer' }}>
            Retour au dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Header commun (session en cours) ─────────────────────────────────────
  const sessionHeader = (
    <div style={{ height: 52, background: '#fff', borderBottom: '1px solid #e8e7e0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {session?.zones_prospection && (
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: session.zones_prospection.couleur ?? '#1D9E75', flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.zones_prospection?.nom ?? 'Session en cours'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9b9b96' }}>
            {nbVisites}/{nbTotal} visités · {pctCouvert}% · {aFaireCount} restantes
          </div>
        </div>
      </div>
      <button onClick={allerAdresseSuivante}
        style={{ padding: '5px 10px', borderRadius: 7, background: '#f0fdf4', color: '#1D9E75', fontWeight: 600, fontSize: '0.78rem', border: '1px solid #bbf7d0', cursor: 'pointer', flexShrink: 0 }}>
        Suivante →
      </button>
      <button onClick={ouvrirGoogleMaps}
        style={{ padding: '5px 10px', borderRadius: 7, background: '#f8f7f4', color: '#374151', fontWeight: 600, fontSize: '0.78rem', border: '1px solid #e8e7e0', cursor: 'pointer', flexShrink: 0 }}>
        🗺 Nav
      </button>
      <button onClick={handleEndSession} disabled={loading}
        style={{ padding: '5px 10px', borderRadius: 7, background: loading ? '#e5e7eb' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: '0.78rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
        Terminer
      </button>
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // ── LAYOUT DESKTOP ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════
  if (isDesktop && appState === 'en_cours') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f8f7f4' }}>
        {sessionHeader}

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar gauche */}
          <div style={{ width: 360, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #e8e7e0', overflow: 'hidden', flexShrink: 0 }}>

            {/* Panel qualification (quand adresse sélectionnée) */}
            {sheetOpen && selectedAdresse ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header adresse */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EDE6', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => { setSheetOpen(false); setSelectedAdresse(null) }}
                    style={{ background: 'none', border: 'none', fontSize: 18, color: '#9b9b96', cursor: 'pointer', padding: 0, marginTop: 2 }}>←</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a18' }}>
                      {[selectedAdresse.numero, selectedAdresse.nom_voie].filter(Boolean).join(' ') || 'Adresse'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9b9b96', marginTop: 2 }}>
                      {selectedAdresse.code_postal} {selectedAdresse.commune}
                      {selectedAdresse.statut_prospectabilite === 'supprimee' && (
                        <span style={{ marginLeft: 6, fontSize: 10, background: '#1a1a18', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>SUPPRIMÉE</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* BottomSheet inline dans la sidebar */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <BottomSheet
                    open={true}
                    inline={true}
                    adresse={selectedAdresse}
                    sessionId={session?.id ?? ''}
                    onClose={() => { setSheetOpen(false); setSelectedAdresse(null) }}
                    onQualification={handleQualification}
                  />
                </div>
              </div>
            ) : (
              /* Liste des adresses */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Filtres */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F0EDE6', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['all','a_faire','contact','boite','supprimee'] as const).map(f => (
                      <button key={f} onClick={() => setAdresseFilter(f)}
                        style={{
                          padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: adresseFilter === f ? '#1D9E75' : '#f3f4f6',
                          color:      adresseFilter === f ? '#fff'    : '#6b7280',
                          border: adresseFilter === f ? 'none' : '1px solid #e5e7eb',
                        }}>
                        {f === 'all' ? `Toutes (${adresses.length})` : `${STATUT_LABEL[f]} (${adresses.filter(a => a.statut_carte === f).length})`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Liste scrollable */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {adressesFiltrees.map(a => {
                    const isProchaine = a.id === prochaineAdresseId
                    return (
                      <div key={a.id} onClick={() => handleAdresseClick(a)}
                        style={{
                          padding: '10px 14px', borderBottom: '1px solid #F0EDE6', cursor: 'pointer',
                          background: isProchaine ? '#f0fdf4' : 'white',
                          borderLeft: `3px solid ${isProchaine ? '#1D9E75' : STATUT_COLOR[a.statut_carte] ?? '#e5e7eb'}`,
                          transition: 'background 0.1s',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUT_COLOR[a.statut_carte], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[a.numero, a.nom_voie].filter(Boolean).join(' ')}
                            </div>
                            <div style={{ fontSize: 11, color: '#9b9b96', display: 'flex', gap: 6, marginTop: 2 }}>
                              <span>{STATUT_LABEL[a.statut_carte]}</span>
                              {a.type_habitat && <span>· {a.type_habitat === 'individuel' ? '🏠' : a.type_habitat === 'collectif' ? '🏢' : '🏪'}</span>}
                              {a.latest_dpe_date && activeDpeFlags.includes(a.id) && <span style={{ color: '#F59E0B' }}>⚡DPE</span>}
                              {isProchaine && <span style={{ color: '#1D9E75', fontWeight: 700 }}>← Suivante</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, color: '#9b9b96', flexShrink: 0 }}>›</span>
                        </div>
                      </div>
                    )
                  })}
                  {adressesFiltrees.length === 0 && (
                    <div style={{ padding: 32, textAlign: 'center', color: '#9b9b96', fontSize: 13 }}>Aucune adresse</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Carte — occupe le reste */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TerrainMap
              adresses={adresses}
              zonePolygon={null}
              prochaineAdresseId={prochaineAdresseId}
              onAdresseClick={handleAdresseClick}
              dpeFlags={activeDpeFlags}
            />

            {/* Légende sur la carte */}
            <div style={{ position: 'absolute', bottom: 16, left: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '6px 10px', fontSize: '0.68rem', color: '#5F5E5A', border: '1px solid #e8e7e0', pointerEvents: 'none' }}>
              {[
                { color: '#ef4444', label: 'À faire' },
                { color: '#3b82f6', label: 'Boîté' },
                { color: '#22c55e', label: 'Contact' },
                { color: '#9b9b96', label: 'Autre' },
                { color: '#1a1a18', label: 'Supprimée' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  // ── LAYOUT MOBILE (inchangé) ──────────────────────────────
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#1a1a18' }}>
      {sessionHeader}

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <TerrainMap
          adresses={adresses}
          zonePolygon={null}
          prochaineAdresseId={prochaineAdresseId}
          onAdresseClick={handleAdresseClick}
          dpeFlags={activeDpeFlags}
        />

        {!sheetOpen && (
          <div style={{ position: 'absolute', bottom: 16, left: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '6px 10px', fontSize: '0.68rem', color: '#5F5E5A', border: '1px solid #e8e7e0', pointerEvents: 'none' }}>
            {[
              { color: '#ef4444', label: 'À faire' },
              { color: '#3b82f6', label: 'Boîté' },
              { color: '#22c55e', label: 'Contact' },
              { color: '#9b9b96', label: 'Autre' },
              { color: '#1a1a18', label: 'Supprimée' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BottomSheet mobile — overlay fixe */}
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
