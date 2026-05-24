'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/terrain/BottomSheet'

const TerrainMap = dynamic(() => import('@/components/terrain/TerrainMap'), { ssr: false })

interface Zone    { id: string; nom: string; couleur: string; numero: number; nb_prospectables: number }
interface Commune { id: string; nom: string; code_insee: string }

interface Adresse {
  id: string; lat: number; lon: number
  numero?: string; nom_voie?: string; code_postal?: string; commune?: string
  type_bien?: string; nb_bal?: number; prospectable?: boolean
  statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite' | 'supprimee'
  interaction?: any; ordre: number; score?: number
  latest_dpe_date?: string | null; dpe_etiquette?: string | null
  has_audit?: boolean; audit_n?: string | null; audit_date?: string | null
  audit_scenarios?: { categorie?: string; classe_apres?: string; cout_travaux?: number; gain_pct?: number }[] | null
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

  type AppState = 'init' | 'choix_zone' | 'pre_session' | 'pre_libre' | 'en_cours' | 'terminee'

  const [appState,         setAppState]         = useState<AppState>('init')
  const [isDesktop,        setIsDesktop]         = useState(false)
  const [zones,            setZones]             = useState<Zone[]>([])
  const [communes,         setCommunes]          = useState<Commune[]>([])
  const [communeSelectee,  setCommuneSelectee]   = useState<Commune | null>(null)
  const [session,          setSession]           = useState<any>(null)
  const [sessionActive,    setSessionActive]     = useState<any>(null)
  const [preZone,          setPreZone]           = useState<Zone | null>(null)
  const [adresses,         setAdresses]          = useState<Adresse[]>([])
  const [preAdresses,      setPreAdresses]       = useState<any[]>([])
  const [itineraire,       setItineraire]        = useState<string[]>([])
  const [idxCourant,       setIdxCourant]        = useState(0)
  const [nbTotal,          setNbTotal]           = useState(0)
  const [nbVisites,        setNbVisites]         = useState(0)
  const [pctCouvert,       setPctCouvert]        = useState(0)
  const [loading,          setLoading]           = useState(false)
  const [preLoading,       setPreLoading]        = useState(false)
  const [sheetOpen,        setSheetOpen]         = useState(false)
  const [selectedAdresse,  setSelectedAdresse]   = useState<Adresse | null>(null)
  const [dpeFlags,         setDpeFlags]          = useState<string[]>([])
  const [activeDpeFlags,   setActiveDpeFlags]    = useState<string[]>([])
  const [dpeFrom,          setDpeFrom]           = useState('')
  const [dpeTo,            setDpeTo]             = useState('')
  const [pendingFrom,      setPendingFrom]       = useState('')
  const [pendingTo,        setPendingTo]         = useState('')
  const [showDpeFilter,    setShowDpeFilter]     = useState(false)
  const [adresseFilter,    setAdresseFilter]     = useState<'all'|'a_faire'|'contact'|'boite'|'supprimee'>('all')

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

  // ── Init : zones + communes + détection session en cours ──────────────────
  useEffect(() => {
    const init = async () => {
      const [zonesRes, communesRes, sessRes] = await Promise.all([
        fetch('/api/zones').then(r => r.json()),
        fetch('/api/communes').then(r => r.json()),
        fetch('/api/sessions?statut=en_cours').then(r => r.json()),
      ])

      const zonesData = zonesRes.zones ?? []
      setZones(zonesData)
      setCommunes(communesRes.communes ?? [])

      const sessEnCours = sessRes.sessions?.[0] ?? null
      if (sessEnCours) {
        setSessionActive(sessEnCours)
        setAppState('choix_zone')
        return
      }

setAppState('choix_zone')

      const zoneIdParam    = searchParams.get('zone_id')
      const autostartParam = searchParams.get('autostart')
      if (zoneIdParam) {
        const zone = zonesData.find((z: Zone) => z.id === zoneIdParam)
        if (zone) {
          if (autostartParam === '1' && !sessEnCours) {
            await handleStartSession(zone)
          } else {
            handleZonePreviewInner(zone, zodesData)
          }
        }
      }
    }
    init()
  }, []) // eslint-disable-line

  // ── Reprendre une session en cours ────────────────────────────────────────
  const reprendreSession = async () => {
    if (!sessionActive) return
    setLoading(true)
    try {
      setSession(sessionActive)
      await loadSessionData(sessionActive.id)
      setSessionActive(null)
      setAppState('en_cours')
    } finally { setLoading(false) }
  }

  // ── Clôturer une session en cours puis redémarrer ────────────────────────
  const cloturerEtContinuer = async (cb: () => void) => {
    if (!sessionActive) { cb(); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionActive.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'realisee' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('[cloture] PATCH failed:', res.status, err)
        alert('Erreur lors de la clôture de la session. Veuillez réessayer.')
        setLoading(false)
        return
      }
      setSessionActive(null)
      cb()
    } catch(e) {
      console.error('[cloture] fetch error:', e)
      alert('Erreur réseau lors de la clôture. Veuillez réessayer.')
      setSessionActive(null)
      cb()
    } finally { setLoading(false) }
  }

  // ── Démarrer session zone ─────────────────────────────────────────────────
  const handleStartSession = async (zone: Zone) => {
    setActiveDpeFlags(dpeFlags); setLoading(true)
    try {
      const res  = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: zone.id }) })
      const data = await res.json()
      if (!res.ok || !data.session) { console.error('[terrain] erreur démarrage:', data); return }
      setSession(data.session)
      try { await loadSessionData(data.session.id) } catch(e) { console.error(e) }
      setAppState('en_cours')
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  // ── Démarrer session libre ────────────────────────────────────────────────
  const handleStartSessionLibre = async () => {
    if (!communeSelectee) return
    setLoading(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: null, type_session: 'hors_zone', commune_code_insee: communeSelectee.code_insee, commune_nom: communeSelectee.nom }),
      })
      const data = await res.json()
      if (!res.ok || !data.session) { console.error('[terrain] erreur session libre:', data); return }
      setSession(data.session)
      try { await loadSessionData(data.session.id) } catch(e) { console.error(e) }
      setAppState('en_cours')
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleAdresseClick = (adresse: Adresse) => {
    setSelectedAdresse(adresse); setSheetOpen(true)
  }

  const handleQualification = (interactionData: any) => {
    if (!selectedAdresse) return

    const statut: Adresse['statut_carte'] =
      interactionData.statut_adresse === 'supprimee'  ? 'supprimee'
      : interactionData.resultat === 'contact_etabli' ? 'contact'
      : interactionData.resultat === 'contact'        ? 'contact'
      : interactionData.action === 'flyer' || interactionData.action === 'boite' || interactionData.action === 'courrier' ? 'boite'
      : interactionData.resultat === 'exclusion'      ? 'visite'
      : 'visite'

    setAdresses(prev => prev.map(a =>
      a.id === selectedAdresse.id
        ? { ...a, statut_carte: statut, interaction: interactionData }
        : a
    ))

    if (selectedAdresse.statut_carte === 'a_faire') {
      setNbVisites(prev => prev + 1)
      setPctCouvert(nbTotal > 0 ? Math.round(((nbVisites + 1) / nbTotal) * 100) : 0)
    }

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
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'realisee', nb_portes: nbVisites }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.session) setSession(data.session)
    setAppState('terminee')
  }

  const handleZonePreviewInner = async (zone: Zone, _zones?: Zone[]) => {
    setPreZone(zone); setDpeFlags([]); setPreAdresses([]); setAppState('pre_session'); setPreLoading(true)
    const now = new Date(), toDate = now.toISOString().split('T')[0]
    const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
    setDpeTo(toDate); setDpeFrom(fromDate); setPendingTo(toDate); setPendingFrom(fromDate)
    try {
      const res = await fetch(`/api/zones/${zone.id}/adresses`), data = await res.json()
      setPreAdresses(data.adresses ?? [])
    } finally { setPreLoading(false) }
  }

  const handleZonePreview = (zone: Zone) => handleZonePreviewInner(zone)

  const prochaineAdresseId = itineraire[idxCourant] ?? null
  const aFaireCount        = adresses.filter(a => a.statut_carte === 'a_faire').length
  const isHorsZone         = !session?.zone_id
  const adressesFiltrees   = adresseFilter === 'all' ? adresses : adresses.filter(a => a.statut_carte === adresseFilter)

  // ── Bannière session en cours ──────────────────────────────────────────────
  const BanniereSessionActive = sessionActive ? (
    <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', marginBottom: 4 }}>Session en cours non clôturée</div>
        <div style={{ fontSize: '0.8rem', color: '#78350f', marginBottom: 12 }}>
          {sessionActive.zones_prospection
            ? `Zone ${sessionActive.zones_prospection.numero} — ${sessionActive.zones_prospection.nom}`
            : sessionActive.commune_nom ?? 'Session libre'
          } · démarrée le {new Date(sessionActive.date_session).toLocaleDateString('fr-FR')} à {sessionActive.heure_debut?.slice(0, 5)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reprendreSession} disabled={loading}
            style={{ padding: '8px 16px', borderRadius: 8, background: '#1D9E75', color: '#fff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer' }}>
            ▶ Reprendre la session
          </button>
          <button onClick={() => cloturerEtContinuer(() => {})} disabled={loading}
            style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#92400e', fontWeight: 600, fontSize: '0.82rem', border: '1px solid #fde68a', cursor: 'pointer' }}>
            ✓ Clôturer sans reprendre
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ══════════════════════════════════════════════════════════════════════════
  // ── INIT
  // ══════════════════════════════════════════════════════════════════════════
  if (appState === 'init') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9b9b96', fontSize: '0.875rem' }}>
        Chargement…
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── CHOIX DE ZONE
  // ══════════════════════════════════════════════════════════════════════════
  if (appState === 'choix_zone') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '0.9rem' }}>←</button>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>Démarrer une tournée</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', maxWidth: 600, width: '100%', margin: '0 auto' }}>

          {BanniereSessionActive}

          <p style={{ fontSize: '0.82rem', color: '#9b9b96', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Zones de prospection
          </p>

          {sessionActive && (
            <div style={{ padding: '12px', borderRadius: 8, background: '#f9f9f9', border: '1px solid #e5e7eb', marginBottom: 12, fontSize: '0.8rem', color: '#9b9b96', textAlign: 'center' }}>
              Clôturez ou reprenez la session en cours pour démarrer une nouvelle tournée
            </div>
          )}

          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b9b96' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗺️</div>
              <p style={{ fontSize: '0.875rem' }}>Aucune zone configurée</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, opacity: sessionActive ? 0.4 : 1 }}>
              {zones.map(zone => (
                <button key={zone.id}
                  onClick={() => sessionActive ? undefined : handleZonePreview(zone)}
                  disabled={!!sessionActive || loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e8e7e0', borderRadius: 12, padding: '14px 16px', cursor: sessionActive ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%' }}>
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

          <div style={{ borderTop: '1px solid #e8e7e0', paddingTop: 24 }}>
            <p style={{ fontSize: '0.82rem', color: '#9b9b96', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Prospection libre
            </p>
            <button
              onClick={() => sessionActive ? undefined : setAppState('pre_libre')}
              disabled={!!sessionActive || loading}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1.5px dashed #e8e7e0', borderRadius: 12, padding: '14px 16px', cursor: sessionActive ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%', opacity: sessionActive ? 0.4 : 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🚶</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18' }}>Prospection hors zone</div>
                <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>Prospecter librement dans une commune</div>
              </div>
              <div style={{ color: '#9b9b96', fontSize: '1.1rem' }}>→</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── PRÉ-SESSION LIBRE
  // ══════════════════════════════════════════════════════════════════════════
  if (appState === 'pre_libre') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setAppState('choix_zone'); setCommuneSelectee(null) }} style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '0.9rem' }}>←</button>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>Prospection libre hors zone</span>
        </div>
        <div style={{ flex: 1, padding: '24px 16px', maxWidth: 520, width: '100%', margin: '0 auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e7e0', padding: '14px 18px', marginBottom: 24, fontSize: '0.82rem', color: '#5F5E5A', lineHeight: 1.6 }}>
            Cette session n&apos;est pas rattachée à une zone planifiée. Elle apparaîtra dans votre planning comme une <strong>prospection libre</strong> du jour.
          </div>
          <p style={{ fontSize: '0.82rem', color: '#9b9b96', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Commune prospectée</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {communes.map(c => (
              <button key={c.id} onClick={() => setCommuneSelectee(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, textAlign: 'left', width: '100%', cursor: 'pointer', background: communeSelectee?.id === c.id ? '#f0fdf4' : '#fff', border: '1.5px solid ' + (communeSelectee?.id === c.id ? '#1D9E75' : '#e8e7e0') }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: communeSelectee?.id === c.id ? '#1D9E75' : '#f3f4f6', border: '2px solid ' + (communeSelectee?.id === c.id ? '#1D9E75' : '#e5e7eb'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {communeSelectee?.id === c.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18' }}>{c.nom}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9b9b96' }}>{c.code_insee}</div>
                </div>
                {communeSelectee?.id === c.id && <span style={{ color: '#1D9E75' }}>✓</span>}
              </button>
            ))}
          </div>
          <button onClick={handleStartSessionLibre} disabled={!communeSelectee || loading}
            style={{ width: '100%', padding: '14px', borderRadius: 12, background: !communeSelectee || loading ? '#e5e7eb' : '#1D9E75', color: '#fff', fontWeight: 700, fontSize: '1rem', border: 'none', cursor: !communeSelectee || loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Démarrage…' : communeSelectee ? `Prospecter à ${communeSelectee.nom} →` : 'Choisissez une commune'}
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── PRÉ-SESSION ZONE
  // ══════════════════════════════════════════════════════════════════════════
  if (appState === 'pre_session' && preZone) {
    const applyFilter = (from: string, to: string) => { setDpeFrom(from); setDpeTo(to); setPendingFrom(from); setPendingTo(to) }
    const quickSet = (days: number) => {
      const now = new Date(), to = now.toISOString().split('T')[0]
      applyFilter(new Date(now.getTime() - days * 86400000).toISOString().split('T')[0], to)
    }
    const preAdressesForMap = preAdresses.map((a: any, i: number) => ({ ...a, statut_carte: 'a_faire' as const, ordre: i, prospectable: a.prospectable !== false }))

    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f8f7f4' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '0 16px', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setAppState('choix_zone')} style={{ background: 'none', border: 'none', color: '#9b9b96', cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: preZone.couleur, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: '#1a1a18', fontSize: '0.9375rem' }}>{preZone.nom}</span>
            <span style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{preZone.nb_prospectables} adresses</span>
          </div>
        </div>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '10px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showDpeFilter ? 8 : 0 }}>
            <button onClick={() => setShowDpeFilter(v => !v)} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#5F5E5A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>⚡ DPE récents {showDpeFilter ? '▲' : '▼'}</button>
            {dpeFlags.length > 0 && <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{dpeFlags.length} DPE</span>}
          </div>
          {showDpeFilter && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[7,14,30,90].map(d => <button key={d} onClick={() => quickSet(d)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer' }}>{d}j</button>)}
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
            : <TerrainMap adresses={preAdressesForMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={() => {}} dpeFlags={dpeFlags} dpeFilterFrom={dpeFrom} dpeFilterTo={dpeTo} />}
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── TERMINÉE
  // ══════════════════════════════════════════════════════════════════════════
  if (appState === 'terminee') {
    const rapport = session?.rapport_json ?? {}
    const zoneName = session?.zones_prospection?.nom ?? session?.commune_nom ?? 'Session libre'

    return (
      <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8e7e0', padding: '28px', width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: 4 }}>Session terminée !</h2>
            <div style={{ fontSize: '0.82rem', color: '#9b9b96' }}>{zoneName}</div>
          </div>
          <div style={{ background: '#f8f7f4', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontSize: '0.72rem', color: '#9b9b96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Rapport de prospection</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Portes',     value: rapport.nb_visites  ?? nbVisites, accent: true  },
                { label: 'Contacts',   value: rapport.nb_contacts ?? 0,         accent: false },
                { label: 'Boitage',    value: rapport.nb_boitage  ?? rapport.nb_flyers ?? 0, accent: false },
                { label: 'Maisons',    value: rapport.nb_maisons  ?? 0,         accent: false },
                { label: 'Collectif',  value: rapport.nb_collectif ?? rapport.nb_immeubles ?? 0, accent: false },
                { label: 'Commerces',  value: rapport.nb_commerces ?? 0,        accent: false },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 8, background: accent ? '#f0fdf4' : '#fff', border: '1px solid ' + (accent ? '#bbf7d0' : '#E8E6DF') }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: accent ? '#1D9E75' : '#1a1a18', lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: '0.68rem', color: '#9b9b96', marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>
            {rapport.nb_syndics > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#fff', border: '1px solid #E8E6DF', fontSize: '0.82rem', color: '#374151', textAlign: 'center' }}>
                🏢 {rapport.nb_syndics} syndic{rapport.nb_syndics > 1 ? 's' : ''} identifié{rapport.nb_syndics > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/planning')}
              style={{ flex: 1, padding: '11px', borderRadius: 10, background: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: '0.875rem', border: '1px solid #e5e7eb', cursor: 'pointer' }}>
              Planning
            </button>
            <button onClick={() => router.push('/dashboard')}
              style={{ flex: 1, padding: '11px', borderRadius: 10, background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer' }}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Header session en cours ───────────────────────────────────────────────
  const sessionHeader = (
    <div style={{ height: 52, background: '#fff', borderBottom: '1px solid #e8e7e0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {isHorsZone ? <span style={{ fontSize: '1rem', flexShrink: 0 }}>🚶</span>
          : session?.zones_prospection && <div style={{ width: 10, height: 10, borderRadius: '50%', background: session.zones_prospection.couleur ?? '#1D9E75', flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isHorsZone ? `Libre — ${session?.commune_nom ?? 'Hors zone'}` : (session?.zones_prospection?.nom ?? 'Session en cours')}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9b9b96' }}>
            {isHorsZone ? 'Prospection libre hors zone' : `${nbVisites}/${nbTotal} · ${pctCouvert}% · ${aFaireCount} restantes`}
          </div>
        </div>
      </div>
      {!isHorsZone && (
        <>
          <button onClick={allerAdresseSuivante} style={{ padding: '5px 10px', borderRadius: 7, background: '#f0fdf4', color: '#1D9E75', fontWeight: 600, fontSize: '0.78rem', border: '1px solid #bbf7d0', cursor: 'pointer', flexShrink: 0 }}>Suivante →</button>
          <button onClick={ouvrirGoogleMaps}      style={{ padding: '5px 10px', borderRadius: 7, background: '#f8f7f4', color: '#374151', fontWeight: 600, fontSize: '0.78rem', border: '1px solid #e8e7e0', cursor: 'pointer', flexShrink: 0 }}>🗺</button>
        </>
      )}
      <button onClick={handleEndSession} disabled={loading}
        style={{ padding: '5px 10px', borderRadius: 7, background: loading ? '#e5e7eb' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: '0.78rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
        Terminer
      </button>
    </div>
  )

  const legendeMap = (
    <div style={{ position: 'absolute', bottom: 16, left: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '6px 10px', fontSize: '0.68rem', color: '#5F5E5A', border: '1px solid #e8e7e0', pointerEvents: 'none' }}>
      {[{color:'#ef4444',label:'À faire'},{color:'#3b82f6',label:'Boîté'},{color:'#22c55e',label:'Contact'},{color:'#9b9b96',label:'Autre'},{color:'#1a1a18',label:'Supprimée'}].map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} /><span>{item.label}</span>
        </div>
      ))}
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // ── EN COURS DESKTOP
  // ══════════════════════════════════════════════════════════════════════════
  if (isDesktop && appState === 'en_cours') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {sessionHeader}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: 360, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #e8e7e0', overflow: 'hidden', flexShrink: 0 }}>
            {sheetOpen && selectedAdresse ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EDE6', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => { setSheetOpen(false); setSelectedAdresse(null) }} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9b9b96', cursor: 'pointer', padding: 0, marginTop: 2 }}>←</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a18' }}>{[selectedAdresse.numero, selectedAdresse.nom_voie].filter(Boolean).join(' ') || 'Adresse'}</div>
                    <div style={{ fontSize: 12, color: '#9b9b96', marginTop: 2 }}>{selectedAdresse.code_postal} {selectedAdresse.commune}</div>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <BottomSheet open={true} inline={true} adresse={selectedAdresse} sessionId={session?.id ?? ''} onClose={() => { setSheetOpen(false); setSelectedAdresse(null) }} onQualification={handleQualification} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F0EDE6', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['all','a_faire','contact','boite','supprimee'] as const).map(f => (
                      <button key={f} onClick={() => setAdresseFilter(f)}
                        style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: adresseFilter===f ? '#1D9E75' : '#f3f4f6', color: adresseFilter===f ? '#fff' : '#6b7280', border: adresseFilter===f ? 'none' : '1px solid #e5e7eb' }}>
                        {f === 'all' ? `Toutes (${adresses.length})` : `${STATUT_LABEL[f]} (${adresses.filter(a=>a.statut_carte===f).length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {isHorsZone && adresses.length === 0 ? (
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, textAlign:'center', color:'#9b9b96' }}>
                      <div style={{ fontSize:'3rem', marginBottom:12 }}>🚶</div>
                      <div style={{ fontWeight:600, fontSize:'0.9rem', color:'#1a1a18', marginBottom:6 }}>Mode libre</div>
                      <div style={{ fontSize:'0.82rem', lineHeight:1.6 }}>Prospection sans itinéraire pré-défini.<br/>Les adresses de la commune sont chargées sur la carte.</div>
                    </div>
                  ) : adressesFiltrees.map(a => {
                    const isProchaine = a.id === prochaineAdresseId
                    return (
                      <div key={a.id} onClick={() => handleAdresseClick(a)}
                        style={{ padding: '10px 14px', borderBottom: '1px solid #F0EDE6', cursor: 'pointer', background: isProchaine ? '#f0fdf4' : 'white', borderLeft: `3px solid ${isProchaine ? '#1D9E75' : STATUT_COLOR[a.statut_carte] ?? '#e5e7eb'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUT_COLOR[a.statut_carte], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[a.numero, a.nom_voie].filter(Boolean).join(' ')}
                            </div>
                            <div style={{ fontSize: 11, color: '#9b9b96', display: 'flex', gap: 6, marginTop: 2 }}>
                              <span>{STATUT_LABEL[a.statut_carte]}</span>
                              {a.type_habitat && <span>· {a.type_habitat === 'individuel' ? '🏠' : a.type_habitat === 'collectif' ? '🏢' : '🏪'}</span>}
                              {isProchaine && <span style={{ color: '#1D9E75', fontWeight: 700 }}>← Suivante</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, color: '#9b9b96' }}>›</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TerrainMap adresses={adresses} zonePolygon={null} prochaineAdresseId={prochaineAdresseId} onAdresseClick={handleAdresseClick} dpeFlags={activeDpeFlags} />
            {legendeMap}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── EN COURS MOBILE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#1a1a18' }}>
      {sessionHeader}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <TerrainMap adresses={adresses} zonePolygon={null} prochaineAdresseId={prochaineAdresseId} onAdresseClick={handleAdresseClick} dpeFlags={activeDpeFlags} />
        {!sheetOpen && legendeMap}
        {isHorsZone && !sheetOpen && (
          <div style={{ position: 'absolute', bottom: 16, right: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 12px', fontSize: '0.75rem', color: '#374151', border: '1px solid #e8e7e0', fontWeight: 600 }}>
            🚶 {session?.commune_nom}
          </div>
        )}
      </div>
      {selectedAdresse && (
        <BottomSheet open={sheetOpen} adresse={selectedAdresse} sessionId={session?.id ?? ''} onClose={() => { setSheetOpen(false); setSelectedAdresse(null) }} onQualification={handleQualification} />
      )}
    </div>
  )
}
