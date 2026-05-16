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
              <p style={{ color: '#5F5E5A', fontSize: '0.875rem' }}>Aucune zone c
