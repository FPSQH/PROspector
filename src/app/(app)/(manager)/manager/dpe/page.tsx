'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Design tokens ─────────────────────────────────────────────
const TEAL = '#1D9E75', TEAL_BG = 'rgba(29,158,117,0.08)', TEAL_BDR = 'rgba(29,158,117,0.2)'
const GOLD = '#D97706', GOLD_BG = 'rgba(217,119,6,0.08)', GOLD_BDR = 'rgba(217,119,6,0.2)'
const RED  = '#EF4444', RED_BG  = 'rgba(239,68,68,0.08)',  RED_BDR  = 'rgba(239,68,68,0.2)'
const TEXT = '#F0F0F2', MUTED = '#6B6B7B', DIM = '#4A4A58', BORDER = 'rgba(255,255,255,0.06)', CARD_BG = '#141416'

function fmt(d: Date) {
  return d.toISOString().split('T')[0]!
}
function fmtDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function getDefaults() {
  const now = new Date()
  const fin = fmt(now)
  const debut = fmt(new Date(now.getTime() - 14 * 24 * 3600 * 1000))
  return { debut, fin }
}

const DPE_COLORS: Record<string, string> = {
  A: '#00B050', B: '#5CB85C', C: '#FFCC00', D: '#FF9900', E: '#FF6600', F: '#FF0000', G: '#8B0000',
}

// ── Types ─────────────────────────────────────────────────────
interface StatRow {
  id: string; nom: string; prenom: string
  nb_dpe_zone: number; nb_dpe_hors_zone: number
  nb_dpe_prospecte: number; taux_prospection: number
}

interface DrillAdresse {
  adresse_brute: string; adresse: string; commune: string; code_postal: string
  zone: { nom: string; couleur: string } | null
  date_dpe: string; etiquette_dpe: string; type_batiment: string
  prospecte: boolean; dernier_passage: string | null
  contacts: { prenom: string; nom: string; statut: string }[]
  actions: { action: string; date: string }[]
}

// ═══════════════════════════════════════════════════════════════
export default function ManagerDpePage() {
  const defs = getDefaults()
  const [debut, setDebut] = useState(defs.debut)
  const [fin,   setFin]   = useState(defs.fin)
  const [stats,   setStats]   = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)

  // Drill-down
  const [drill, setDrill] = useState<{ cid: string; type: 'zone'|'hors_zone' } | null>(null)
  const [drillData,    setDrillData]    = useState<DrillAdresse[]>([])
  const [drillNom,     setDrillNom]     = useState('')
  const [drillLoading, setDrillLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (debut) p.set('debut', debut)
    if (fin)   p.set('fin', fin)
    const r = await fetch('/api/manager/dpe?' + p)
    const d = await r.json()
    setStats(d.stats ?? [])
    setLoading(false)
  }, [debut, fin])

  useEffect(() => { load() }, [load])

  const openDrill = async (cid: string, type: 'zone' | 'hors_zone', nom: string) => {
    setDrill({ cid, type }); setDrillNom(nom); setDrillLoading(true)
    const p = new URLSearchParams({ type })
    if (debut) p.set('debut', debut)
    if (fin)   p.set('fin', fin)
    const r = await fetch(`/api/manager/dpe/${cid}?` + p)
    const d = await r.json()
    setDrillData(d.adresses ?? [])
    setDrillLoading(false)
  }

  // Raccourcis de période
  const setMoisCourant = () => {
    const now = new Date()
    setDebut(fmt(new Date(now.getFullYear(), now.getMonth(), 1)))
    setFin(fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  }
  const setMoisPrecedent = () => {
    const now = new Date()
    setDebut(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
    setFin(fmt(new Date(now.getFullYear(), now.getMonth(), 0)))
  }
  const setAnneeCourante = () => {
    const y = new Date().getFullYear()
    setDebut(`${y}-01-01`); setFin(`${y}-12-31`)
  }
  const set2Semaines = () => {
    const now = new Date()
    setDebut(fmt(new Date(now.getTime() - 14 * 24 * 3600 * 1000)))
    setFin(fmt(now))
  }

  const totaux = stats.reduce(
    (acc, r) => ({
      zone: acc.zone + r.nb_dpe_zone,
      hors: acc.hors + r.nb_dpe_hors_zone,
      prosp: acc.prosp + r.nb_dpe_prospecte,
    }),
    { zone: 0, hors: 0, prosp: 0 }
  )
  const tauxTotal = totaux.zone > 0 ? Math.round((totaux.prosp / totaux.zone) * 100) : 0

  const btnStyle = (active = false): any => ({
    padding: '5px 12px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600,
    cursor: 'pointer', background: active ? TEAL_BG : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? TEAL_BDR : BORDER}`, color: active ? TEAL : MUTED,
  })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, color: TEXT, background: '#0C0C0E', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>DPE équipe</h1>
        <p style={{ color: MUTED, marginTop: 4, fontSize: '0.85rem' }}>
          Diagnostics de performance énergétique dans le secteur de votre équipe
        </p>
      </div>

      {/* ── Filtres date ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <input type="date" value={debut} onChange={e => setDebut(e.target.value)}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: '0.82rem', padding: '6px 10px', colorScheme: 'dark' }} />
        <span style={{ color: MUTED, fontSize: '0.82rem' }}>→</span>
        <input type="date" value={fin} onChange={e => setFin(e.target.value)}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: '0.82rem', padding: '6px 10px', colorScheme: 'dark' }} />
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          <button onClick={set2Semaines} style={btnStyle()}>2 sem.</button>
          <button onClick={setMoisCourant} style={btnStyle()}>Ce mois</button>
          <button onClick={setMoisPrecedent} style={btnStyle()}>Mois préc.</button>
          <button onClick={setAnneeCourante} style={btnStyle()}>Année</button>
        </div>
      </div>

      {/* ── KPIs résumé ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'DPE sur zone', value: totaux.zone, color: TEAL, bg: TEAL_BG, bdr: TEAL_BDR },
          { label: 'DPE hors zone', value: totaux.hors, color: GOLD, bg: GOLD_BG, bdr: GOLD_BDR },
          { label: 'DPE prospectés', value: totaux.prosp, color: TEXT, bg: CARD_BG, bdr: BORDER },
          { label: 'Taux prospection zone', value: `${tauxTotal}%`, color: tauxTotal > 50 ? TEAL : tauxTotal > 20 ? GOLD : RED, bg: CARD_BG, bdr: BORDER },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.bdr}`, borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{loading ? '…' : k.value}</div>
            <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: 6 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tableau par commercial ── */}
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
        {loading ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: DIM }}>Chargement…</div>
        ) : stats.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: DIM }}>Aucun commercial dans votre équipe.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Commercial', 'DPE sur zone', 'DPE hors zone', 'DPE prospectés', 'Taux prospection zone'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: DIM, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < stats.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.prenom} {r.nom}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => r.nb_dpe_zone > 0 && openDrill(r.id, 'zone', `${r.prenom} ${r.nom}`)}
                      style={{ background: r.nb_dpe_zone > 0 ? TEAL_BG : 'transparent', border: `1px solid ${r.nb_dpe_zone > 0 ? TEAL_BDR : 'transparent'}`, borderRadius: 6, padding: '3px 10px', color: r.nb_dpe_zone > 0 ? TEAL : DIM, fontWeight: 700, fontSize: '0.9rem', cursor: r.nb_dpe_zone > 0 ? 'pointer' : 'default' }}>
                      {r.nb_dpe_zone}
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => r.nb_dpe_hors_zone > 0 && openDrill(r.id, 'hors_zone', `${r.prenom} ${r.nom}`)}
                      style={{ background: r.nb_dpe_hors_zone > 0 ? GOLD_BG : 'transparent', border: `1px solid ${r.nb_dpe_hors_zone > 0 ? GOLD_BDR : 'transparent'}`, borderRadius: 6, padding: '3px 10px', color: r.nb_dpe_hors_zone > 0 ? GOLD : DIM, fontWeight: 700, fontSize: '0.9rem', cursor: r.nb_dpe_hors_zone > 0 ? 'pointer' : 'default' }}>
                      {r.nb_dpe_hors_zone}
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: r.nb_dpe_prospecte > 0 ? TEXT : DIM }}>
                      {r.nb_dpe_prospecte || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', minWidth: 60 }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(r.taux_prospection, 100)}%`, background: r.taux_prospection > 50 ? TEAL : r.taux_prospection > 20 ? GOLD : r.taux_prospection > 0 ? RED : DIM }} />
                      </div>
                      <span style={{ fontSize: '0.78rem', color: MUTED, flexShrink: 0 }}>{r.taux_prospection}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Panneau drill-down ── */}
      {drill && (
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                DPE {drill.type === 'zone' ? 'sur zone' : 'hors zone'} — {drillNom}
              </div>
              <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 2 }}>
                {fmtDate(debut)} → {fmtDate(fin)} · {drillData.length} adresse{drillData.length > 1 ? 's' : ''}
              </div>
            </div>
            <button onClick={() => setDrill(null)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          </div>
          {drillLoading ? (
            <div style={{ padding: '48px 32px', textAlign: 'center', color: DIM }}>Chargement…</div>
          ) : drillData.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: DIM }}>Aucune adresse.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Adresse', 'Commune', 'Zone', 'DPE', 'Date DPE', 'Dernier passage', 'Qualification'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 600, color: DIM, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillData.map((a, i) => (
                    <tr key={i} style={{ borderBottom: i < drillData.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none' }}>
                      <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: TEXT, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.adresse || a.adresse_brute}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: MUTED, whiteSpace: 'nowrap' }}>{a.commune}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {a.zone ? (
                          <span style={{ fontSize: '0.72rem', background: a.zone.couleur + '22', color: a.zone.couleur, border: `1px solid ${a.zone.couleur}44`, padding: '2px 8px', borderRadius: 4 }}>{a.zone.nom}</span>
                        ) : <span style={{ color: DIM, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: DPE_COLORS[a.etiquette_dpe] ?? TEXT }}>{a.etiquette_dpe ?? '?'}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: MUTED, whiteSpace: 'nowrap' }}>{fmtDate(a.date_dpe)}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {a.dernier_passage ? (
                          <span style={{ color: TEAL }}>{fmtDate(a.dernier_passage)}</span>
                        ) : <span style={{ color: DIM }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 180 }}>
                        {a.contacts.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {a.contacts.map((c, j) => (
                              <div key={j} style={{ fontSize: '0.75rem', color: TEXT }}>
                                {[c.prenom, c.nom].filter(Boolean).join(' ')}
                                {c.statut && <span style={{ color: MUTED, marginLeft: 6 }}>{c.statut}</span>}
                              </div>
                            ))}
                          </div>
                        ) : a.actions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {a.actions.slice(0, 2).map((act, j) => (
                              <div key={j} style={{ fontSize: '0.75rem' }}>
                                <span style={{ color: TEAL }}>{act.action === 'flyer_depose' ? 'Flyer' : 'Courrier'}</span>
                                <span style={{ color: MUTED, marginLeft: 6 }}>{fmtDate(act.date)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: DIM }}>Non prospectée</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
