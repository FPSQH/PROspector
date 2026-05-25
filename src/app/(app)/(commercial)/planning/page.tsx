'use client'

import { useEffect, useState, useCallback } from 'react'

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
  gold:    '#D97706',
  danger:  '#EF4444',
  info:    '#3B82F6',
}

const INP: React.CSSProperties = {
  width: '100%', padding: '5px 7px', borderRadius: 6,
  border: `1px solid ${C.borderl}`, fontSize: 13,
  background: 'rgba(255,255,255,0.05)', color: C.text,
  outline: 'none', boxSizing: 'border-box',
}

const STATUT = {
  planifiee:    { label: 'Planifiée',    color: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)'  },
  realisee:     { label: 'Réalisée',     color: '#4ADE80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)'   },
  annulee:      { label: 'Annulée',      color: '#6B6B7B', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)' },
  non_realisee: { label: 'Non réalisée', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)'  },
} as const

const MOIS    = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_C = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function addMin(t: string | undefined, m: number): string {
  if (!t) return ''
  const [h, mn] = t.split(':').map(Number)
  const tot = h * 60 + mn + m
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
}
function fmtDate(s: string | undefined): string {
  if (!s) return ''
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

interface Zone { id: string; nom: string; couleur: string; numero: number }

interface RapportJson {
  nb_visites?: number; nb_contacts?: number; nb_flyers?: number
  nb_maisons?: number; nb_immeubles?: number; nb_syndics?: number
}

interface SessionData {
  rapport_json?: RapportJson | null
  commune_nom?: string | null; heure_debut?: string | null; heure_fin?: string | null; statut?: string | null
}

interface Session {
  id: string; date_prevue: string; heure_debut: string; heure_fin: string
  statut: string; zone_id: string; notes?: string
  nb_adresses_total: number; nb_adresses_visitees: number; nb_contacts: number
  nb_maisons_qualifiees?: number; nb_immeubles_qualifies?: number
  nb_syndics_qualifies?: number; nb_adresses_supprimees?: number
  zones_prospection?: Zone | null; session_data?: SessionData | null
}

interface SessionLibre {
  id: string; date_session: string; commune_nom?: string; commune_code_insee?: string
  rapport_json?: RapportJson; statut: string; heure_debut?: string; heure_fin?: string
  zone_id?: string; type_session?: string
}

interface Cfg {
  jours_semaine: number[]; heure_debut: string; duree_minutes: number
  date_debut: string | null; heure_debut_2: string | null; jours_semaine_2: number[]
}

interface Kpis {
  nbPlanifiees: number; nbRealisees: number; nbAnnulees: number
  totalAdresses: number; visitees: number; totalContacts: number; pctRealise: number
}

interface Relance {
  id: string; nom?: string; prenom?: string; tel1?: string; tel2?: string; email1?: string
  type_contact?: string; notes?: string; date_relance: string
  statut_pipeline?: string; horizon_vente?: string
  adresses?: { id: string; numero?: string; nom_voie?: string; code_postal?: string; commune?: string }
}
interface DayData { planned: Session[]; free: SessionLibre[]; relances: Relance[] }

const CFG_DEFAUT: Cfg = {
  jours_semaine: [2, 3, 5], heure_debut: '10:00', duree_minutes: 120,
  date_debut: null, heure_debut_2: null, jours_semaine_2: [],
}

function StatBox({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: accent ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (accent ? 'rgba(29,158,117,0.3)' : C.border) }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent ? C.primary : C.text }}>{value}</div>
      <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, textTransform: 'uppercase', lineHeight: 1.2 }}>{label}</div>
    </div>
  )
}

function JoursBtnGroup({ value, onChange, accentColor = 'rgba(34,197,94,0.15)', accentText = '#4ADE80', accentBorder = 'rgba(34,197,94,0.3)' }:
  { value: number[]; onChange: (v: number[]) => void; accentColor?: string; accentText?: string; accentBorder?: string }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(j => {
        const actif = value.includes(j)
        return (
          <button key={j} onClick={() => onChange(actif ? value.filter(x => x !== j) : [...value, j].sort())}
            style={{ flex: 1, padding: '4px 0', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: actif ? accentColor : 'rgba(255,255,255,0.06)', color: actif ? accentText : C.mid, border: '1.5px solid ' + (actif ? accentBorder : C.borderl) }}>
            {JOURS_L[j].slice(0, 3)}
          </button>
        )
      })}
    </div>
  )
}

export default function PlanningPage() {
  const now   = new Date()
  const today = now.toISOString().split('T')[0]

  const [mois,           setMois]           = useState(now.getMonth() + 1)
  const [annee,          setAnnee]          = useState(now.getFullYear())
  const [sessions,       setSessions]       = useState<Session[]>([])
  const [sessionsLibres, setSessionsLibres] = useState<SessionLibre[]>([])
  const [relances,       setRelances]       = useState<Relance[]>([])
  const [zones,          setZones]          = useState<Zone[]>([])
  const [kpis,           setKpis]           = useState<Kpis | null>(null)
  const [cfg,            setCfg]            = useState<Cfg>(CFG_DEFAUT)
  const [loading,        setLoading]        = useState(true)
  const [generating,     setGenerating]     = useState(false)
  const [showCfg,        setShowCfg]        = useState(false)
  const [savingCfg,      setSavingCfg]      = useState(false)
  const [selDate,        setSelDate]        = useState<string | null>(null)
  const [reporting,      setReporting]      = useState<string | null>(null)
  const [isMobile,       setIsMobile]       = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const getZone = useCallback((zoneId: string): Zone | null => {
    return zones.find(z => z.id === zoneId) ?? null
  }, [zones])

  const load = useCallback(async (m: number, a: number) => {
    setLoading(true)
    try {
      const [pd, zd] = await Promise.all([
        fetch(`/api/planning?mois=${m}&annee=${a}`).then(r => r.json()),
        fetch('/api/zones').then(r => r.json()),
      ])
      setSessions(pd.planning ?? [])
      setSessionsLibres(pd.sessions_libres ?? [])
      setRelances(pd.relances ?? [])
      setKpis(pd.kpis ?? null)
      if (pd.config) setCfg({
        jours_semaine:   pd.config.jours_semaine   ?? [2, 3, 5],
        heure_debut:     pd.config.heure_debut      ?? '10:00',
        duree_minutes:   pd.config.duree_minutes    ?? 120,
        date_debut:      pd.config.date_debut       ?? null,
        heure_debut_2:   pd.config.heure_debut_2    ?? null,
        jours_semaine_2: pd.config.jours_semaine_2  ?? [],
      })
      setZones(zd.zones ?? [])
    } catch (err) {
      console.error('[Planning] Erreur chargement:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(mois, annee) }, [mois, annee, load])

  const patch = useCallback(async (id: string, body: object) => {
    const r = await fetch(`/api/planning/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (d.session) setSessions(s => s.map(x => x.id === id ? { ...x, ...d.session } : x))
  }, [])

  const patchZone = useCallback(async (id: string, zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId) ?? null
    setSessions(s => s.map(x => x.id === id ? { ...x, zone_id: zoneId, zones_prospection: zone } : x))
    await fetch(`/api/planning/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: zoneId }) })
  }, [zones])

  const reporter = async (sessionId: string) => {
    setReporting(sessionId)
    try {
      const r = await fetch('/api/planning/reporter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) })
      const d = await r.json()
      if (d.ok) { await load(mois, annee); setSelDate(null) }
      else alert(d.error ?? 'Erreur lors du report')
    } finally { setReporting(null) }
  }

  const generate = async () => {
    if (sessions.some(s => s.statut === 'planifiee')) {
      const nb = sessions.filter(s => s.statut === 'planifiee').length
      if (!confirm(`${nb} session${nb > 1 ? 's' : ''} planifiée${nb > 1 ? 's' : ''} exist${nb > 1 ? 'ent' : 'e'} déjà pour ${MOIS[mois]} ${annee}.\nLes supprimer et régénérer le planning ?`)) return
      await fetch(`/api/planning?mois=${mois}&annee=${annee}`, { method: 'DELETE' })
      setSessions(s => s.filter(x => x.statut !== 'planifiee'))
    }
    setGenerating(true)
    const r = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mois, annee }) })
    const d = await r.json()
    setGenerating(false)
    if (d.planning) { setSessions(d.planning); setSessionsLibres(d.sessions_libres ?? []); setKpis(d.kpis ?? null) }
    else if (d.error) alert(d.error)
  }

  const resetMois = async () => {
    if (!confirm(`Supprimer toutes les sessions planifiées de ${MOIS[mois]} ${annee} ?`)) return
    await fetch(`/api/planning?mois=${mois}&annee=${annee}`, { method: 'DELETE' })
    setSessions(s => s.filter(x => x.statut !== 'planifiee'))
    setSelDate(null)
  }

  const saveCfg = async () => {
    setSavingCfg(true)
    await fetch('/api/planning/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    setSavingCfg(false); setShowCfg(false)
  }

  const navMois = (delta: number) => {
    let m = mois + delta, a = annee
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMois(m); setAnnee(a); setSelDate(null)
  }

  const daysInMonth     = new Date(annee, mois, 0).getDate()
  const firstDayOfWeek  = new Date(annee, mois - 1, 1).getDay()
  const heureFin1       = addMin(cfg.heure_debut, cfg.duree_minutes)
  const heureFin2       = cfg.heure_debut_2 ? addMin(cfg.heure_debut_2, cfg.duree_minutes) : ''
  const nbJoursSlot1    = cfg.jours_semaine.length
  const nbJoursSlot2    = cfg.heure_debut_2 ? cfg.jours_semaine_2.length : 0
  const totalSessParSem = nbJoursSlot1 + nbJoursSlot2
  const nbZones         = zones.length
  const intervalleRetour = nbZones > 0 && totalSessParSem > 0 ? Math.ceil(nbZones / totalSessParSem) : null

  const byDate = new Map<string, DayData>()
  for (const s of sessions) {
    const d = byDate.get(s.date_prevue) ?? { planned: [], free: [], relances: [] }
    d.planned.push(s); byDate.set(s.date_prevue, d)
  }
  for (const s of sessionsLibres) {
    const d = byDate.get(s.date_session) ?? { planned: [], free: [], relances: [] }
    d.free.push(s); byDate.set(s.date_session, d)
  }
  for (const r of relances) {
    if (!r.date_relance) continue
    const d = byDate.get(r.date_relance) ?? { planned: [], free: [], relances: [] }
    d.relances = d.relances ?? []
    d.relances.push(r); byDate.set(r.date_relance, d)
  }

  const selDayData    = selDate ? (byDate.get(selDate) ?? { planned: [], free: [], relances: [] }) : null
  const totalSessJour = selDayData ? selDayData.planned.length + selDayData.free.length : 0

  const totalJour = selDayData ? (() => {
    let vis = 0, cont = 0, mais = 0, imm = 0, synd = 0, supp = 0
    for (const s of selDayData.planned) {
      const r = s.session_data?.rapport_json
      vis  += r?.nb_visites   ?? s.nb_adresses_visitees ?? 0
      cont += r?.nb_contacts  ?? s.nb_contacts          ?? 0
      mais += s.nb_maisons_qualifiees  ?? r?.nb_maisons   ?? 0
      imm  += s.nb_immeubles_qualifies ?? r?.nb_immeubles ?? 0
      synd += s.nb_syndics_qualifies   ?? r?.nb_syndics   ?? 0
      supp += s.nb_adresses_supprimees ?? 0
    }
    for (const s of selDayData.free) {
      const r = s.rapport_json
      vis  += r?.nb_visites ?? 0; cont += r?.nb_contacts  ?? 0
      mais += r?.nb_maisons ?? 0; imm  += r?.nb_immeubles ?? 0
    }
    return { vis, cont, mais, imm, synd, supp }
  })() : null

  const datesTriees = Array.from(new Set([
    ...sessions.map(s => s.date_prevue),
    ...sessionsLibres.map(s => s.date_session),
  ])).sort()

  const peutGenerer = !loading
  const peutReset   = sessions.some(s => s.statut === 'planifiee')

  /* ── Panel calendrier + liste ────────────────────────────────────── */
  const calPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.card, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={() => navMois(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.mid, padding: '2px 6px' }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15, color: C.text }}>{MOIS[mois]} {annee}</div>
        <button onClick={() => navMois(1)}  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.mid, padding: '2px 6px' }}>›</button>
        <button onClick={() => setShowCfg(v => !v)} style={{ background: showCfg ? 'rgba(29,158,117,0.12)' : 'none', border: showCfg ? `1px solid rgba(29,158,117,0.3)` : `1px solid transparent`, cursor: 'pointer', borderRadius: 6, padding: '4px 8px', fontSize: 16, color: showCfg ? C.primary : C.mid }}>⚙</button>
      </div>

      {/* Config panel */}
      {showCfg && (
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', flexShrink: 0, overflowY: 'auto', maxHeight: '65vh' }}>
          <div style={{ fontSize: 11, color: C.primary, fontWeight: 700, marginBottom: 8 }}>CRÉNEAU 1</div>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 5 }}>JOURS</div>
          <div style={{ marginBottom: 10 }}>
            <JoursBtnGroup value={cfg.jours_semaine} onChange={v => setCfg(c => ({ ...c, jours_semaine: v }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>HEURE DÉBUT</div>
              <input type="time" value={cfg.heure_debut} onChange={e => setCfg(c => ({ ...c, heure_debut: e.target.value }))} style={INP} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>DURÉE (min)</div>
              <input type="number" value={cfg.duree_minutes} min={30} max={480} step={30} onChange={e => setCfg(c => ({ ...c, duree_minutes: parseInt(e.target.value) || 120 }))} style={INP} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>{cfg.heure_debut} – {heureFin1}</div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: cfg.heure_debut_2 ? '#60A5FA' : C.dim }}>CRÉNEAU 2 (OPTIONNEL)</div>
              <button onClick={() => setCfg(c => ({ ...c, heure_debut_2: c.heure_debut_2 ? null : '14:00', jours_semaine_2: c.heure_debut_2 ? [] : [...c.jours_semaine] }))}
                style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: cfg.heure_debut_2 ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: cfg.heure_debut_2 ? '#F87171' : '#60A5FA', border: '1px solid ' + (cfg.heure_debut_2 ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)') }}>
                {cfg.heure_debut_2 ? '✕ Désactiver' : '+ Activer'}
              </button>
            </div>
            {cfg.heure_debut_2 && (
              <>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 5 }}>JOURS DU CRÉNEAU 2</div>
                <div style={{ marginBottom: 10 }}>
                  <JoursBtnGroup value={cfg.jours_semaine_2} onChange={v => setCfg(c => ({ ...c, jours_semaine_2: v }))} accentColor="rgba(59,130,246,0.15)" accentText="#60A5FA" accentBorder="rgba(59,130,246,0.3)" />
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>HEURE DÉBUT CRÉNEAU 2</div>
                <input type="time" value={cfg.heure_debut_2} onChange={e => setCfg(c => ({ ...c, heure_debut_2: e.target.value }))} style={{ ...INP, border: '1px solid rgba(59,130,246,0.3)', marginBottom: 4 }} />
                <div style={{ fontSize: 11, color: '#60A5FA', marginBottom: 2 }}>{cfg.heure_debut_2} – {heureFin2}</div>
              </>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>DATE DE DÉBUT DE GÉNÉRATION</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <input type="date" value={cfg.date_debut ?? today} min={today} onChange={e => setCfg(c => ({ ...c, date_debut: e.target.value || null }))} style={INP} />
              {cfg.date_debut && <button onClick={() => setCfg(c => ({ ...c, date_debut: null }))} style={{ padding: '5px 8px', borderRadius: 6, fontSize: 10, background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1px solid ${C.border}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>1er du mois</button>}
            </div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>Jamais dans le passé</div>
          </div>

          {intervalleRetour !== null && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>📅 Retour par zone : toutes les {intervalleRetour} semaine{intervalleRetour > 1 ? 's' : ''}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                {nbZones} zone{nbZones > 1 ? 's' : ''} · {totalSessParSem} séance{totalSessParSem > 1 ? 's' : ''}/sem
                {cfg.heure_debut_2 && ` (C1×${nbJoursSlot1} + C2×${nbJoursSlot2})`}
              </div>
            </div>
          )}
          <button onClick={saveCfg} disabled={savingCfg} style={{ width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: savingCfg ? C.dim : C.primary, color: '#fff', border: 'none', cursor: savingCfg ? 'not-allowed' : 'pointer' }}>
            {savingCfg ? 'Sauvegarde...' : '✓ Sauvegarder'}
          </button>
        </div>
      )}

      {/* KPIs */}
      {kpis && (sessions.length > 0 || sessionsLibres.length > 0) && (
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          {([
            ['Planif.', kpis.nbPlanifiees, '#60A5FA', 'rgba(59,130,246,0.12)'],
            ['Réal.',   kpis.nbRealisees,  '#4ADE80', 'rgba(34,197,94,0.12)'],
            ['Annul.',  kpis.nbAnnulees,   '#6B6B7B', 'rgba(255,255,255,0.06)'],
          ] as [string,number,string,string][]).map(([l,n,color,bg]) => (
            <span key={l} style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: bg, color }}>{n} {l}</span>
          ))}
          {sessionsLibres.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>{sessionsLibres.length} libre{sessionsLibres.length > 1 ? 's' : ''}</span>}
          <div style={{ flex: 1 }} />
          {peutReset && <button onClick={resetMois} style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1px solid ${C.border}`, cursor: 'pointer' }}>🗑 Reset</button>}
        </div>
      )}

      {/* Légende */}
      {sessionsLibres.length > 0 && (
        <div style={{ padding: '5px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: C.mid }} /> Planifiée</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B' }} /> Prospection libre</div>
        </div>
      )}

      {/* Calendrier */}
      <div style={{ padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
          {JOURS_C.map(j => <div key={j} style={{ textAlign: 'center', fontSize: 10, color: C.muted, fontWeight: 600 }}>{j}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={'e' + i} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1
            const ds  = `${annee}-${String(mois).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayData = byDate.get(ds)
            const hasAny  = dayData && (dayData.planned.length > 0 || dayData.free.length > 0 || (dayData.relances?.length ?? 0) > 0)
            const isTod   = ds === today; const isSel = selDate === ds
            const mainCol = dayData?.planned[0]?.zones_prospection?.couleur ?? C.primary
            return (
              <div key={day} onClick={() => hasAny && setSelDate(ds === selDate ? null : ds)}
                style={{ borderRadius: 5, padding: '3px 2px', minHeight: 34, textAlign: 'center', background: isSel ? mainCol + '22' : isTod ? 'rgba(34,197,94,0.07)' : 'transparent', border: isSel ? '2px solid ' + mainCol : isTod ? '1px solid rgba(34,197,94,0.25)' : `1px solid transparent`, cursor: hasAny ? 'pointer' : 'default' }}>
                <div style={{ fontSize: 11, fontWeight: isTod ? 700 : 400, color: isTod ? C.success : C.text }}>{day}</div>
                {hasAny && dayData && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                    {dayData.planned.map((p, idx) => <div key={idx} style={{ width: 6, height: 6, borderRadius: '50%', background: p.zones_prospection?.couleur ?? C.mid, opacity: ['annulee','non_realisee'].includes(p.statut) ? 0.3 : 1 }} />)}
                    {dayData.free.map((_, idx) => <div key={'f'+idx} style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />)}
                    {(dayData.relances?.length ?? 0) > 0 && <span style={{ fontSize: 8, lineHeight: 1 }}>📞</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bouton générer */}
      {peutGenerer && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, textAlign: 'center', flexShrink: 0 }}>
          <button onClick={generate} disabled={generating} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: generating ? C.dim : peutReset ? C.gold : C.primary, color: '#fff', border: 'none', cursor: generating ? 'not-allowed' : 'pointer' }}>
            {generating ? 'Génération...' : peutReset ? `↺ Régénérer ${MOIS[mois]}` : `✦ Générer ${MOIS[mois]}`}
          </button>
        </div>
      )}

      {/* Liste journées */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: `1px solid ${C.border}` }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Chargement...</div>
        ) : datesTriees.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Aucune session ce mois</div>
          </div>
        ) : datesTriees.map(date => {
          const dayData = byDate.get(date)!
          const isSel   = selDate === date
          const z1      = dayData.planned[0]?.zone_id ? getZone(dayData.planned[0].zone_id) : null
          const hasUpcoming = dayData.planned.some(p => p.statut === 'planifiee' && p.date_prevue >= today)
          const nextPlan = dayData.planned.find(p => p.statut === 'planifiee' && p.date_prevue >= today)
          return (
            <div key={date} onClick={() => setSelDate(date === selDate ? null : date)}
              style={{ padding: '8px 13px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, background: isSel ? 'rgba(255,255,255,0.04)' : 'transparent', borderLeft: isSel ? '3px solid ' + (z1?.couleur ?? C.primary) : '3px solid transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {dayData.planned.map((p, idx) => {
                    const zz = getZone(p.zone_id) ?? p.zones_prospection
                    return <div key={idx} style={{ width: 8, height: 8, borderRadius: '50%', background: zz?.couleur ?? C.mid, opacity: ['annulee','non_realisee'].includes(p.statut) ? 0.3 : 1 }} />
                  })}
                  {dayData.free.map((_, idx) => <div key={'f'+idx} style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'capitalize', color: C.text }}>{fmtDate(date)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {dayData.planned.length > 0 && dayData.planned.map(p => {
                      const zz = getZone(p.zone_id) ?? p.zones_prospection
                      return zz ? `Z${zz.numero} — ${zz.nom}` : '?'
                    }).join(' · ')}
                    {dayData.planned.length > 0 && dayData.free.length > 0 && ' · '}
                    {dayData.free.length > 0 && <span style={{ color: '#F59E0B' }}>{dayData.free.length} libre{dayData.free.length > 1 ? 's' : ''}</span>}
                  </div>
                </div>
                {hasUpcoming && nextPlan && (
                  <a href={`/terrain?zone_id=${nextPlan.zone_id}&autostart=1`} onClick={e => e.stopPropagation()} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: C.primary, color: '#fff', textDecoration: 'none', flexShrink: 0 }}>Go→</a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  /* ── Panel détail journée ────────────────────────────────────────── */
  const detailPanel = selDate && selDayData ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.card, overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => setSelDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.mid, padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize', color: C.text }}>{fmtDate(selDate)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {totalSessJour} session{totalSessJour > 1 ? 's' : ''}
            {selDayData.free.length > 0 && <span style={{ color: '#F59E0B', marginLeft: 4 }}>· {selDayData.free.length} libre{selDayData.free.length > 1 ? 's' : ''}</span>}
          </div>
        </div>
        {(() => {
          const nextSess = selDayData.planned.find(p => p.statut === 'planifiee' && p.date_prevue >= today)
          return nextSess ? (
            <a href={`/terrain?zone_id=${nextSess.zone_id}&autostart=1`} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: C.primary, color: '#fff', textDecoration: 'none' }}>Démarrer →</a>
          ) : null
        })()}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

        {/* Relances contacts */}
        {(selDayData.relances?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              📞 Relance{(selDayData.relances?.length ?? 0) > 1 ? 's' : ''} contact
            </div>
            {selDayData.relances?.map(r => {
              const typeLabels: Record<string, string> = {
                'interet_vente': 'Intérêt vente', 'projet_moyen': 'Projet moyen terme',
                'projet_long': 'Projet long terme', 'voisin_relais': 'Voisin relais',
                'recommandation': 'Recommandation', 'commercant': 'Commerçant', 'autre': 'Autre',
              }
              const horizonLabels: Record<string, string> = {
                'moins_6_mois': '< 6 mois', '6_12_mois': '6–12 mois',
                '1_2_ans': '1–2 ans', 'plus_2_ans': '> 2 ans',
              }
              const adr = r.adresses
              const adrStr = adr ? [adr.numero, adr.nom_voie, adr.code_postal, adr.commune].filter(Boolean).join(' ') : ''
              const nomStr = [r.prenom, r.nom].filter(Boolean).join(' ') || 'Contact sans nom'
              const mailBody = [
                'Contact : ' + nomStr,
                adrStr ? 'Adresse : ' + adrStr : '',
                r.tel1 ? 'Tél : ' + r.tel1 : '',
                r.email1 ? 'Email : ' + r.email1 : '',
                r.type_contact ? 'Type : ' + (typeLabels[r.type_contact] ?? r.type_contact) : '',
                r.horizon_vente ? 'Horizon : ' + (horizonLabels[r.horizon_vente] ?? r.horizon_vente) : '',
                r.notes ? 'Notes : ' + r.notes : '',
                'Relance prévue le : ' + new Date(r.date_relance + 'T12:00:00').toLocaleDateString('fr-FR'),
              ].filter(Boolean).join('\n')
              const mailSubject = 'Relance contact Prospector pour le ' + new Date(r.date_relance + 'T12:00:00').toLocaleDateString('fr-FR')
              const mailtoHref = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
              return (
                <div key={r.id} style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(217,119,6,0.08)', border: '1.5px solid rgba(217,119,6,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>📞</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{nomStr}</div>
                      {adrStr && <div style={{ fontSize: 11, color: C.muted }}>{adrStr}</div>}
                    </div>
                    <a href={mailtoHref} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(217,119,6,0.3)', fontSize: 11, color: '#FB923C', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>✉️</a>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {r.type_contact && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>{typeLabels[r.type_contact] ?? r.type_contact}</span>}
                    {r.horizon_vente && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>{horizonLabels[r.horizon_vente] ?? r.horizon_vente}</span>}
                    {r.tel1 && <a href={`tel:${r.tel1}`} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#60A5FA', textDecoration: 'none' }}>📱 {r.tel1}</a>}
                  </div>
                  {r.notes && <div style={{ marginTop: 8, fontSize: 11, color: C.mid, fontStyle: 'italic', lineHeight: 1.4, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }}>{r.notes}</div>}
                  {r.statut_pipeline && <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>Pipeline : <strong style={{ color: C.mid }}>{r.statut_pipeline}</strong></div>}
                </div>
              )
            })}
          </div>
        )}

        {/* Sessions planifiées */}
        {selDayData.planned.map(s => {
          const z   = getZone(s.zone_id) ?? s.zones_prospection ?? null
          const st  = STATUT[s.statut as keyof typeof STATUT] ?? STATUT.planifiee
          const rap = s.session_data?.rapport_json
          const vis  = rap?.nb_visites   ?? s.nb_adresses_visitees ?? 0
          const cont = rap?.nb_contacts  ?? s.nb_contacts          ?? 0
          const mais = s.nb_maisons_qualifiees  ?? rap?.nb_maisons   ?? 0
          const imm  = s.nb_immeubles_qualifies ?? rap?.nb_immeubles ?? 0
          const synd = s.nb_syndics_qualifies   ?? rap?.nb_syndics   ?? 0
          const supp = s.nb_adresses_supprimees ?? 0
          const estPasse     = s.date_prevue < today
          const estPlanifiee = s.statut === 'planifiee'
          const estAnnulee   = s.statut === 'annulee'
          const peutDemarrer = estPlanifiee && !estPasse
          const aDesResultats = s.statut === 'realisee' || (estPasse && (vis > 0 || cont > 0))

          return (
            <div key={s.id} style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1.5px solid ' + (estAnnulee ? 'rgba(239,68,68,0.2)' : C.borderl), background: estAnnulee ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {z && <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.couleur, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{z ? `Zone ${z.numero} — ${z.nom}` : 'Zone non assignée'}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.heure_debut} – {s.heure_fin}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
              </div>

              {estAnnulee && (
                <div style={{ padding: '10px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px dashed rgba(239,68,68,0.25)', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#F87171', fontWeight: 600, marginBottom: 8 }}>Session annulée — que faire ?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => reporter(s.id)} disabled={reporting === s.id}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: reporting === s.id ? 'not-allowed' : 'pointer', background: reporting === s.id ? C.dim : C.primary, color: '#fff', border: 'none' }}>
                      {reporting === s.id ? '⏳ Report...' : '📅 Reporter la session'}
                    </button>
                    <button onClick={() => patch(s.id, { statut: 'non_realisee' })}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1px solid ${C.border}` }}>
                      Ne pas reporter
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>Reporter décale toutes les sessions planifiées suivantes d&apos;un créneau</div>
                </div>
              )}

              {peutDemarrer && (
                <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                  {(['annulee', 'non_realisee'] as const).map(k => (
                    <button key={k} onClick={() => patch(s.id, { statut: k })}
                      style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: C.mid, border: `1.5px solid ${C.border}` }}>
                      → {STATUT[k].label}
                    </button>
                  ))}
                </div>
              )}

              {estPlanifiee && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>ZONE</div>
                  <select value={s.zone_id} onChange={e => patchZone(s.id, e.target.value)} style={{ ...INP, padding: '5px 8px', fontSize: 12 }}>
                    {zones.map(zz => <option key={zz.id} value={zz.id}>Zone {zz.numero} — {zz.nom}</option>)}
                  </select>
                </div>
              )}

              {aDesResultats && (
                <>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 6 }}>RÉSULTATS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginBottom: 4 }}>
                    <StatBox label="Visites"    value={vis}  accent />
                    <StatBox label="Contacts"   value={cont} />
                    <StatBox label="Supprimées" value={supp} />
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4, marginTop: 6 }}>QUALIFICATIONS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                    <StatBox label="Maisons"   value={mais} />
                    <StatBox label="Collectif" value={imm}  />
                    <StatBox label="Syndics"   value={synd} />
                  </div>
                </>
              )}

              {peutDemarrer && (
                <a href={`/terrain?zone_id=${s.zone_id}&autostart=1`} style={{ display: 'block', textAlign: 'center', marginTop: 10, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: C.primary, color: '#fff', textDecoration: 'none' }}>
                  Démarrer →
                </a>
              )}

              <a href={`/api/ics?session_id=${s.id}`} target="_blank" style={{ display: 'block', textAlign: 'center', marginTop: 6, padding: '5px', borderRadius: 7, fontSize: 11, color: C.muted, textDecoration: 'none', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
                📅 Exporter ICS
              </a>
            </div>
          )
        })}

        {/* Sessions libres */}
        {selDayData.free.map(s => {
          const rap  = s.rapport_json
          const vis  = rap?.nb_visites ?? 0; const cont = rap?.nb_contacts ?? 0
          const mais = rap?.nb_maisons ?? 0; const imm  = rap?.nb_immeubles ?? 0
          return (
            <div key={s.id} style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1.5px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Prospection libre{s.commune_nom ? ` — ${s.commune_nom}` : ''}</div>
                  {s.heure_debut && <div style={{ fontSize: 11, color: C.muted }}>{s.heure_debut}{s.heure_fin ? ` – ${s.heure_fin}` : ''}</div>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>Libre</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 6 }}>RÉSULTATS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginBottom: 4 }}>
                <StatBox label="Visites"  value={vis}  accent />
                <StatBox label="Contacts" value={cont} />
                <StatBox label="Maisons"  value={mais} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 4 }}>
                <StatBox label="Collectif" value={imm} />
                <StatBox label="Syndics"   value={rap?.nb_syndics ?? 0} />
              </div>
            </div>
          )
        })}

        {/* Total journée */}
        {totalSessJour > 1 && totalJour && (
          <div style={{ padding: 12, borderRadius: 10, border: '2px solid rgba(29,158,117,0.35)', background: 'rgba(29,158,117,0.08)' }}>
            <div style={{ fontSize: 11, color: C.success, fontWeight: 700, marginBottom: 8 }}>TOTAL JOURNÉE · {totalSessJour} sessions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginBottom: 4 }}>
              <StatBox label="Visites"    value={totalJour.vis}  accent />
              <StatBox label="Contacts"   value={totalJour.cont} />
              <StatBox label="Supprimées" value={totalJour.supp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
              <StatBox label="Maisons"   value={totalJour.mais} />
              <StatBox label="Collectif" value={totalJour.imm}  />
              <StatBox label="Syndics"   value={totalJour.synd} />
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null

  /* ── Render mobile : une seule colonne à la fois ─────────────────── */
  if (isMobile) {
    return (
      <div style={{ height: '100dvh', overflow: 'hidden', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        {selDate && detailPanel ? detailPanel : calPanel}
      </div>
    )
  }

  /* ── Render desktop : split ──────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', height: '100dvh', background: C.bg, overflow: 'hidden', gap: 1 }}>
      <div style={{ width: selDate ? 340 : '100%', maxWidth: selDate ? 340 : 520, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {calPanel}
      </div>
      {selDate && detailPanel && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {detailPanel}
        </div>
      )}
    </div>
  )
}
