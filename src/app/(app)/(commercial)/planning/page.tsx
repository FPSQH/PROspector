'use client'

import { useEffect, useState, useCallback } from 'react'

const STATUT = {
  planifiee:    { label: 'Planifiée',    color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  realisee:     { label: 'Réalisée',     color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  annulee:      { label: 'Annulée',      color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb' },
  non_realisee: { label: 'Non réalisée', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
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
  commune_nom?: string | null
  heure_debut?: string | null
  heure_fin?: string | null
  statut?: string | null
}

interface Session {
  id: string; date_prevue: string; heure_debut: string; heure_fin: string
  statut: string; zone_id: string; notes?: string
  nb_adresses_total: number; nb_adresses_visitees: number; nb_contacts: number
  zones_prospection?: Zone | null
  session_data?: SessionData | null
}

interface SessionLibre {
  id: string; date_session: string; commune_nom?: string; commune_code_insee?: string
  rapport_json?: RapportJson; statut: string; heure_debut?: string; heure_fin?: string
}

interface Cfg {
  jours_semaine: number[]; heure_debut: string; duree_minutes: number
  date_debut: string | null; heure_debut_2: string | null; jours_semaine_2: number[]
}

interface Kpis {
  nbPlanifiees: number; nbRealisees: number; nbAnnulees: number
  totalAdresses: number; visitees: number; totalContacts: number; pctRealise: number
}

interface DayData { planned: Session[]; free: SessionLibre[] }

const CFG_DEFAUT: Cfg = {
  jours_semaine: [2, 3, 5], heure_debut: '10:00', duree_minutes: 120,
  date_debut: null, heure_debut_2: null, jours_semaine_2: [],
}

function StatBox({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      textAlign: 'center', padding: '6px 4px', borderRadius: 6,
      background: accent ? '#f0fdf4' : '#F8F7F4',
      border: '1px solid ' + (accent ? '#bbf7d0' : '#E8E6DF'),
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent ? '#1D9E75' : '#374151' }}>{value}</div>
      <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', lineHeight: 1.2 }}>{label}</div>
    </div>
  )
}

function JoursBtnGroup({
  value, onChange, accentColor = '#d1fae5', accentText = '#065f46', accentBorder = '#6ee7b7',
}: {
  value: number[]; onChange: (v: number[]) => void
  accentColor?: string; accentText?: string; accentBorder?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(j => {
        const actif = value.includes(j)
        return (
          <button key={j}
            onClick={() => onChange(actif ? value.filter(x => x !== j) : [...value, j].sort())}
            style={{
              flex: 1, padding: '4px 0', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: actif ? accentColor : '#f3f4f6',
              color:      actif ? accentText  : '#6b7280',
              border: '1.5px solid ' + (actif ? accentBorder : '#e5e7eb'),
            }}>
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
  const [zones,          setZones]          = useState<Zone[]>([])
  const [kpis,           setKpis]           = useState<Kpis | null>(null)
  const [cfg,            setCfg]            = useState<Cfg>(CFG_DEFAUT)
  const [loading,        setLoading]        = useState(true)
  const [generating,     setGenerating]     = useState(false)
  const [showCfg,        setShowCfg]        = useState(false)
  const [savingCfg,      setSavingCfg]      = useState(false)
  const [selDate,        setSelDate]        = useState<string | null>(null)

  // ── Chargement ─────────────────────────────────────────────────────────────
  const load = useCallback(async (m: number, a: number) => {
    setLoading(true)
    try {
      const [pd, zd] = await Promise.all([
        fetch(`/api/planning?mois=${m}&annee=${a}`).then(r => r.json()),
        fetch('/api/zones').then(r => r.json()),
      ])
      setSessions(pd.planning ?? [])
      setSessionsLibres(pd.sessions_libres ?? [])
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

  // ── Actions ────────────────────────────────────────────────────────────────
  const patch = useCallback(async (id: string, body: object) => {
    const r = await fetch(`/api/planning/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const d = await r.json()
    if (d.session) setSessions(s => s.map(x => x.id === id ? { ...x, ...d.session } : x))
  }, [])

  const patchZone = useCallback(async (id: string, zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId) ?? null
    setSessions(s => s.map(x => x.id === id ? { ...x, zone_id: zoneId, zones_prospection: zone } : x))
    await fetch(`/api/planning/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: zoneId }),
    })
  }, [zones])

  const generate = async () => {
    setGenerating(true)
    const r = await fetch('/api/planning', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mois, annee }),
    })
    const d = await r.json()
    setGenerating(false)
    if (d.planning) {
      setSessions(d.planning)
      setSessionsLibres(d.sessions_libres ?? [])
      setKpis(d.kpis ?? null)
    } else if (d.error) alert(d.error)
  }

  const resetMois = async () => {
    if (!confirm(`Supprimer toutes les sessions planifiées de ${MOIS[mois]} ${annee} ?`)) return
    await fetch(`/api/planning?mois=${mois}&annee=${annee}`, { method: 'DELETE' })
    setSessions(s => s.filter(x => x.statut !== 'planifiee'))
    setSelDate(null)
  }

  const saveCfg = async () => {
    setSavingCfg(true)
    await fetch('/api/planning/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
    })
    setSavingCfg(false)
    setShowCfg(false)
  }

  const navMois = (delta: number) => {
    let m = mois + delta, a = annee
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMois(m); setAnnee(a); setSelDate(null)
  }

  // ── Calculs dérivés ────────────────────────────────────────────────────────
  const daysInMonth      = new Date(annee, mois, 0).getDate()
  const firstDayOfWeek   = new Date(annee, mois - 1, 1).getDay()
  const heureFin1        = addMin(cfg.heure_debut, cfg.duree_minutes)
  const heureFin2        = cfg.heure_debut_2 ? addMin(cfg.heure_debut_2, cfg.duree_minutes) : ''
  const nbJoursSlot1     = cfg.jours_semaine.length
  const nbJoursSlot2     = cfg.heure_debut_2 ? cfg.jours_semaine_2.length : 0
  const totalSessParSem  = nbJoursSlot1 + nbJoursSlot2
  const nbZones          = zones.length
  const intervalleRetour = nbZones > 0 && totalSessParSem > 0 ? Math.ceil(nbZones / totalSessParSem) : null

  const byDate = new Map<string, DayData>()
  for (const s of sessions) {
    const d = byDate.get(s.date_prevue) ?? { planned: [], free: [] }
    d.planned.push(s); byDate.set(s.date_prevue, d)
  }
  for (const s of sessionsLibres) {
    const d = byDate.get(s.date_session) ?? { planned: [], free: [] }
    d.free.push(s); byDate.set(s.date_session, d)
  }

  const selDayData    = selDate ? (byDate.get(selDate) ?? { planned: [], free: [] }) : null
  const totalSessJour = selDayData ? selDayData.planned.length + selDayData.free.length : 0

  const totalJour = selDayData ? (() => {
    let vis = 0, cont = 0, mais = 0, imm = 0, synd = 0
    for (const s of selDayData.planned) {
      const r = s.session_data?.rapport_json
      vis  += r?.nb_visites   ?? s.nb_adresses_visitees ?? 0
      cont += r?.nb_contacts  ?? s.nb_contacts          ?? 0
      mais += r?.nb_maisons   ?? 0
      imm  += r?.nb_immeubles ?? 0
      synd += r?.nb_syndics   ?? 0
    }
    for (const s of selDayData.free) {
      const r = s.rapport_json
      vis  += r?.nb_visites   ?? 0; cont += r?.nb_contacts  ?? 0
      mais += r?.nb_maisons   ?? 0; imm  += r?.nb_immeubles ?? 0; synd += r?.nb_syndics ?? 0
    }
    return { vis, cont, mais, imm, synd }
  })() : null

  const datesTriees = Array.from(new Set([
    ...sessions.map(s => s.date_prevue),
    ...sessionsLibres.map(s => s.date_session),
  ])).sort()

  // ── Conditions boutons clés ────────────────────────────────────────────────
  // ✅ CORRECTION : affiche le bouton générer dès qu'il n'y a plus de sessions PLANIFIÉES
  const peutGenerer = !loading && !sessions.some(s => s.statut === 'planifiee')
  // ✅ CORRECTION : affiche le reset dès qu'il y a des sessions planifiées
  const peutReset   = sessions.some(s => s.statut === 'planifiee')

  return (
    <div style={{ display: 'flex', height: '100%', background: '#F8F7F4', overflow: 'hidden' }}>

      {/* ══ Colonne gauche ══ */}
      <div style={{
        width: selDate ? 340 : '100%', maxWidth: selDate ? 340 : 520, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #E8E6DF', background: '#fff', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '13px 16px', borderBottom: '1px solid #E8E6DF', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => navMois(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '2px 6px' }}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{MOIS[mois]} {annee}</div>
          <button onClick={() => navMois(1)}  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '2px 6px' }}>›</button>
          <button onClick={() => setShowCfg(v => !v)} style={{
            background: showCfg ? '#f0fdf4' : 'none',
            border: showCfg ? '1px solid #bbf7d0' : '1px solid transparent',
            cursor: 'pointer', borderRadius: 6, padding: '4px 8px', fontSize: 16,
            color: showCfg ? '#1D9E75' : '#6b7280',
          }}>⚙</button>
        </div>

        {/* ── Config panel ── */}
        {showCfg && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E8E6DF', background: '#f8fffe', flexShrink: 0, overflowY: 'auto', maxHeight: '65vh' }}>

            <div style={{ fontSize: 11, color: '#1D9E75', fontWeight: 700, marginBottom: 8 }}>CRÉNEAU 1</div>

            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 5 }}>JOURS</div>
            <div style={{ marginBottom: 10 }}>
              <JoursBtnGroup value={cfg.jours_semaine} onChange={v => setCfg(c => ({ ...c, jours_semaine: v }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>HEURE DÉBUT</div>
                <input type="time" value={cfg.heure_debut}
                  onChange={e => setCfg(c => ({ ...c, heure_debut: e.target.value }))}
                  style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 13 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>DURÉE (min)</div>
                <input type="number" value={cfg.duree_minutes} min={30} max={480} step={30}
                  onChange={e => setCfg(c => ({ ...c, duree_minutes: parseInt(e.target.value) || 120 }))}
                  style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 13 }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>{cfg.heure_debut} – {heureFin1}</div>

            {/* Créneau 2 */}
            <div style={{ borderTop: '1px solid #E8E6DF', paddingTop: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: cfg.heure_debut_2 ? '#0369a1' : '#9ca3af' }}>
                  CRÉNEAU 2 (OPTIONNEL)
                </div>
                <button
                  onClick={() => setCfg(c => ({
                    ...c,
                    heure_debut_2:   c.heure_debut_2 ? null : '14:00',
                    jours_semaine_2: c.heure_debut_2 ? [] : [...c.jours_semaine],
                  }))}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: cfg.heure_debut_2 ? '#fef2f2' : '#e0f2fe',
                    color:      cfg.heure_debut_2 ? '#dc2626' : '#0369a1',
                    border: '1px solid ' + (cfg.heure_debut_2 ? '#fca5a5' : '#bae6fd'),
                  }}>
                  {cfg.heure_debut_2 ? '✕ Désactiver' : '+ Activer'}
                </button>
              </div>

              {cfg.heure_debut_2 && (
                <>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 5 }}>JOURS DU CRÉNEAU 2</div>
                  <div style={{ marginBottom: 10 }}>
                    <JoursBtnGroup
                      value={cfg.jours_semaine_2}
                      onChange={v => setCfg(c => ({ ...c, jours_semaine_2: v }))}
                      accentColor="#dbeafe" accentText="#1e40af" accentBorder="#93c5fd"
                    />
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>HEURE DÉBUT CRÉNEAU 2</div>
                  <input type="time" value={cfg.heure_debut_2}
                    onChange={e => setCfg(c => ({ ...c, heure_debut_2: e.target.value }))}
                    style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 13, marginBottom: 4 }} />
                  <div style={{ fontSize: 11, color: '#0369a1', marginBottom: 2 }}>{cfg.heure_debut_2} – {heureFin2}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Même durée que le créneau 1 · rotation zones continue</div>
                </>
              )}
            </div>

            {/* Date de début */}
            <div style={{ borderTop: '1px solid #E8E6DF', paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 3 }}>DATE DE DÉBUT DE GÉNÉRATION</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <input type="date" value={cfg.date_debut ?? today} min={today}
                  onChange={e => setCfg(c => ({ ...c, date_debut: e.target.value || null }))}
                  style={{ flex: 1, padding: '5px 7px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 13 }} />
                {cfg.date_debut && (
                  <button onClick={() => setCfg(c => ({ ...c, date_debut: null }))}
                    style={{ padding: '5px 8px', borderRadius: 6, fontSize: 10, background: '#f3f4f6', color: '#9ca3af', border: '1px solid #E8E6DF', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    1er du mois
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Jamais dans le passé</div>
            </div>

            {/* Intervalle calculé */}
            {intervalleRetour !== null && (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                  📅 Retour par zone : toutes les {intervalleRetour} semaine{intervalleRetour > 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                  {nbZones} zone{nbZones > 1 ? 's' : ''} · {totalSessParSem} séance{totalSessParSem > 1 ? 's' : ''}/sem
                  {cfg.heure_debut_2 && ` (C1×${nbJoursSlot1} + C2×${nbJoursSlot2})`}
                </div>
              </div>
            )}

            <button onClick={saveCfg} disabled={savingCfg} style={{
              width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: savingCfg ? '#E8E6DF' : '#1D9E75', color: '#fff', border: 'none', cursor: savingCfg ? 'not-allowed' : 'pointer',
            }}>
              {savingCfg ? 'Sauvegarde...' : '✓ Sauvegarder'}
            </button>
          </div>
        )}

        {/* KPIs */}
        {kpis && (sessions.length > 0 || sessionsLibres.length > 0) && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #E8E6DF', display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            {([
              ['Planif.', kpis.nbPlanifiees, '#0369a1', '#e0f2fe'],
              ['Réal.',   kpis.nbRealisees,  '#065f46', '#d1fae5'],
              ['Annul.',  kpis.nbAnnulees,   '#9ca3af', '#f3f4f6'],
            ] as [string,number,string,string][]).map(([l,n,c,b]) => (
              <span key={l} style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: b, color: c }}>{n} {l}</span>
            ))}
            {sessionsLibres.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>
                {sessionsLibres.length} libre{sessionsLibres.length > 1 ? 's' : ''}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {/* ✅ CORRECTION : visible dès qu'il y a des sessions planifiées */}
            {peutReset && (
              <button onClick={resetMois}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: '#fff', color: '#9ca3af', border: '1px solid #E8E6DF', cursor: 'pointer' }}>
                🗑 Reset
              </button>
            )}
          </div>
        )}

        {/* Légende */}
        {sessionsLibres.length > 0 && (
          <div style={{ padding: '5px 14px', borderBottom: '1px solid #F0EDE6', display: 'flex', gap: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b7280' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#9ca3af' }} /> Planifiée
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b7280' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B' }} /> Prospection libre
            </div>
          </div>
        )}

        {/* Calendrier */}
        <div style={{ padding: '10px 12px', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
            {JOURS_C.map(j => <div key={j} style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{j}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={'e' + i} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day     = i + 1
              const ds      = `${annee}-${String(mois).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayData = byDate.get(ds)
              const hasAny  = dayData && (dayData.planned.length > 0 || dayData.free.length > 0)
              const isTod   = ds === today
              const isSel   = selDate === ds
              const mainCol = dayData?.planned[0]?.zones_prospection?.couleur ?? '#9ca3af'
              return (
                <div key={day} onClick={() => hasAny && setSelDate(ds === selDate ? null : ds)}
                  style={{
                    borderRadius: 5, padding: '3px 2px', minHeight: 34, textAlign: 'center',
                    background: isSel ? mainCol + '22' : isTod ? '#f0fdf4' : 'transparent',
                    border: isSel ? '2px solid ' + mainCol : isTod ? '1px solid #bbf7d0' : '1px solid transparent',
                    cursor: hasAny ? 'pointer' : 'default',
                  }}>
                  <div style={{ fontSize: 11, fontWeight: isTod ? 700 : 400, color: isTod ? '#1D9E75' : '#374151' }}>{day}</div>
                  {hasAny && dayData && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                      {dayData.planned.map((p, idx) => (
                        <div key={idx} style={{ width: 6, height: 6, borderRadius: '50%', background: p.zones_prospection?.couleur ?? '#9ca3af', opacity: ['annulee','non_realisee'].includes(p.statut) ? 0.3 : 1 }} />
                      ))}
                      {dayData.free.map((_, idx) => (
                        <div key={'f'+idx} style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ✅ CORRECTION : bouton générer visible dès qu'il n'y a plus de sessions planifiées */}
        {peutGenerer && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid #E8E6DF', textAlign: 'center', flexShrink: 0 }}>
            <button onClick={generate} disabled={generating} style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: generating ? '#E8E6DF' : '#1D9E75', color: '#fff', border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
            }}>
              {generating ? 'Génération...' : `✦ Générer ${MOIS[mois]}`}
            </button>
          </div>
        )}

        {/* Liste journées */}
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #E8E6DF' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement...</div>
          ) : datesTriees.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Aucune session ce mois</div>
            </div>
          ) : datesTriees.map(date => {
            const dayData = byDate.get(date)!
            const isSel   = selDate === date
            const z1      = dayData.planned[0]?.zones_prospection
            const hasUpcoming = dayData.planned.some(p => p.statut === 'planifiee' && p.date_prevue >= today)
            return (
              <div key={date} onClick={() => setSelDate(date === selDate ? null : date)}
                style={{
                  padding: '8px 13px', cursor: 'pointer', borderBottom: '1px solid #F0EDE6',
                  background:  isSel ? '#f8fffe' : 'transparent',
                  borderLeft:  isSel ? '3px solid ' + (z1?.couleur ?? '#1D9E75') : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {dayData.planned.map((p, idx) => (
                      <div key={idx} style={{ width: 8, height: 8, borderRadius: '50%', background: p.zones_prospection?.couleur ?? '#9ca3af', opacity: ['annulee','non_realisee'].includes(p.statut) ? 0.3 : 1 }} />
                    ))}
                    {dayData.free.map((_, idx) => (
                      <div key={'f'+idx} style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                    ))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>{fmtDate(date)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {dayData.planned.length > 0 && dayData.planned.map(p =>
                        p.zones_prospection ? `Z${p.zones_prospection.numero}` : '?'
                      ).join(' + ')}
                      {dayData.planned.length > 0 && dayData.free.length > 0 && ' · '}
                      {dayData.free.length > 0 && (
                        <span style={{ color: '#92400e' }}>{dayData.free.length} libre{dayData.free.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  {hasUpcoming && (
                    <a href="/terrain" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#1D9E75', color: '#fff', textDecoration: 'none', flexShrink: 0 }}>
                      Go→
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ Colonne droite : détail journée ══ */}
      {selDate && selDayData && (
        <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ padding: '13px 16px', borderBottom: '1px solid #E8E6DF', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setSelDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', padding: 0 }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{fmtDate(selDate)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {totalSessJour} session{totalSessJour > 1 ? 's' : ''}
                {selDayData.free.length > 0 && <span style={{ color: '#F59E0B', marginLeft: 4 }}>· {selDayData.free.length} libre{selDayData.free.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
            {selDayData.planned.some(p => p.statut === 'planifiee' && p.date_prevue >= today) && (
              <a href="/terrain" style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#1D9E75', color: '#fff', textDecoration: 'none' }}>
                Démarrer →
              </a>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

            {/* Sessions planifiées */}
            {selDayData.planned.map(s => {
              const z   = s.zones_prospection
              const st  = STATUT[s.statut as keyof typeof STATUT] ?? STATUT.planifiee
              const rap = s.session_data?.rapport_json
              const vis  = rap?.nb_visites   ?? s.nb_adresses_visitees ?? 0
              const cont = rap?.nb_contacts  ?? s.nb_contacts          ?? 0
              const mais = rap?.nb_maisons   ?? 0
              const imm  = rap?.nb_immeubles ?? 0
              const synd = rap?.nb_syndics   ?? 0
              const estPasse     = s.date_prevue < today
              const estPlanifiee = s.statut === 'planifiee'
              const peutDemarrer = estPlanifiee && !estPasse
              const aDesResultats = s.statut === 'realisee' || (estPasse && (vis > 0 || cont > 0))

              return (
                <div key={s.id} style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1.5px solid #E8E6DF', background: '#FAFAF8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {z && <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.couleur, flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{z ? `Zone ${z.numero} — ${z.nom}` : 'Zone non assignée'}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{s.heure_debut} – {s.heure_fin}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                  </div>

                  {peutDemarrer && (
                    <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                      {(['annulee', 'non_realisee'] as const).map(k => (
                        <button key={k} onClick={() => patch(s.id, { statut: k })}
                          style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: '#f3f4f6', color: '#9ca3af', border: '1.5px solid #e5e7eb' }}>
                          → {STATUT[k].label}
                        </button>
                      ))}
                    </div>
                  )}

                  {estPlanifiee && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>ZONE</div>
                      <select value={s.zone_id} onChange={e => patchZone(s.id, e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 12, background: '#fff' }}>
                        {zones.map(z => <option key={z.id} value={z.id}>Zone {z.numero} — {z.nom}</option>)}
                      </select>
                    </div>
                  )}

                  {aDesResultats && (
                    <>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>RÉSULTATS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
                        <StatBox label="Visites"   value={vis}  accent />
                        <StatBox label="Contacts"  value={cont} />
                        <StatBox label="Maisons"   value={mais} />
                        <StatBox label="Collectif" value={imm}  />
                        <StatBox label="Syndics"   value={synd} />
                      </div>
                    </>
                  )}

                  {peutDemarrer && (
                    <a href="/terrain" style={{ display: 'block', textAlign: 'center', marginTop: 10, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#1D9E75', color: '#fff', textDecoration: 'none' }}>
                      Démarrer →
                    </a>
                  )}

                  <a href={`/api/ics?session_id=${s.id}`} target="_blank"
                    style={{ display: 'block', textAlign: 'center', marginTop: 6, padding: '5px', borderRadius: 7, fontSize: 11, color: '#9ca3af', textDecoration: 'none', border: '1px solid #E8E6DF', background: '#f9f9f9' }}>
                    📅 Exporter ICS
                  </a>
                </div>
              )
            })}

            {/* Sessions libres */}
            {selDayData.free.map(s => {
              const rap  = s.rapport_json
              const vis  = rap?.nb_visites   ?? 0; const cont = rap?.nb_contacts  ?? 0
              const mais = rap?.nb_maisons   ?? 0; const imm  = rap?.nb_immeubles ?? 0
              const synd = rap?.nb_syndics   ?? 0
              return (
                <div key={s.id} style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1.5px solid #fed7aa', background: '#fffbf5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Prospection libre{s.commune_nom ? ` — ${s.commune_nom}` : ''}</div>
                      {s.heure_debut && <div style={{ fontSize: 11, color: '#6b7280' }}>{s.heure_debut}{s.heure_fin ? ` – ${s.heure_fin}` : ''}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>Libre</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>RÉSULTATS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
                    <StatBox label="Visites"   value={vis}  accent />
                    <StatBox label="Contacts"  value={cont} />
                    <StatBox label="Maisons"   value={mais} />
                    <StatBox label="Collectif" value={imm}  />
                    <StatBox label="Syndics"   value={synd} />
                  </div>
                </div>
              )
            })}

            {/* Total journée */}
            {totalSessJour > 1 && totalJour && (
              <div style={{ padding: 12, borderRadius: 10, border: '2px solid #1D9E75', background: '#f0fdf4' }}>
                <div style={{ fontSize: 11, color: '#065f46', fontWeight: 700, marginBottom: 8 }}>
                  TOTAL JOURNÉE · {totalSessJour} sessions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
                  <StatBox label="Visites"   value={totalJour.vis}  accent />
                  <StatBox label="Contacts"  value={totalJour.cont} />
                  <StatBox label="Maisons"   value={totalJour.mais} />
                  <StatBox label="Collectif" value={totalJour.imm}  />
                  <StatBox label="Syndics"   value={totalJour.synd} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
