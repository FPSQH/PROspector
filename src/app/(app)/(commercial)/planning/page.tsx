'use client'

import { useEffect, useState, useCallback } from 'react'

const STATUT = {
  planifiee:    { label: 'Planifiée',    color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  realisee:     { label: 'Réalisée',     color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  annulee:      { label: 'Annulée',      color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb' },
  non_realisee: { label: 'Non réalisée', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
} as const

const MOIS       = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_C    = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const JOURS_L    = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

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

interface Zone    { id: string; nom: string; couleur: string; numero: number }
interface Session {
  id: string; date_prevue: string; heure_debut: string; heure_fin: string
  statut: string; zone_id: string; zone_id_2?: string | null; notes?: string
  nb_adresses_total: number; nb_adresses_visitees: number; nb_contacts: number
  zones_prospection?: Zone | null; zone2?: Zone | null
}
interface Cfg {
  jours_semaine: number[]; heure_debut: string; duree_minutes: number
  date_debut: string | null; deux_zones_par_seance: boolean
}
interface Kpis {
  nbPlanifiees: number; nbRealisees: number; nbAnnulees: number
  totalAdresses: number; visitees: number; totalContacts: number; pctRealise: number
}

const CFG_DEFAUT: Cfg = {
  jours_semaine: [2, 3, 5], heure_debut: '10:00', duree_minutes: 120,
  date_debut: null, deux_zones_par_seance: false,
}

export default function PlanningPage() {
  const now   = new Date()
  const today = now.toISOString().split('T')[0]

  const [mois,       setMois]       = useState(now.getMonth() + 1)
  const [annee,      setAnnee]      = useState(now.getFullYear())
  const [sessions,   setSessions]   = useState<Session[]>([])
  const [zones,      setZones]      = useState<Zone[]>([])
  const [kpis,       setKpis]       = useState<Kpis | null>(null)
  const [cfg,        setCfg]        = useState<Cfg>(CFG_DEFAUT)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showCfg,    setShowCfg]    = useState(false)
  const [savingCfg,  setSavingCfg]  = useState(false)
  const [selId,      setSelId]      = useState<string | null>(null)
  const [editV,      setEditV]      = useState('')
  const [editC,      setEditC]      = useState('')
  const [editN,      setEditN]      = useState('')

  const sel = sessions.find(s => s.id === selId) ?? null

  // ── Chargement ────────────────────────────────────────────────────────────
  const load = useCallback(async (m: number, a: number) => {
    setLoading(true)
    const [pd, zd] = await Promise.all([
      fetch(`/api/planning?mois=${m}&annee=${a}`).then(r => r.json()),
      fetch('/api/zones').then(r => r.json()),
    ])
    setSessions(pd.planning ?? [])
    setKpis(pd.kpis ?? null)
    if (pd.config) setCfg({
      jours_semaine:         pd.config.jours_semaine         ?? [2, 3, 5],
      heure_debut:           pd.config.heure_debut            ?? '10:00',
      duree_minutes:         pd.config.duree_minutes           ?? 120,
      date_debut:            pd.config.date_debut              ?? null,
      deux_zones_par_seance: pd.config.deux_zones_par_seance  ?? false,
    })
    setZones(zd.zones ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load(mois, annee) }, [mois, annee, load])

  // Sync champs suivi quand la session sélectionnée change (fix : dépendances correctes)
  useEffect(() => {
    if (!sel) return
    setEditV(String(sel.nb_adresses_visitees ?? 0))
    setEditC(String(sel.nb_contacts ?? 0))
    setEditN(sel.notes ?? '')
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────
  const patch = useCallback(async (id: string, body: object) => {
    const r = await fetch(`/api/planning/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (d.session) setSessions(s => s.map(x => x.id === id ? { ...x, ...d.session } : x))
    return d
  }, [])

  // Changement de zone optimiste (met aussi à jour la référence zone localement)
  const patchZone = useCallback(async (
    id: string,
    field: 'zone_id' | 'zone_id_2',
    zoneId: string | null,
  ) => {
    const zoneRef  = field === 'zone_id' ? 'zones_prospection' : 'zone2'
    const zoneData = zoneId ? zones.find(z => z.id === zoneId) ?? null : null
    // Optimistic local update
    setSessions(s => s.map(x =>
      x.id === id ? { ...x, [field]: zoneId, [zoneRef]: zoneData } : x
    ))
    await fetch(`/api/planning/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: zoneId }),
    })
  }, [zones])

  const generate = async () => {
    setGenerating(true)
    const r = await fetch('/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mois, annee }),
    })
    const d = await r.json()
    setGenerating(false)
    if (d.planning) { setSessions(d.planning); setKpis(d.kpis ?? null) }
    else if (d.error) alert(d.error)
  }

  const resetMois = async () => {
    if (!confirm(`Supprimer les sessions planifiées de ${MOIS[mois]} ${annee} ?`)) return
    await fetch(`/api/planning?mois=${mois}&annee=${annee}`, { method: 'DELETE' })
    setSessions(s => s.filter(x => x.statut !== 'planifiee'))
    setSelId(null)
  }

  const saveCfg = async () => {
    setSavingCfg(true)
    await fetch('/api/planning/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    setSavingCfg(false)
    setShowCfg(false)
  }

  const saveTracking = async () => {
    if (!sel) return
    await patch(sel.id, {
      nb_adresses_visitees: parseInt(editV) || 0,
      nb_contacts:          parseInt(editC) || 0,
      notes:                editN,
    })
  }

  const navMois = (delta: number) => {
    let m = mois + delta, a = annee
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMois(m); setAnnee(a); setSelId(null)
  }

  // ── Calculs dérivés ───────────────────────────────────────────────────────
  const daysInMonth       = new Date(annee, mois, 0).getDate()
  const firstDay          = new Date(annee, mois - 1, 1).getDay()
  const byDate            = new Map(sessions.map(s => [s.date_prevue, s]))
  const heureFin          = addMin(cfg.heure_debut, cfg.duree_minutes)
  const nbJoursParSem     = cfg.jours_semaine.length
  const zonesParSeance    = cfg.deux_zones_par_seance ? 2 : 1
  const nbZones           = zones.length
  const intervalleRetour  = nbZones > 0 && nbJoursParSem > 0
    ? Math.ceil(nbZones / (nbJoursParSem * zonesParSeance))
    : null

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', background: '#F8F7F4', overflow: 'hidden' }}>

      {/* ── Colonne gauche ── */}
      <div style={{
        width: sel ? 340 : '100%', maxWidth: sel ? 340 : 520, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #E8E6DF', background: '#fff', overflow: 'hidden',
      }}>

        {/* Header navigation mois */}
        <div style={{ padding: '13px 16px', borderBottom: '1px solid #E8E6DF', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => navMois(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '2px 6px', borderRadius: 6 }}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>
            {MOIS[mois]} {annee}
          </div>
          <button onClick={() => navMois(1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', padding: '2px 6px', borderRadius: 6 }}>›</button>
          <button onClick={() => setShowCfg(v => !v)} title="Configuration"
            style={{
              background: showCfg ? '#f0fdf4' : 'none',
              border: showCfg ? '1px solid #bbf7d0' : '1px solid transparent',
              cursor: 'pointer', borderRadius: 6, padding: '4px 8px', fontSize: 16,
              color: showCfg ? '#1D9E75' : '#6b7280',
            }}>⚙</button>
        </div>

        {/* ── Panneau config ── */}
        {showCfg && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E8E6DF', background: '#f8fffe', flexShrink: 0 }}>

            {/* Jours */}
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>JOURS DE PROSPECTION</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(j => {
                const actif = cfg.jours_semaine.includes(j)
                return (
                  <button key={j}
                    onClick={() => setCfg(c => ({
                      ...c,
                      jours_semaine: actif
                        ? c.jours_semaine.filter(x => x !== j)
                        : [...c.jours_semaine, j].sort(),
                    }))}
                    style={{
                      flex: 1, padding: '4px 0', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: actif ? '#d1fae5' : '#f3f4f6',
                      color:      actif ? '#065f46' : '#6b7280',
                      border: '1.5px solid ' + (actif ? '#6ee7b7' : '#e5e7eb'),
                    }}>
                    {JOURS_L[j].slice(0, 3)}
                  </button>
                )
              })}
            </div>

            {/* Heure + Durée */}
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
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
              Créneau : {cfg.heure_debut} – {heureFin}
            </div>

            {/* Date de début */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 3 }}>DATE DE DÉBUT DE GÉNÉRATION</div>
              <input type="date" value={cfg.date_debut ?? ''}
                onChange={e => setCfg(c => ({ ...c, date_debut: e.target.value || null }))}
                style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 13 }} />
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                Laisser vide → démarre au 1er du mois
              </div>
            </div>

            {/* Zones par séance */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>ZONES PAR SÉANCE</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2].map(n => {
                  const actif = (cfg.deux_zones_par_seance ? 2 : 1) === n
                  return (
                    <button key={n}
                      onClick={() => setCfg(c => ({ ...c, deux_zones_par_seance: n === 2 }))}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: actif ? '#d1fae5' : '#f3f4f6',
                        color:      actif ? '#065f46' : '#6b7280',
                        border: '1.5px solid ' + (actif ? '#6ee7b7' : '#e5e7eb'),
                      }}>
                      {n} zone{n > 1 ? 's' : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Intervalle calculé */}
            {intervalleRetour !== null && (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                  📅 Retour par zone : toutes les {intervalleRetour} semaine{intervalleRetour > 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                  {nbZones} zone{nbZones > 1 ? 's' : ''} · {nbJoursParSem} séance{nbJoursParSem > 1 ? 's' : ''}/sem · {zonesParSeance} zone{zonesParSeance > 1 ? 's' : ''}/séance
                </div>
              </div>
            )}

            <button onClick={saveCfg} disabled={savingCfg}
              style={{
                width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: savingCfg ? '#E8E6DF' : '#1D9E75', color: '#fff',
                border: 'none', cursor: savingCfg ? 'not-allowed' : 'pointer',
              }}>
              {savingCfg ? 'Sauvegarde...' : '✓ Sauvegarder la configuration'}
            </button>
          </div>
        )}

        {/* KPIs mois */}
        {kpis && sessions.length > 0 && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #E8E6DF', display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            {([
              ['Planif.',  kpis.nbPlanifiees, '#0369a1', '#e0f2fe'],
              ['Réal.',    kpis.nbRealisees,  '#065f46', '#d1fae5'],
              ['Annul.',   kpis.nbAnnulees,   '#9ca3af', '#f3f4f6'],
            ] as [string, number, string, string][]).map(([l, n, c, b]) => (
              <span key={l} style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: b, color: c }}>
                {n} {l}
              </span>
            ))}
            {kpis.totalAdresses > 0 && (
              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 20, background: '#f3f4f6', color: '#374151', fontWeight: 600 }}>
                {kpis.visitees}/{kpis.totalAdresses} ({kpis.pctRealise}%)
              </span>
            )}
            {kpis.totalContacts > 0 && (
              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 20, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                {kpis.totalContacts} contacts
              </span>
            )}
            <div style={{ flex: 1 }} />
            {sessions.some(s => s.statut === 'planifiee') && (
              <button onClick={resetMois}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: '#fff', color: '#9ca3af', border: '1px solid #E8E6DF', cursor: 'pointer' }}>
                🗑 Reset
              </button>
            )}
          </div>
        )}

        {/* Calendrier */}
        <div style={{ padding: '10px 12px', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
            {JOURS_C.map(j => (
              <div key={j} style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{j}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {Array(firstDay).fill(null).map((_, i) => <div key={'e' + i} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day  = i + 1
              const ds   = `${annee}-${String(mois).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const s    = byDate.get(ds)
              const isTod = ds === today
              const isSel = s?.id === selId
              const c1   = s?.zones_prospection?.couleur ?? '#9ca3af'
              const c2   = s?.zone2?.couleur
              const faded = s && ['annulee', 'non_realisee'].includes(s.statut)
              return (
                <div key={day} onClick={() => s && setSelId(s.id === selId ? null : s.id)}
                  style={{
                    borderRadius: 5, padding: '3px 2px', minHeight: 32, textAlign: 'center',
                    background: isSel ? c1 + '22' : isTod ? '#f0fdf4' : 'transparent',
                    border: isSel
                      ? '2px solid ' + c1
                      : isTod ? '1px solid #bbf7d0' : '1px solid transparent',
                    cursor: s ? 'pointer' : 'default',
                  }}>
                  <div style={{ fontSize: 11, fontWeight: isTod ? 700 : 400, color: isTod ? '#1D9E75' : '#374151' }}>
                    {day}
                  </div>
                  {s && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: c1, opacity: faded ? 0.3 : 1 }} />
                      {c2 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: c2, opacity: faded ? 0.3 : 1 }} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bouton générer */}
        {sessions.length === 0 && !loading && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid #E8E6DF', textAlign: 'center', flexShrink: 0 }}>
            <button onClick={generate} disabled={generating}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: generating ? '#E8E6DF' : '#1D9E75', color: '#fff',
                border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
              }}>
              {generating ? 'Génération...' : `✦ Générer ${MOIS[mois]}`}
            </button>
          </div>
        )}

        {/* Liste sessions */}
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #E8E6DF' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Aucune session ce mois</div>
            </div>
          ) : sessions.map(s => {
            const st   = STATUT[s.statut as keyof typeof STATUT] ?? STATUT.planifiee
            const z1   = s.zones_prospection
            const z2   = s.zone2
            const isS  = s.id === selId
            const pct  = s.nb_adresses_total > 0
              ? Math.round(s.nb_adresses_visitees / s.nb_adresses_total * 100)
              : null
            const faded = ['annulee', 'non_realisee'].includes(s.statut)
            return (
              <div key={s.id} onClick={() => setSelId(s.id === selId ? null : s.id)}
                style={{
                  padding: '8px 13px', cursor: 'pointer', borderBottom: '1px solid #F0EDE6',
                  background:  isS ? '#f8fffe' : 'transparent',
                  borderLeft:  isS ? '3px solid ' + (z1?.couleur ?? '#1D9E75') : '3px solid transparent',
                  opacity:     faded ? 0.6 : 1,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {/* Points de couleur zone(s) */}
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                    {z1 && <div style={{ width: 8, height: 8, borderRadius: '50%', background: z1.couleur }} />}
                    {z2 && <div style={{ width: 8, height: 8, borderRadius: '50%', background: z2.couleur }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                      {fmtDate(s.date_prevue)}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {z1
                        ? `Z${z1.numero}${z2 ? ` + Z${z2.numero}` : ''} — ${z1.nom}${z2 ? ` · ${z2.nom}` : ''}`
                        : 'Zone non assignée'
                      } · {s.heure_debut}–{s.heure_fin}
                      {pct !== null && s.statut === 'realisee' && (
                        <span style={{ marginLeft: 5, color: '#1D9E75', fontWeight: 600 }}>{pct}%</span>
                      )}
                      {s.nb_contacts > 0 && (
                        <span style={{ marginLeft: 5, color: '#92400e' }}>{s.nb_contacts} contact{s.nb_contacts > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 20, background: st.bg, color: st.color, flexShrink: 0 }}>
                    {st.label}
                  </span>
                  {s.statut === 'planifiee' && s.date_prevue >= today && (
                    <a href="/terrain" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, background: '#1D9E75', color: '#fff', textDecoration: 'none', flexShrink: 0 }}>
                      Go→
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Colonne droite : détail session ── */}
      {sel && (
        <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '13px 16px', borderBottom: '1px solid #E8E6DF', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setSelId(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', padding: 0 }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{fmtDate(sel.date_prevue)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{sel.heure_debut} – {sel.heure_fin}</div>
            </div>
            {sel.statut === 'planifiee' && sel.date_prevue >= today && (
              <a href="/terrain"
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#1D9E75', color: '#fff', textDecoration: 'none' }}>
                Démarrer →
              </a>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

            {/* Zone principale */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 5 }}>ZONE PRINCIPALE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: sel.zones_prospection?.couleur ?? '#e5e7eb', flexShrink: 0 }} />
                <select value={sel.zone_id}
                  onChange={e => patchZone(sel.id, 'zone_id', e.target.value)}
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 12, background: '#fff' }}>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>Zone {z.numero} — {z.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Zone secondaire (si config 2 zones) */}
            {cfg.deux_zones_par_seance && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 5 }}>ZONE SECONDAIRE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: sel.zone2?.couleur ?? '#e5e7eb', flexShrink: 0 }} />
                  <select value={sel.zone_id_2 ?? ''}
                    onChange={e => patchZone(sel.id, 'zone_id_2', e.target.value || null)}
                    style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 12, background: '#fff' }}>
                    <option value="">— Aucune —</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>Zone {z.numero} — {z.nom}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Statut */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 5 }}>STATUT</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.entries(STATUT) as [string, typeof STATUT[keyof typeof STATUT]][]).map(([k, v]) => (
                  <button key={k} onClick={() => patch(sel.id, { statut: k })}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: sel.statut === k ? v.bg    : '#f9f9f9',
                      color:      sel.statut === k ? v.color : '#9ca3af',
                      border: '1.5px solid ' + (sel.statut === k ? v.border : '#e5e7eb'),
                    }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Suivi de séance */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>SUIVI DE SÉANCE</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>ADRESSES VISITÉES</div>
                  <input type="number" value={editV} min={0}
                    onChange={e => setEditV(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>CONTACTS</div>
                  <input type="number" value={editC} min={0}
                    onChange={e => setEditC(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 13 }} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>NOTES</div>
              <textarea value={editN} onChange={e => setEditN(e.target.value)} rows={3}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #E8E6DF', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              <button onClick={saveTracking}
                style={{ marginTop: 6, width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer' }}>
                ✓ Enregistrer le suivi
              </button>
            </div>

            {/* Export ICS */}
            <a href={`/api/ics?session_id=${sel.id}`} target="_blank"
              style={{ display: 'block', textAlign: 'center', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f3f4f6', color: '#374151', textDecoration: 'none', border: '1px solid #E8E6DF' }}>
              📅 Exporter en ICS
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
