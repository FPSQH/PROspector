'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/terrain/BottomSheet'

const TerrainMap = dynamic(() => import('@/components/terrain/TerrainMap'), { ssr: false })

interface Zone {
  id: string; nom: string; couleur: string; numero: number; nb_prospectables: number
}
interface Adresse {
  id: string; lat: number; lon: number; numero?: string; nom_voie?: string
  code_postal?: string; commune?: string; type_bien?: string; nb_bal?: number
  prospectable?: boolean; statut_carte: 'a_faire' | 'contact' | 'boite' | 'visite'
  interaction?: any; ordre: number; score?: number
  latest_dpe_date?: string | null; etiquette_dpe?: string | null
  has_audit?: boolean; audit_n?: string | null
  type_habitat?: string; mode_prospection?: string; statut_prospectabilite?: string
  nom_syndic?: string; nb_acces_observe?: number
  courrier_cible_possible?: boolean; commentaire_adresse?: string
}
interface Session {
  id: string; zone_id: string; statut: string; date_session: string; created_at?: string
  heure_debut_reel?: string; zones_prospection: { nom: string; couleur: string; numero: number }
}
interface Rapport {
  nb_visites: number; nb_contacts: number; nb_flyers: number
  nb_maisons: number; nb_immeubles: number; nb_qualifications: number
  contacts: any[]; date_cloture: string
}

type AppState = 'checking' | 'resume_prompt' | 'choix_zone' | 'pre_session' | 'en_cours' | 'terminee'

const SESSION_KEY = 'prospector_session_id'

export default function TerrainPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [appState, setAppState]       = useState<AppState>('checking')
  const [zones, setZones]             = useState<Zone[]>([])
  const [activeSessionFound, setActiveSessionFound] = useState<Session | null>(null)
  const [preZone, setPreZone]         = useState<Zone | null>(null)
  const [preAdresses, setPreAdresses] = useState<any[]>([])
  const [preLoading, setPreLoading]   = useState(false)
  const [showDpeFilter, setShowDpeFilter] = useState(false)
  const [dpeFrom, setDpeFrom]         = useState('')
  const [dpeTo, setDpeTo]             = useState('')
  const [pendingFrom, setPendingFrom] = useState('')
  const [pendingTo, setPendingTo]     = useState('')
  const [dpeFlags, setDpeFlags]       = useState<string[]>([])
  const [activeDpeFlags, setActiveDpeFlags] = useState<string[]>([])
  const [session, setSession]         = useState<Session | null>(null)
  const [adresses, setAdresses]       = useState<Adresse[]>([])
  const [nbTotal, setNbTotal]         = useState(0)
  const [nbVisites, setNbVisites]     = useState(0)
  const [pctCouvert, setPctCouvert]   = useState(0)
  const [loading, setLoading]         = useState(false)
  const [selectedAdresse, setSelectedAdresse] = useState<Adresse | null>(null)
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [itineraire, setItineraire]   = useState<string[]>([])
  const [idxCourant, setIdxCourant]   = useState(0)
  const [rapport, setRapport]         = useState<Rapport | null>(null)

  const calculerItineraire = (adrs: Adresse[]): string[] => {
    const points = adrs.filter((a) => a.lat && a.lon && a.prospectable !== false)
    if (points.length === 0) return []
    const visited = new Set<string>()
    const result: string[] = []
    let current = points.reduce((best, p) => p.lat + p.lon < best.lat + best.lon ? p : best)
    while (result.length < points.length) {
      visited.add(current.id); result.push(current.id)
      let nearest: Adresse | null = null; let minDist = Infinity
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

  // ── Chargement initial : vérifier session active ──────────────
  useEffect(() => {
    ;(async () => {
      const [zonesRes, activeRes] = await Promise.all([
        fetch('/api/zones').then(r => r.json()),
        fetch('/api/sessions?statut=en_cours').then(r => r.json()).catch(() => ({ sessions: [] })),
      ])

      const zonesData = zonesRes.zones ?? []
      setZones(zonesData)

      const active = activeRes.sessions?.[0] ?? null
      if (active) {
        setActiveSessionFound(active)
        setAppState('resume_prompt')
      } else {
        setAppState('choix_zone')
        const zoneIdParam = searchParams.get('zone_id')
        if (zoneIdParam) {
          const zone = zonesData.find((z: Zone) => z.id === zoneIdParam)
          if (zone) handleZonePreview(zone)
        }
      }
    })()
  }, []) // eslint-disable-line

  // ── Reprendre la session active ───────────────────────────────
  const handleResumeSession = async () => {
    if (!activeSessionFound) return
    setLoading(true)
    setSession(activeSessionFound)
    setActiveDpeFlags([])
    await loadSessionData(activeSessionFound.id)
    setAppState('en_cours')
    setLoading(false)
  }

  // ── Abandonner la session active et démarrer une nouvelle ─────
  const handleAbandonAndNew = async () => {
    if (!activeSessionFound) return
    if (!confirm('Clôturer la session en cours sans enregistrer ?')) return
    await fetch(`/api/sessions/${activeSessionFound.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'non_realisee' }),
    })
    try { localStorage.removeItem(SESSION_KEY) } catch (_) {}
    setActiveSessionFound(null)
    setAppState('choix_zone')
  }

  // ── Aperçu de zone avant démarrage ───────────────────────────
  const handleZonePreview = async (zone: Zone) => {
    setPreZone(zone); setDpeFlags([]); setPreAdresses([]); setAppState('pre_session'); setPreLoading(true)
    const now = new Date()
    const toDate   = now.toISOString().split('T')[0]
    const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
    setDpeTo(toDate); setDpeFrom(fromDate); setPendingTo(toDate); setPendingFrom(fromDate)
    try {
      const res = await fetch(`/api/zones/${zone.id}/adresses`)
      const data = await res.json()
      setPreAdresses(data.adresses ?? [])
    } finally { setPreLoading(false) }
  }

  useEffect(() => {
    if (!dpeFrom && !dpeTo) { setDpeFlags([]); return }
    const from = dpeFrom ? new Date(dpeFrom) : new Date(0)
    const to   = dpeTo   ? new Date(dpeTo + 'T23:59:59') : new Date()
    const flags = preAdresses.filter((a: any) => {
      if (!a.latest_dpe_date) return false
      const d = new Date(a.latest_dpe_date)
      return d >= from && d <= to
    }).map((a: any) => a.id)
    setDpeFlags(flags)
  }, [preAdresses, dpeFrom, dpeTo])

  // ── Démarrer une session ──────────────────────────────────────
  const handleStartSession = async (zone: Zone) => {
    // Vérifier s'il existe une autre session en cours
    const activeRes = await fetch('/api/sessions?statut=en_cours').then(r => r.json()).catch(() => ({ sessions: [] }))
    const existingActive = activeRes.sessions?.[0]
    if (existingActive) {
      if (!confirm(`Une session est déjà en cours sur "${existingActive.zones_prospection?.nom ?? 'une zone'}". La clôturer avant de continuer ?`)) return
      await fetch(`/api/sessions/${existingActive.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'non_realisee' }),
      })
    }

    setActiveDpeFlags(dpeFlags)
    setLoading(true)
    try {
      const res  = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zone.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.session) { console.error('[terrain] POST /api/sessions erreur:', data); return }
      setSession(data.session)
      try { localStorage.setItem(SESSION_KEY, data.session.id) } catch (_) {}
      await loadSessionData(data.session.id)
      setAppState('en_cours')
    } catch (e) {
      console.error('[terrain] handleStartSession erreur:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadSessionData = useCallback(async (sessionId: string) => {
    const res  = await fetch(`/api/sessions/${sessionId}`)
    const data = await res.json()
    if (!res.ok) return
    setAdresses(data.adresses ?? [])
    setNbTotal(data.nb_total ?? 0)
    setNbVisites(data.nb_visites ?? 0)
    setPctCouvert(data.pct_couvert ?? 0)
    const itin = calculerItineraire(data.adresses ?? [])
    setItineraire(itin); setIdxCourant(0)
  }, [])

  const handleAdresseClick = (adresse: Adresse) => {
    setSelectedAdresse(adresse); setSheetOpen(true)
  }

  const handleQualification = async (interactionData: any) => {
    if (!session || !selectedAdresse) return
    await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, adresse_id: selectedAdresse.id, ...interactionData }),
    })
    const statut: Adresse['statut_carte'] =
      interactionData.resultat === 'contact_etabli' ? 'contact'
      : interactionData.action === 'flyer' || interactionData.action === 'courrier' ? 'boite'
      : 'visite'
    setAdresses((prev) => prev.map((a) => a.id === selectedAdresse.id ? { ...a, statut_carte: statut, interaction: interactionData } : a))
    setNbVisites((prev) => { const wasVisited = selectedAdresse.statut_carte !== 'a_faire'; return wasVisited ? prev : prev + 1 })
    setPctCouvert(nbTotal > 0 ? Math.round(((nbVisites + 1) / nbTotal) * 100) : 0)
    setSheetOpen(false); setSelectedAdresse(null)
    setIdxCourant((prev) => Math.min(prev + 1, itineraire.length - 1))
  }

  const allerAdresseSuivante = () => {
    for (let i = idxCourant; i < itineraire.length; i++) {
      const adr = adresses.find((a) => a.id === itineraire[i])
      if (adr && adr.statut_carte === 'a_faire') { setIdxCourant(i); setSelectedAdresse(adr); setSheetOpen(true); return }
    }
    const premiere = adresses.find((a) => a.statut_carte === 'a_faire')
    if (premiere) { setSelectedAdresse(premiere); setSheetOpen(true) }
  }

  const ouvrirGoogleMaps = () => {
    const adr = adresses.find((a) => a.id === itineraire[idxCourant])
    if (!adr?.lat || !adr?.lon) return
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${adr.lat},${adr.lon}&travelmode=walking`, '_blank')
  }

  // ── Terminer la session ───────────────────────────────────────
  const handleEndSession = async () => {
    if (!session) return
    if (!confirm('Terminer et clôturer cette session de prospection ?')) return
    setLoading(true)
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'realisee', nb_portes: nbVisites }),
    })
    const d = await res.json()
    setRapport(d.rapport ?? null)
    try { localStorage.removeItem(SESSION_KEY) } catch (_) {}
    setLoading(false)
    setAppState('terminee')
  }

  const prochaineAdresseId = itineraire[idxCourant] ?? null

  // ── Écran : vérification initiale ─────────────────────────────
  if (appState === 'checking') {
    return (
      <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f7f4' }}>
        <div style={{ fontSize:'0.875rem', color:'#9b9b96' }}>Chargement…</div>
      </div>
    )
  }

  // ── Écran : reprise de session ────────────────────────────────
  if (appState === 'resume_prompt' && activeSessionFound) {
    const z = activeSessionFound.zones_prospection
    const debutFr = activeSessionFound.heure_debut_reel
      ? new Date(activeSessionFound.heure_debut_reel).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
      : activeSessionFound.created_at
        ? new Date(activeSessionFound.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
        : ''
    const dateFr = activeSessionFound.date_session
      ? new Date(activeSessionFound.date_session + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
      : ''

    return (
      <div style={{ height:'100dvh', background:'#f8f7f4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px' }}>
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e8e7e0', padding:'28px 24px', width:'100%', maxWidth:380, textAlign:'center' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:12 }}>⚡</div>
          <h2 style={{ fontSize:'1rem', fontWeight:700, color:'#1a1a18', marginBottom:6 }}>Session en cours</h2>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:4 }}>
            {z && <div style={{ width:10, height:10, borderRadius:'50%', background:z.couleur }}/>}
            <span style={{ fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>{z?.nom ?? 'Zone'}</span>
          </div>
          <p style={{ fontSize:'0.78rem', color:'#9b9b96', marginBottom:24 }}>
            {dateFr}{debutFr && ` · démarrée à ${debutFr}`}
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button
              onClick={handleResumeSession}
              disabled={loading}
              style={{ width:'100%', padding:'13px', borderRadius:10, background:loading?'#9b9b96':'#1D9E75', color:'#fff', fontWeight:700, fontSize:'0.95rem', border:'none', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Chargement…' : 'Reprendre la session →'}
            </button>
            <button
              onClick={handleAbandonAndNew}
              style={{ width:'100%', padding:'11px', borderRadius:10, background:'#fff', color:'#dc2626', fontWeight:600, fontSize:'0.85rem', border:'1.5px solid #fca5a5', cursor:'pointer' }}>
              Abandonner et démarrer une nouvelle
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ background:'none', border:'none', color:'#9b9b96', fontSize:'0.8rem', cursor:'pointer', marginTop:4 }}>
              ← Retour au dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Écran : choix de zone ─────────────────────────────────────
  if (appState === 'choix_zone') {
    return (
      <div style={{ minHeight:'100dvh', background:'#f8f7f4', display:'flex', flexDirection:'column' }}>
        <div style={{ background:'#fff', borderBottom:'1px solid #e8e7e0', padding:'0 20px', height:52, display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background:'none', border:'none', color:'#9b9b96', cursor:'pointer', fontSize:'0.9rem' }}>←</button>
          <span style={{ fontWeight:600, fontSize:'0.9375rem', color:'#1a1a18' }}>Démarrer une tournée</span>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 16px' }}>
          <p style={{ fontSize:'0.82rem', color:'#9b9b96', marginBottom:16 }}>Choisissez la zone à prospecter aujourd'hui</p>
          {zones.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 0' }}>
              <div style={{ fontSize:'2rem', marginBottom:12 }}>🗺️</div>
              <p style={{ color:'#5F5E5A', fontSize:'0.875rem' }}>Aucune zone configurée</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {zones.map((zone) => (
                <button key={zone.id} onClick={() => handleZonePreview(zone)} disabled={loading}
                  style={{ display:'flex', alignItems:'center', gap:14, background:'#fff', border:'1px solid #e8e7e0', borderRadius:12, padding:'14px 16px', cursor:loading?'not-allowed':'pointer', textAlign:'left', width:'100%' }}>
                  <div style={{ width:12, height:12, borderRadius:'50%', background:zone.couleur, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:'0.9rem', color:'#1a1a18' }}>{zone.nom}</div>
                    <div style={{ fontSize:'0.75rem', color:'#9b9b96', marginTop:2 }}>{zone.nb_prospectables} adresses</div>
                  </div>
                  <div style={{ color:'#1D9E75', fontSize:'1.1rem' }}>→</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Écran : pré-session ───────────────────────────────────────
  if (appState === 'pre_session' && preZone) {
    const applyFilter = (from: string, to: string) => { setDpeFrom(from); setDpeTo(to); setPendingFrom(from); setPendingTo(to) }
    const quickSet = (days: number) => {
      const now = new Date()
      const to   = now.toISOString().split('T')[0]
      const from = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0]
      applyFilter(from, to)
    }
    const preAdressesForMap = preAdresses.map((a: any, i: number) => ({ ...a, statut_carte: 'a_faire' as const, ordre: i, prospectable: a.prospectable !== false }))
    return (
      <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#f8f7f4' }}>
        <div style={{ background:'#fff', borderBottom:'1px solid #e8e7e0', padding:'0 16px', height:52, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => setAppState('choix_zone')} style={{ background:'none', border:'none', color:'#9b9b96', cursor:'pointer', fontSize:'1rem', padding:'4px' }}>←</button>
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:preZone.couleur, flexShrink:0 }}/>
            <span style={{ fontWeight:600, color:'#1a1a18', fontSize:'0.9375rem' }}>{preZone.nom}</span>
            <span style={{ fontSize:'0.75rem', color:'#9b9b96' }}>{preZone.nb_prospectables} adresses</span>
          </div>
        </div>
        <div style={{ background:'#fff', borderBottom:'1px solid #e8e7e0', padding:'12px 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <button onClick={() => setShowDpeFilter(v => !v)} style={{ fontSize:'0.78rem', fontWeight:600, color:'#5F5E5A', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:4 }}>⚡ DPE récents {showDpeFilter ? '▲' : '▼'}</button>
            {dpeFlags.length > 0 && (
              <span style={{ background:'#fef3c7', color:'#d97706', border:'1px solid #fde68a', borderRadius:10, padding:'1px 8px', fontSize:'0.7rem', fontWeight:600 }}>🚩 {dpeFlags.length} adresse{dpeFlags.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {showDpeFilter && (
            <>
              <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                <button onClick={() => quickSet(14)} style={{ padding:'6px 14px', borderRadius:20, fontSize:'0.78rem', fontWeight:600, border:'1.5px solid #1D9E75', background:'#f0fdf4', color:'#1D9E75', cursor:'pointer' }}>2 semaines</button>
                <button onClick={() => quickSet(30)} style={{ padding:'6px 14px', borderRadius:20, fontSize:'0.78rem', fontWeight:600, border:'1.5px solid #1D9E75', background:'#f0fdf4', color:'#1D9E75', cursor:'pointer' }}>1 mois</button>
                <button onClick={() => { setDpeFrom(''); setDpeTo(''); setPendingFrom(''); setPendingTo('') }} style={{ padding:'6px 10px', borderRadius:20, fontSize:'0.75rem', fontWeight:500, border:'1px solid #e8e7e0', background:'transparent', color:'#9b9b96', cursor:'pointer' }}>Effacer</button>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
                <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)} style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1.5px solid #e8e7e0', fontSize:'0.8rem' }}/>
                <span style={{ color:'#9b9b96', fontSize:'0.8rem', flexShrink:0 }}>→</span>
                <input type="date" value={pendingTo}   onChange={e => setPendingTo(e.target.value)}   style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1.5px solid #e8e7e0', fontSize:'0.8rem' }}/>
              </div>
              <button onClick={() => applyFilter(pendingFrom, pendingTo)} disabled={!pendingFrom && !pendingTo}
                style={{ marginTop:10, width:'100%', padding:'8px', borderRadius:8, background:(pendingFrom||pendingTo)?'#1D9E75':'#e8e7e0', color:'#fff', border:'none', fontWeight:600, fontSize:'0.8rem', cursor:(pendingFrom||pendingTo)?'pointer':'not-allowed' }}>
                Appliquer
              </button>
            </>
          )}
        </div>
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
          {preLoading ? (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f7f4', fontSize:'0.875rem', color:'#9b9b96' }}>Chargement…</div>
          ) : (
            <TerrainMap adresses={preAdressesForMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={() => {}} dpeFlags={dpeFlags} dpeFilterFrom={dpeFrom} dpeFilterTo={dpeTo} />
          )}
          {dpeFlags.length > 0 && (
            <div style={{ position:'absolute', bottom:16, left:12, background:'rgba(245,158,11,0.92)', borderRadius:8, padding:'5px 12px', fontSize:'0.72rem', color:'#fff', fontWeight:600, pointerEvents:'none' }}>
              🚩 {dpeFlags.length} DPE récent{dpeFlags.length > 1 ? 's' : ''} affiché{dpeFlags.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
        <div style={{ padding:'12px 16px', background:'#fff', borderTop:'1px solid #e8e7e0', flexShrink:0 }}>
          <button onClick={() => handleStartSession(preZone)} disabled={loading}
            style={{ width:'100%', padding:'14px', borderRadius:12, background:loading?'#9b9b96':'#1D9E75', color:'#fff', fontWeight:700, fontSize:'1rem', border:'none', cursor:loading?'not-allowed':'pointer' }}>
            {loading ? 'Démarrage…' : 'Démarrer la tournée →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Écran : session terminée ──────────────────────────────────
  if (appState === 'terminee') {
    const contactsRapport = rapport?.contacts ?? []
    return (
      <div style={{ minHeight:'100dvh', background:'#f8f7f4', display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 16px' }}>
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e8e7e0', padding:'28px 24px', width:'100%', maxWidth:420 }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:'3rem', marginBottom:10 }}>✅</div>
            <h2 style={{ fontSize:'1.1rem', fontWeight:700, color:'#1a1a18', marginBottom:4 }}>Session clôturée</h2>
            <p style={{ fontSize:'0.82rem', color:'#5F5E5A' }}>{session?.zones_prospection?.nom}</p>
          </div>

          {/* Stats principales */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              { label:'Adresses visitées', value: rapport ? `${rapport.nb_visites}/${nbTotal}` : `${nbVisites}/${nbTotal}`, color:'#1D9E75', bg:'#f0fdf4' },
              { label:'Couverture',         value: rapport ? (nbTotal > 0 ? `${Math.round(rapport.nb_visites/nbTotal*100)}%` : '—') : `${pctCouvert}%`, color:'#2196F3', bg:'#eff6ff' },
              { label:'Contacts',           value: rapport?.nb_contacts ?? adresses.filter(a => a.statut_carte==='contact').length, color:'#FF9800', bg:'#fff7ed' },
              { label:'Flyers déposés',     value: rapport?.nb_flyers ?? adresses.filter(a => a.statut_carte==='boite').length, color:'#9C27B0', bg:'#f5f3ff' },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'1.5rem', fontWeight:700, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:'0.68rem', color:'#9b9b96', marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Qualifications */}
          {rapport && (rapport.nb_maisons > 0 || rapport.nb_immeubles > 0) && (
            <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:10, background:'#f8f7f4', border:'1px solid #e8e7e0' }}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#9b9b96', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.04em' }}>Qualifications terrain</div>
              <div style={{ display:'flex', gap:12 }}>
                {rapport.nb_maisons > 0 && <span style={{ fontSize:'0.82rem', color:'#2196F3' }}>🏠 {rapport.nb_maisons} maison{rapport.nb_maisons>1?'s':''}</span>}
                {rapport.nb_immeubles > 0 && <span style={{ fontSize:'0.82rem', color:'#8b5cf6' }}>🏢 {rapport.nb_immeubles} immeuble{rapport.nb_immeubles>1?'s':''}</span>}
              </div>
            </div>
          )}

          {/* Contacts établis */}
          {contactsRapport.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#9b9b96', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.04em' }}>Contacts établis ({contactsRapport.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {contactsRapport.slice(0, 5).map((c: any) => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', borderRadius:8, background:'#f8f7f4', border:'1px solid #e8e7e0' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:'0.75rem', color:'#fff', fontWeight:700 }}>{(c.prenom?.[0] ?? c.nom?.[0] ?? '?').toUpperCase()}</span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#1a1a18' }}>{[c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'}</div>
                      {c.tel1 && <div style={{ fontSize:'0.72rem', color:'#9b9b96' }}>{c.tel1}</div>}
                    </div>
                  </div>
                ))}
                {contactsRapport.length > 5 && <div style={{ fontSize:'0.75rem', color:'#9b9b96', textAlign:'center' }}>+{contactsRapport.length - 5} autres contacts</div>}
              </div>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <button onClick={() => router.push('/dashboard')} style={{ width:'100%', padding:'12px', borderRadius:10, background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.9rem', border:'none', cursor:'pointer' }}>
              Retour au dashboard
            </button>
            <button onClick={() => router.push('/contacts')} style={{ width:'100%', padding:'10px', borderRadius:10, background:'#fff', color:'#1D9E75', fontWeight:600, fontSize:'0.85rem', border:'1.5px solid #bbf7d0', cursor:'pointer' }}>
              Voir les contacts →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Écran principal : carte terrain ──────────────────────────
  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#000' }}>
      <div style={{ background:'#fff', borderBottom:'1px solid #e8e7e0', padding:'0 12px', height:48, flexShrink:0, display:'flex', alignItems:'center', gap:10, zIndex:10 }}>
        <button onClick={() => setAppState('choix_zone')} style={{ background:'none', border:'none', color:'#9b9b96', cursor:'pointer', fontSize:'1rem', padding:'4px' }}>←</button>
        <div style={{ display:'flex', alignItems:'center', gap:7, flex:1, minWidth:0 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background:session?.zones_prospection?.couleur ?? '#1D9E75' }}/>
          <span style={{ fontWeight:600, fontSize:'0.875rem', color:'#1a1a18', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {session?.zones_prospection?.nom}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{ width:80, height:5, background:'#f0efeb', borderRadius:3 }}>
            <div style={{ width:`${pctCouvert}%`, height:'100%', background:'#1D9E75', borderRadius:3, transition:'width 0.3s ease' }}/>
          </div>
          <span style={{ fontSize:'0.75rem', color:'#5F5E5A', fontWeight:500, minWidth:30 }}>{nbVisites}/{nbTotal}</span>
        </div>
        <button onClick={allerAdresseSuivante} style={{ padding:'5px 10px', borderRadius:7, background:'#1D9E75', color:'#fff', border:'none', fontSize:'0.72rem', fontWeight:600, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', gap:4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          Suivante
        </button>
        {prochaineAdresseId && (
          <button onClick={ouvrirGoogleMaps} title="Naviguer vers cette adresse" style={{ padding:'5px 8px', borderRadius:7, background:'#eff6ff', color:'#1e40af', border:'1px solid #bfdbfe', fontSize:'0.72rem', fontWeight:600, cursor:'pointer', flexShrink:0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          </button>
        )}
        <button onClick={handleEndSession} disabled={loading} style={{ padding:'5px 10px', borderRadius:7, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', fontSize:'0.72rem', fontWeight:600, cursor:loading?'not-allowed':'pointer', flexShrink:0 }}>
          Terminer
        </button>
      </div>

      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        <TerrainMap adresses={adresses} zonePolygon={null} prochaineAdresseId={prochaineAdresseId} onAdresseClick={handleAdresseClick} dpeFlags={activeDpeFlags} />
        <div style={{ position:'absolute', bottom:sheetOpen?320:16, left:12, background:'rgba(255,255,255,0.95)', borderRadius:8, padding:'6px 10px', fontSize:'0.68rem', color:'#5F5E5A', border:'1px solid #e8e7e0', transition:'bottom 0.3s ease', pointerEvents:'none' }}>
          {[{ color:'#ef4444', label:'À faire' },{ color:'#3b82f6', label:'Boîté' },{ color:'#22c55e', label:'Contact' },{ color:'#9b9b96', label:'Autre' }].map((item) => (
            <div key={item.label} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:item.color, flexShrink:0 }}/>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedAdresse && (
        <BottomSheet open={sheetOpen} adresse={selectedAdresse} sessionId={session?.id ?? ''} onClose={() => { setSheetOpen(false); setSelectedAdresse(null) }} onQualification={handleQualification} />
      )}
    </div>
  )
}
