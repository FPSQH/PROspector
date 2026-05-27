'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/terrain/BottomSheet'

const TerrainMap = dynamic(() => import('@/components/terrain/TerrainMap'), { ssr: false })

/* ── Design tokens ───────────────────────────────────────────────── */
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
}

const DPE_COLORS: Record<string, string> = {
  A: '#059669', B: '#16a34a', C: '#84cc16',
  D: '#ca8a04', E: '#d97706', F: '#ea580c', G: '#dc2626',
}

interface Zone    { id: string; nom: string; couleur: string; numero: number; nb_prospectables: number }
interface Commune { id: string; nom: string; code_insee: string }
interface ContactPoint { id: string; lat: number; lon: number; prenom?: string|null; nom?: string|null; statut_pipeline?: string|null }
interface ZoneStat {
  couverture_mois_pct:   number
  couverture_mois_nb:    number
  dpe_recents_nb:        number
  derniere_session_date: string | null
  sessions_mois_nb:      number
  nb_contacts:           number
}

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

function formatDateCourte(dateStr: string | null): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatMoisAnnee(dateStr: string | null): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })
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
  const [zoneStats,        setZoneStats]         = useState<Record<string, ZoneStat>>({})
  const [communes,         setCommunes]          = useState<Commune[]>([])
  const [communeSelectee,  setCommuneSelectee]   = useState<Commune | null>(null)
  const [session,          setSession]           = useState<any>(null)
  const [sessionActive,    setSessionActive]     = useState<any>(null)
  const [preZone,          setPreZone]           = useState<Zone | null>(null)
  const [adresses,         setAdresses]          = useState<Adresse[]>([])
  const [preAdresses,      setPreAdresses]       = useState<any[]>([])
  const [preContacts,      setPreContacts]       = useState<ContactPoint[]>([])
  const [itineraire,       setItineraire]        = useState<string[]>([])
  const [idxCourant,       setIdxCourant]        = useState(0)
  const [nbTotal,          setNbTotal]           = useState(0)
  const [nbVisites,        setNbVisites]         = useState(0)
  const [pctCouvert,       setPctCouvert]        = useState(0)
  const [dpeToursPreparees, setDpeToursPreparees] = useState<any[]>([])
  const [loading,          setLoading]           = useState(false)
  const [preLoading,       setPreLoading]        = useState(false)
  const [sheetOpen,        setSheetOpen]         = useState(false)
  const [selectedAdresse,  setSelectedAdresse]   = useState<Adresse | null>(null)
  const [adresseFilter,    setAdresseFilter]     = useState<'all'|'a_faire'|'contact'|'boite'|'supprimee'>('all')

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  useEffect(() => {
    const init = async () => {
      const [zonesRes, communesRes, sessRes, statsRes, dpeTournRes] = await Promise.all([
        fetch('/api/zones').then(r => r.json()),
        fetch('/api/communes').then(r => r.json()),
        fetch('/api/sessions?statut=en_cours').then(r => r.json()),
        fetch('/api/zones/stats').then(r => r.json()),
        fetch('/api/sessions?statut=preparee&type_session=dpe').then(r => r.json()),
      ])

      const zonesData = zonesRes.zones ?? []
      setZones(zonesData)
      setCommunes(communesRes.communes ?? [])
      setZoneStats(statsRes.stats ?? {})
      setDpeToursPreparees(dpeTournRes.sessions ?? [])

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
            handleZonePreviewInner(zone, zonesData)
          }
        }
      }
    }
    init()
  }, []) // eslint-disable-line

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

  const handleStartSession = async (zone: Zone) => {
    setLoading(true)
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

  const handleStartDpeTournee = async (tour: any) => {
    setLoading(true)
    try {
      const patchRes = await fetch(`/api/sessions/${tour.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'en_cours' }),
      })
      if (!patchRes.ok) { console.error('[terrain] erreur démarrage tournée DPE'); return }
      const patchData = await patchRes.json()
      setSession(patchData.session ?? tour)
      await loadSessionData(tour.id)
      setDpeToursPreparees([])
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
    setPreZone(zone); setPreAdresses([]); setPreContacts([]); setAppState('pre_session'); setPreLoading(true)
    try {
      const [adrRes, ctRes] = await Promise.all([
        fetch(`/api/zones/${zone.id}/adresses`).then(r => r.json()),
        fetch(`/api/contacts?zone_id=${zone.id}`).then(r => r.json()),
      ])
      setPreAdresses(adrRes.adresses ?? [])
      // Contacts avec coordonnées (adresse directe ou via adresses join)
      const mapped: ContactPoint[] = (ctRes.contacts ?? [])
        .map((c: any) => ({
          id:              c.id,
          lat:             c.adresse_lat ?? c.adresses?.lat ?? null,
          lon:             c.adresse_lon ?? c.adresses?.lon ?? null,
          prenom:          c.prenom,
          nom:             c.nom,
          statut_pipeline: c.statut_pipeline,
        }))
        .filter((c: ContactPoint) => c.lat && c.lon)
      setPreContacts(mapped)
    } finally { setPreLoading(false) }
  }

  const handleZonePreview = (zone: Zone) => handleZonePreviewInner(zone)

  const prochaineAdresseId = itineraire[idxCourant] ?? null
  const aFaireCount        = adresses.filter(a => a.statut_carte === 'a_faire').length
  const isDpeTournee       = session?.type_session === 'dpe'
  const isHorsZone         = !session?.zone_id && !isDpeTournee
  const adressesFiltrees   = adresseFilter === 'all' ? adresses : adresses.filter(a => a.statut_carte === adresseFilter)

  /* ── Bannière session en cours ─────────────────────────────────── */
  const BanniereSessionActive = sessionActive ? (
    <div style={{ background: 'rgba(217,119,6,0.08)', border: '1.5px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#FBBF24', marginBottom: 4 }}>Session en cours non clôturée</div>
        <div style={{ fontSize: '0.8rem', color: C.mid, marginBottom: 12 }}>
          {sessionActive.zones_prospection
            ? `Zone ${sessionActive.zones_prospection.numero} — ${sessionActive.zones_prospection.nom}`
            : sessionActive.commune_nom ?? 'Session libre'
          } · démarrée le {new Date(sessionActive.date_session).toLocaleDateString('fr-FR')} à {sessionActive.heure_debut?.slice(0, 5)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={reprendreSession} disabled={loading}
            style={{ padding: '8px 16px', borderRadius: 8, background: C.primary, color: '#fff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer' }}>
            ▶ Reprendre la session
          </button>
          <button onClick={() => cloturerEtContinuer(() => {})} disabled={loading}
            style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#FBBF24', fontWeight: 600, fontSize: '0.82rem', border: '1px solid rgba(217,119,6,0.25)', cursor: 'pointer' }}>
            ✓ Clôturer sans reprendre
          </button>
        </div>
      </div>
    </div>
  ) : null

  /* ══════════════════════════════════════════════════════════════════
   * ── INIT
   * ══════════════════════════════════════════════════════════════════ */
  if (appState === 'init') {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '0.875rem' }}>
        Chargement…
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════
   * ── CHOIX DE ZONE
   * ══════════════════════════════════════════════════════════════════ */
  if (appState === 'choix_zone') {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: C.mid, cursor: 'pointer', fontSize: '0.9rem' }}>←</button>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: C.text }}>Démarrer une tournée</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', maxWidth: 600, width: '100%', margin: '0 auto' }}>

          {BanniereSessionActive}

          <p style={{ fontSize: '0.82rem', color: C.muted, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Zones de prospection
          </p>

          {sessionActive && (
            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, marginBottom: 12, fontSize: '0.8rem', color: C.muted, textAlign: 'center' }}>
              Clôturez ou reprenez la session en cours pour démarrer une nouvelle tournée
            </div>
          )}

          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗺️</div>
              <p style={{ fontSize: '0.875rem' }}>Aucune zone configurée</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, opacity: sessionActive ? 0.4 : 1 }}>
              {zones.map(zone => {
                const stat = zoneStats[zone.id]
                return (
                  <button key={zone.id}
                    onClick={() => sessionActive ? undefined : handleZonePreview(zone)}
                    disabled={!!sessionActive || loading}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: C.card, border: `1px solid ${C.borderl}`, borderRadius: 12, padding: '14px 16px', cursor: sessionActive ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: zone.couleur, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.text }}>{zone.nom}</div>
                      <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>{zone.nb_prospectables} adresses prospectables</div>
                      {stat && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {/* Couverture mois */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: stat.couverture_mois_pct > 0 ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.05)', color: stat.couverture_mois_pct > 0 ? C.primary : C.muted, border: `1px solid ${stat.couverture_mois_pct > 0 ? 'rgba(29,158,117,0.25)' : C.border}` }}>
                            📊 {stat.couverture_mois_pct}% ce mois
                          </span>
                          {/* DPE récents */}
                          {stat.dpe_recents_nb > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
                              🏠 {stat.dpe_recents_nb} DPE récents
                            </span>
                          )}
                          {/* Dernière session */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: C.mid, border: `1px solid ${C.border}` }}>
                            📅 {stat.derniere_session_date ? formatDateCourte(stat.derniere_session_date) : 'Jamais'}
                          </span>
                          {/* Contacts */}
                          {stat.nb_contacts > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: C.mid, border: `1px solid ${C.border}` }}>
                              👥 {stat.nb_contacts} contact{stat.nb_contacts > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ color: C.primary, fontSize: '1.1rem', flexShrink: 0, marginTop: 2 }}>→</div>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Tournées DPE préparées ── */}
          {dpeToursPreparees.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: '0.82rem', color: '#FBBF24', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🏠 Tournées DPE préparées
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: sessionActive ? 0.4 : 1 }}>
                {dpeToursPreparees.map(tour => {
                  const nbAdr = (tour.adresse_ids ?? []).length
                  const dateStr = new Date(tour.date_session).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                  const isToday = tour.date_session === new Date().toISOString().split('T')[0]
                  return (
                    <div key={tour.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🏠</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tour.nom_tournee ?? 'Tournée DPE'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>
                          {isToday ? <span style={{ color: C.primary, fontWeight: 700 }}>Aujourd&apos;hui</span> : dateStr} · {nbAdr} adresse{nbAdr > 1 ? 's' : ''}
                        </div>
                      </div>
                      <button onClick={() => sessionActive ? undefined : handleStartDpeTournee(tour)}
                        disabled={!!sessionActive || loading}
                        style={{ padding: '8px 14px', borderRadius: 8, background: loading ? C.dim : '#FBBF24', color: '#0C0C0E', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: sessionActive ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                        {loading ? '…' : 'Démarrer →'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24 }}>
            <p style={{ fontSize: '0.82rem', color: C.muted, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Prospection libre
            </p>
            <button
              onClick={() => sessionActive ? undefined : setAppState('pre_libre')}
              disabled={!!sessionActive || loading}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.card, border: `1.5px dashed ${C.borderl}`, borderRadius: 12, padding: '14px 16px', cursor: sessionActive ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%', opacity: sessionActive ? 0.4 : 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🚶</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.text }}>Prospection hors zone</div>
                <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>Prospecter librement dans une commune</div>
              </div>
              <div style={{ color: C.mid, fontSize: '1.1rem' }}>→</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════
   * ── PRÉ-SESSION LIBRE
   * ══════════════════════════════════════════════════════════════════ */
  if (appState === 'pre_libre') {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setAppState('choix_zone'); setCommuneSelectee(null) }} style={{ background: 'none', border: 'none', color: C.mid, cursor: 'pointer', fontSize: '0.9rem' }}>←</button>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: C.text }}>Prospection libre hors zone</span>
        </div>
        <div style={{ flex: 1, padding: '24px 16px', maxWidth: 520, width: '100%', margin: '0 auto' }}>
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px', marginBottom: 24, fontSize: '0.82rem', color: C.mid, lineHeight: 1.6 }}>
            Cette session n&apos;est pas rattachée à une zone planifiée. Elle apparaîtra dans votre planning comme une <strong style={{ color: C.text }}>prospection libre</strong> du jour.
          </div>
          <p style={{ fontSize: '0.82rem', color: C.muted, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Commune prospectée</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {communes.map(c => (
              <button key={c.id} onClick={() => setCommuneSelectee(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, textAlign: 'left', width: '100%', cursor: 'pointer', background: communeSelectee?.id === c.id ? 'rgba(29,158,117,0.1)' : C.card, border: '1.5px solid ' + (communeSelectee?.id === c.id ? 'rgba(29,158,117,0.4)' : C.borderl) }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: communeSelectee?.id === c.id ? C.primary : 'rgba(255,255,255,0.08)', border: '2px solid ' + (communeSelectee?.id === c.id ? C.primary : C.borderl), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {communeSelectee?.id === c.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.text }}>{c.nom}</div>
                  <div style={{ fontSize: '0.72rem', color: C.muted }}>{c.code_insee}</div>
                </div>
                {communeSelectee?.id === c.id && <span style={{ color: C.primary }}>✓</span>}
              </button>
            ))}
          </div>
          <button onClick={handleStartSessionLibre} disabled={!communeSelectee || loading}
            style={{ width: '100%', padding: '14px', borderRadius: 12, background: !communeSelectee || loading ? C.dim : C.primary, color: '#fff', fontWeight: 700, fontSize: '1rem', border: 'none', cursor: !communeSelectee || loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Démarrage…' : communeSelectee ? `Prospecter à ${communeSelectee.nom} →` : 'Choisissez une commune'}
          </button>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════
   * ── PRÉ-SESSION ZONE  (split layout)
   * ══════════════════════════════════════════════════════════════════ */
  if (appState === 'pre_session' && preZone) {
    const preAdressesForMap = preAdresses.map((a: any, i: number) => ({ ...a, statut_carte: 'a_faire' as const, ordre: i, prospectable: a.prospectable !== false }))
    const stat = zoneStats[preZone.id]
    const twoMonthsAgo = Date.now() - 60 * 24 * 3600 * 1000
    const dpeHotCount  = preAdresses.filter((a: any) => a.latest_dpe_date && new Date(a.latest_dpe_date).getTime() >= twoMonthsAgo).length

    /* ── Panneau stats ── */
    const StatItem = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '0.8rem', color: C.muted }}>{label}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: accent ? C.primary : C.text }}>{value}</span>
      </div>
    )

    const statsPanel = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        {/* Zone info */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: preZone.couleur }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: C.text }}>{preZone.nom}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: C.muted }}>{preZone.nb_prospectables} adresses prospectables</div>
        </div>

        {/* ── Légende carte ── */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>📍 Sur la carte</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '0.78rem', color: C.text, flex: 1 }}>DPE &lt; 2 mois</span>
              {dpeHotCount > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F59E0B' }}>{dpeHotCount}</span>}
              {dpeHotCount === 0 && !preLoading && <span style={{ fontSize: '0.72rem', color: C.dim }}>Aucun</span>}
              {preLoading && <span style={{ fontSize: '0.72rem', color: C.dim }}>…</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ADE80', flexShrink: 0, display: 'inline-block', border: '2px solid rgba(255,255,255,0.3)' }} />
              <span style={{ fontSize: '0.78rem', color: C.text, flex: 1 }}>Contacts CRM</span>
              {preContacts.length > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4ADE80' }}>{preContacts.length}</span>}
              {preContacts.length === 0 && !preLoading && <span style={{ fontSize: '0.72rem', color: C.dim }}>Aucun</span>}
              {preLoading && <span style={{ fontSize: '0.72rem', color: C.dim }}>…</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6B6B7B', flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '0.78rem', color: C.muted }}>Autres adresses</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>
          {/* Couverture mois */}
          <div style={{ paddingTop: 14, paddingBottom: 4 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>📊 Ce mois</div>
            {stat ? (
              <>
                <StatItem
                  label="Couverture"
                  value={`${stat.couverture_mois_pct}% (${stat.couverture_mois_nb} / ${preZone.nb_prospectables})`}
                  accent={stat.couverture_mois_pct > 0}
                />
                {/* Barre de progression */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, margin: '8px 0 4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(stat.couverture_mois_pct, 100)}%`, background: C.primary, borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
                <StatItem label="Sessions ce mois" value={stat.sessions_mois_nb > 0 ? `${stat.sessions_mois_nb} session${stat.sessions_mois_nb > 1 ? 's' : ''}` : 'Aucune'} />
              </>
            ) : (
              <div style={{ fontSize: '0.8rem', color: C.dim, paddingBottom: 8 }}>Chargement…</div>
            )}
          </div>

          {/* DPE récents */}
          <div style={{ paddingTop: 14, paddingBottom: 4 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>🏠 Signaux DPE</div>
            {stat ? (
              <StatItem
                label="DPE récents (< 2 mois)"
                value={stat.dpe_recents_nb > 0 ? `${stat.dpe_recents_nb} adresses` : 'Aucun'}
                accent={stat.dpe_recents_nb > 0}
              />
            ) : (
              <div style={{ fontSize: '0.8rem', color: C.dim, paddingBottom: 8 }}>Chargement…</div>
            )}
          </div>

          {/* Historique */}
          <div style={{ paddingTop: 14, paddingBottom: 4 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>📅 Historique</div>
            {stat ? (
              <StatItem
                label="Dernière session"
                value={stat.derniere_session_date ? formatDateCourte(stat.derniere_session_date) : 'Jamais prospecté'}
              />
            ) : (
              <div style={{ fontSize: '0.8rem', color: C.dim, paddingBottom: 8 }}>Chargement…</div>
            )}
          </div>

          {/* Contacts */}
          <div style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>👥 Contacts</div>
            {stat ? (
              <StatItem
                label="Contacts rattachés"
                value={stat.nb_contacts > 0 ? `${stat.nb_contacts} contact${stat.nb_contacts > 1 ? 's' : ''}` : 'Aucun'}
                accent={stat.nb_contacts > 0}
              />
            ) : (
              <div style={{ fontSize: '0.8rem', color: C.dim }}>Chargement…</div>
            )}
          </div>
        </div>

        {/* Bouton démarrer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={() => handleStartSession(preZone)} disabled={loading}
            style={{ width: '100%', padding: '13px', borderRadius: 12, background: loading ? C.dim : C.primary, color: '#fff', fontWeight: 700, fontSize: '0.975rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Démarrage…' : 'Démarrer la tournée →'}
          </button>
        </div>
      </div>
    )

    /* ── Desktop : split map + stats ── */
    if (isDesktop) {
      return (
        <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg }}>
          <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 16px', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setAppState('choix_zone')} style={{ background: 'none', border: 'none', color: C.mid, cursor: 'pointer', fontSize: '1rem' }}>←</button>
            <span style={{ fontWeight: 600, color: C.text, fontSize: '0.9375rem' }}>Préparer la tournée</span>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Carte */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {preLoading
                ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontSize: '0.875rem', color: C.muted }}>Chargement…</div>
                : <TerrainMap adresses={preAdressesForMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={() => {}} contacts={preContacts} defaultShowDpe={true} />}
            </div>
            {/* Panneau stats */}
            <div style={{ width: 340, background: C.card, borderLeft: `1px solid ${C.border}`, flexShrink: 0 }}>
              {statsPanel}
            </div>
          </div>
        </div>
      )
    }

    /* ── Mobile : stats compact + carte ── */
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg }}>
        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 16px', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setAppState('choix_zone')} style={{ background: 'none', border: 'none', color: C.mid, cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: preZone.couleur, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: C.text, fontSize: '0.9375rem' }}>{preZone.nom}</span>
            <span style={{ fontSize: '0.75rem', color: C.muted }}>{preZone.nb_prospectables} adresses</span>
          </div>
        </div>

        {/* Stats compactes mobile */}
        {stat && (
          <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: stat.couverture_mois_pct > 0 ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.06)', color: stat.couverture_mois_pct > 0 ? C.primary : C.muted, border: `1px solid ${stat.couverture_mois_pct > 0 ? 'rgba(29,158,117,0.3)' : C.border}` }}>
                📊 {stat.couverture_mois_pct}% ce mois
              </span>
              {stat.dpe_recents_nb > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  🏠 {stat.dpe_recents_nb} DPE
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1px solid ${C.border}` }}>
                📅 {stat.derniere_session_date ? formatDateCourte(stat.derniere_session_date) : 'Jamais'}
              </span>
              {stat.nb_contacts > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1px solid ${C.border}` }}>
                  👥 {stat.nb_contacts}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Carte */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {preLoading
            ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontSize: '0.875rem', color: C.muted }}>Chargement…</div>
            : <TerrainMap adresses={preAdressesForMap} zonePolygon={null} prochaineAdresseId={null} onAdresseClick={() => {}} contacts={preContacts} defaultShowDpe={true} />}
        </div>

        {/* Bouton démarrer */}
        <div style={{ padding: '12px 16px', background: C.card, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={() => handleStartSession(preZone)} disabled={loading}
            style={{ width: '100%', padding: '14px', borderRadius: 12, background: loading ? C.dim : C.primary, color: '#fff', fontWeight: 700, fontSize: '1rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Démarrage…' : 'Démarrer la tournée →'}
          </button>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════
   * ── TERMINÉE
   * ══════════════════════════════════════════════════════════════════ */
  if (appState === 'terminee') {
    const rapport = session?.rapport_json ?? {}
    const zoneName = session?.type_session === 'dpe'
      ? `🏠 ${session?.nom_tournee ?? 'Tournée DPE'}`
      : session?.zones_prospection?.nom ?? session?.commune_nom ?? 'Session libre'

    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.borderl}`, padding: '28px', width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>Session terminée !</h2>
            <div style={{ fontSize: '0.82rem', color: C.muted }}>{zoneName}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Rapport de prospection</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Portes',     value: rapport.nb_visites  ?? nbVisites, accent: true  },
                { label: 'Contacts',   value: rapport.nb_contacts ?? 0,         accent: false },
                { label: 'Boitage',    value: rapport.nb_boitage  ?? rapport.nb_flyers ?? 0, accent: false },
                { label: 'Maisons',    value: rapport.nb_maisons  ?? 0,         accent: false },
                { label: 'Collectif',  value: rapport.nb_collectif ?? rapport.nb_immeubles ?? 0, accent: false },
                { label: 'Commerces',  value: rapport.nb_commerces ?? 0,        accent: false },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 8, background: accent ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (accent ? 'rgba(29,158,117,0.3)' : C.border) }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: accent ? C.primary : C.text, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>
            {rapport.nb_syndics > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, fontSize: '0.82rem', color: C.mid, textAlign: 'center' }}>
                🏢 {rapport.nb_syndics} syndic{rapport.nb_syndics > 1 ? 's' : ''} identifié{rapport.nb_syndics > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/planning')}
              style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: C.text, fontWeight: 600, fontSize: '0.875rem', border: `1px solid ${C.border}`, cursor: 'pointer' }}>
              Planning
            </button>
            <button onClick={() => router.push('/dashboard')}
              style={{ flex: 1, padding: '11px', borderRadius: 10, background: C.primary, color: '#fff', fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer' }}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Header session en cours ───────────────────────────────────── */
  const sessionHeader = (
    <>
      <div style={{ height: 52, background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {isDpeTournee
            ? <span style={{ fontSize: '1rem', flexShrink: 0 }}>🏠</span>
            : isHorsZone
              ? <span style={{ fontSize: '1rem', flexShrink: 0 }}>🚶</span>
              : session?.zones_prospection && <div style={{ width: 10, height: 10, borderRadius: '50%', background: session.zones_prospection.couleur ?? C.primary, flexShrink: 0 }} />
          }
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isDpeTournee
                ? `DPE · ${session?.nom_tournee ?? 'Tournée DPE'}`
                : isHorsZone
                  ? `Libre — ${session?.commune_nom ?? 'Hors zone'}`
                  : (session?.zones_prospection?.nom ?? 'Session en cours')
              }
            </div>
            <div style={{ fontSize: '0.7rem', color: C.muted }}>
              {isHorsZone ? 'Prospection libre hors zone' : `${nbVisites}/${nbTotal} · ${pctCouvert}% · ${aFaireCount} restantes`}
            </div>
          </div>
        </div>
        {!isHorsZone && (
          <>
            <button onClick={allerAdresseSuivante} style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(29,158,117,0.12)', color: C.success, fontWeight: 600, fontSize: '0.78rem', border: '1px solid rgba(29,158,117,0.25)', cursor: 'pointer', flexShrink: 0 }}>Suivante →</button>
            <button onClick={ouvrirGoogleMaps}      style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: C.text, fontWeight: 600, fontSize: '0.78rem', border: `1px solid ${C.border}`, cursor: 'pointer', flexShrink: 0 }}>🗺</button>
          </>
        )}
        <button onClick={handleEndSession} disabled={loading}
          style={{ padding: '5px 10px', borderRadius: 7, background: loading ? C.dim : C.danger, color: '#fff', fontWeight: 600, fontSize: '0.78rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
          Terminer
        </button>
      </div>
      {/* Barre de progression mince */}
      {!isHorsZone && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            width: `${Math.min(pctCouvert, 100)}%`,
            background: pctCouvert >= 80 ? C.success : C.primary,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}
    </>
  )

  const legendeMap = (
    <div style={{ position: 'absolute', bottom: 16, left: 12, background: 'rgba(12,12,14,0.92)', borderRadius: 8, padding: '6px 10px', fontSize: '0.68rem', color: C.mid, border: `1px solid ${C.borderl}`, pointerEvents: 'none' }}>
      {[{color:'#ef4444',label:'À faire'},{color:'#3b82f6',label:'Boîté'},{color:'#22c55e',label:'Contact'},{color:'#9b9b96',label:'Autre'},{color:'#4A4A58',label:'Supprimée'}].map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} /><span>{item.label}</span>
        </div>
      ))}
    </div>
  )

  /* ── Badge DPE ──────────────────────────────────────────────────── */
  function DpeBadge({ etiquette, date }: { etiquette?: string | null; date?: string | null }) {
    if (!etiquette) return null
    const color = DPE_COLORS[etiquette.toUpperCase()] ?? C.dim
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        padding: '1px 5px', borderRadius: 4,
        fontSize: '0.67rem', fontWeight: 700,
        background: color + '22', color, border: '1px solid ' + color + '44',
        flexShrink: 0,
      }}>
        {etiquette.toUpperCase()}{date ? ` ${formatMoisAnnee(date)}` : ''}
      </span>
    )
  }

  /* ══════════════════════════════════════════════════════════════════
   * ── EN COURS DESKTOP
   * ══════════════════════════════════════════════════════════════════ */
  if (isDesktop && appState === 'en_cours') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg }}>
        {sessionHeader}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: 360, display: 'flex', flexDirection: 'column', background: C.card, borderRight: `1px solid ${C.border}`, overflow: 'hidden', flexShrink: 0 }}>
            {sheetOpen && selectedAdresse ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => { setSheetOpen(false); setSelectedAdresse(null) }} style={{ background: 'none', border: 'none', fontSize: 18, color: C.mid, cursor: 'pointer', padding: 0, marginTop: 2 }}>←</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{[selectedAdresse.numero, selectedAdresse.nom_voie].filter(Boolean).join(' ') || 'Adresse'}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{selectedAdresse.code_postal} {selectedAdresse.commune}</div>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <BottomSheet open={true} inline={true} adresse={selectedAdresse} sessionId={session?.id ?? ''} onClose={() => { setSheetOpen(false); setSelectedAdresse(null) }} onQualification={handleQualification} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['all','a_faire','contact','boite','supprimee'] as const).map(f => (
                      <button key={f} onClick={() => setAdresseFilter(f)}
                        style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: adresseFilter===f ? C.primary : 'rgba(255,255,255,0.06)', color: adresseFilter===f ? '#fff' : C.mid, border: adresseFilter===f ? 'none' : `1px solid ${C.border}` }}>
                        {f === 'all' ? `Toutes (${adresses.length})` : `${STATUT_LABEL[f]} (${adresses.filter(a=>a.statut_carte===f).length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {isHorsZone && adresses.length === 0 ? (
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, textAlign:'center', color: C.muted }}>
                      <div style={{ fontSize:'3rem', marginBottom:12 }}>🚶</div>
                      <div style={{ fontWeight:600, fontSize:'0.9rem', color: C.text, marginBottom:6 }}>Mode libre</div>
                      <div style={{ fontSize:'0.82rem', lineHeight:1.6 }}>Prospection sans itinéraire pré-défini.<br/>Les adresses de la commune sont chargées sur la carte.</div>
                    </div>
                  ) : adressesFiltrees.map(a => {
                    const isProchaine = a.id === prochaineAdresseId
                    return (
                      <div key={a.id} onClick={() => handleAdresseClick(a)}
                        style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: isProchaine ? 'rgba(29,158,117,0.08)' : 'transparent', borderLeft: `3px solid ${isProchaine ? C.primary : STATUT_COLOR[a.statut_carte] ?? C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUT_COLOR[a.statut_carte], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[a.numero, a.nom_voie].filter(Boolean).join(' ')}
                            </div>
                            <div style={{ fontSize: 11, color: C.muted, display: 'flex', gap: 6, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span>{STATUT_LABEL[a.statut_carte]}</span>
                              {a.type_habitat && <span>· {a.type_habitat === 'individuel' ? '🏠' : a.type_habitat === 'collectif' ? '🏢' : '🏪'}</span>}
                              {DpeBadge({ etiquette: a.dpe_etiquette, date: a.latest_dpe_date })}
                              {isProchaine && <span style={{ color: C.success, fontWeight: 700 }}>← Suivante</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, color: C.muted }}>›</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TerrainMap adresses={adresses} zonePolygon={null} prochaineAdresseId={prochaineAdresseId} onAdresseClick={handleAdresseClick} />
            {legendeMap}
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════
   * ── EN COURS MOBILE
   * ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg }}>
      {sessionHeader}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <TerrainMap adresses={adresses} zonePolygon={null} prochaineAdresseId={prochaineAdresseId} onAdresseClick={handleAdresseClick} />
        {!sheetOpen && legendeMap}
        {isHorsZone && !sheetOpen && (
          <div style={{ position: 'absolute', bottom: 16, right: 12, background: 'rgba(12,12,14,0.92)', borderRadius: 8, padding: '8px 12px', fontSize: '0.75rem', color: C.text, border: `1px solid ${C.borderl}`, fontWeight: 600 }}>
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
