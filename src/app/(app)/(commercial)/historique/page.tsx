'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/* ── Design tokens ───────────────────────────────────────── */
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
  gold:    '#D97706',
  danger:  '#EF4444',
  info:    '#3B82F6',
}

const STATUT_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  planifiee:    { label: 'Planifiée',    color: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)'  },
  preparee:     { label: 'Préparée',     color: '#C084FC', bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.25)' },
  en_cours:     { label: 'En cours',     color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)'  },
  realisee:     { label: 'Réalisée',     color: '#4ADE80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)'   },
  annulee:      { label: 'Annulée',      color: '#6B6B7B', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)' },
  non_realisee: { label: 'Non réalisée', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)'  },
}

const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  zone:      { label: 'Zone',      color: C.gold    },
  dpe:       { label: 'DPE',       color: C.info    },
  hors_zone: { label: 'Hors-zone', color: '#C084FC' },
  libre:     { label: 'Libre',     color: C.mid     },
}

const MOIS_LABELS = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

interface Zone { id: string; nom: string; couleur: string; numero: number }

interface Session {
  id: string
  zone_id?: string | null
  date_session: string
  heure_debut?: string | null
  heure_fin?: string | null
  heure_debut_reel?: string | null
  heure_fin_reel?: string | null
  statut: string
  type_session?: string | null
  commune_nom?: string | null
  nom_tournee?: string | null
  nb_portes?: number | null
  nb_boites?: number | null
  notes?: string | null
  rapport_json?: any
  zones_prospection?: { nom: string; couleur: string; numero: number } | null
}

function fmtDate(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtDuree(debut?: string | null, fin?: string | null): string {
  if (!debut || !fin) return '—'
  const d = new Date(debut), f = new Date(fin)
  const diff = Math.round((f.getTime() - d.getTime()) / 60000)
  if (diff <= 0) return '—'
  const h = Math.floor(diff / 60), m = diff % 60
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
}

function getSessionLabel(s: Session): string {
  if (s.zones_prospection) return `Zone ${s.zones_prospection.numero} — ${s.zones_prospection.nom}`
  if (s.nom_tournee)        return s.nom_tournee
  if (s.commune_nom)        return s.commune_nom
  return 'Session libre'
}

function getNbContacts(s: Session): number | null {
  return s.rapport_json?.nb_contacts ?? null
}

function StatutBadge({ statut }: { statut: string }) {
  const st = STATUT_STYLE[statut] ?? STATUT_STYLE.planifiee
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: st.color, background: st.bg, border: `1px solid ${st.border}`,
      whiteSpace: 'nowrap',
    }}>
      {st.label}
    </span>
  )
}

function TypeBadge({ type }: { type?: string | null }) {
  if (!type) return null
  const t = TYPE_STYLE[type]
  if (!t) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
      color: t.color, background: `${t.color}1A`,
      border: `1px solid ${t.color}40`,
      whiteSpace: 'nowrap',
    }}>
      {t.label}
    </span>
  )
}

export default function HistoriquePage() {
  const router = useRouter()
  const now    = new Date()

  const [sessions, setSessions]    = useState<Session[]>([])
  const [zones, setZones]          = useState<Zone[]>([])
  const [loading, setLoading]      = useState(true)
  const [total, setTotal]          = useState(0)
  const [offset, setOffset]        = useState(0)
  const LIMIT = 30

  /* ── Filtres ── */
  const [filtreMois, setFiltreMois]     = useState<string>('')    // 'YYYY-MM'
  const [filtreStatut, setFiltreStatut] = useState<string>('')
  const [filtreZone, setFiltreZone]     = useState<string>('')
  const [filtreType, setFiltreType]     = useState<string>('')

  /* ── 12 mois disponibles ── */
  const moisDispos = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MOIS_LABELS[d.getMonth() + 1]} ${d.getFullYear()}`,
    }
  })

  const load = useCallback(async (off = 0) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) })

    if (filtreMois) {
      const [y, m] = filtreMois.split('-').map(Number)
      const debut  = new Date(y, m - 1, 1)
      const fin    = new Date(y, m, 0)
      params.set('date_debut', debut.toISOString().split('T')[0])
      params.set('date_fin',   fin.toISOString().split('T')[0])
    } else {
      /* 12 mois glissants par défaut */
      const debut12 = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      params.set('date_debut', debut12.toISOString().split('T')[0])
    }

    if (filtreStatut) params.set('statut',       filtreStatut)
    if (filtreZone)   params.set('zone_id',       filtreZone)
    if (filtreType)   params.set('type_session',  filtreType)

    const res  = await fetch(`/api/sessions?${params}`)
    const json = await res.json()
    setSessions(json.sessions ?? [])
    setTotal(json.total ?? 0)
    setOffset(off)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreMois, filtreStatut, filtreZone, filtreType])

  useEffect(() => { load(0) }, [load])

  useEffect(() => {
    fetch('/api/zones')
      .then(r => r.json())
      .then(d => setZones(d.zones ?? []))
      .catch(() => {})
  }, [])

  const SEL: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, fontSize: 13,
    background: C.card, color: C.text,
    border: `1px solid ${C.borderl}`, outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '18px 24px 16px' }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.text }}>
          Historique des sessions
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>
          12 mois glissants — {total} session{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Filtres ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 24px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <select value={filtreMois} onChange={e => setFiltreMois(e.target.value)} style={SEL}>
          <option value="">Tous les mois</option>
          {moisDispos.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} style={SEL}>
          <option value="">Tous les statuts</option>
          <option value="realisee">Réalisée</option>
          <option value="en_cours">En cours</option>
          <option value="planifiee">Planifiée</option>
          <option value="annulee">Annulée</option>
          <option value="non_realisee">Non réalisée</option>
        </select>

        <select value={filtreZone} onChange={e => setFiltreZone(e.target.value)} style={SEL}>
          <option value="">Toutes les zones</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>Zone {z.numero} — {z.nom}</option>
          ))}
        </select>

        <select value={filtreType} onChange={e => setFiltreType(e.target.value)} style={SEL}>
          <option value="">Tous les types</option>
          <option value="zone">Zone</option>
          <option value="dpe">DPE</option>
          <option value="hors_zone">Hors-zone</option>
          <option value="libre">Libre</option>
        </select>

        {(filtreMois || filtreStatut || filtreZone || filtreType) && (
          <button
            onClick={() => { setFiltreMois(''); setFiltreStatut(''); setFiltreZone(''); setFiltreType('') }}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            }}
          >
            Effacer
          </button>
        )}
      </div>

      {/* ── Liste ── */}
      <div style={{ padding: '16px 24px', maxWidth: 900 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 14 }}>
            Chargement…
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 14 }}>
            Aucune session trouvée pour ces filtres.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map(s => {
              const nbContacts = getNbContacts(s)
              const duree      = fmtDuree(s.heure_debut_reel, s.heure_fin_reel)
              const label      = getSessionLabel(s)
              return (
                <div
                  key={s.id}
                  onClick={() => router.push(`/historique/${s.id}`)}
                  style={{
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.12s',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderl)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  {/* Date block */}
                  <div style={{
                    flexShrink: 0, textAlign: 'center', minWidth: 46,
                    background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: C.text }}>
                      {new Date(s.date_session + 'T12:00:00').getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2, textTransform: 'uppercase' }}>
                      {new Date(s.date_session + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 10, color: C.dim }}>
                      {new Date(s.date_session + 'T12:00:00').getFullYear()}
                    </div>
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      <TypeBadge type={s.type_session} />
                      <StatutBadge statut={s.statut} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                      {s.nb_portes != null && (
                        <span style={{ fontSize: 12, color: C.mid }}>
                          🚪 {s.nb_portes} porte{s.nb_portes !== 1 ? 's' : ''}
                        </span>
                      )}
                      {nbContacts != null && (
                        <span style={{ fontSize: 12, color: C.mid }}>
                          👤 {nbContacts} contact{nbContacts !== 1 ? 's' : ''}
                        </span>
                      )}
                      {s.nb_boites != null && s.nb_boites > 0 && (
                        <span style={{ fontSize: 12, color: C.mid }}>
                          📬 {s.nb_boites} boîtes
                        </span>
                      )}
                      {duree !== '—' && (
                        <span style={{ fontSize: 12, color: C.mid }}>
                          ⏱ {duree}
                        </span>
                      )}
                    </div>
                    {s.notes && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.notes}
                      </p>
                    )}
                  </div>

                  {/* Chevron */}
                  <div style={{ flexShrink: 0, color: C.dim }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && total > LIMIT && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
            <button
              disabled={offset === 0}
              onClick={() => load(offset - LIMIT)}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, cursor: offset === 0 ? 'not-allowed' : 'pointer',
                background: offset === 0 ? 'rgba(255,255,255,0.04)' : C.card,
                color: offset === 0 ? C.dim : C.text,
                border: `1px solid ${C.border}`,
              }}
            >
              ← Précédent
            </button>
            <span style={{ padding: '8px 12px', fontSize: 13, color: C.muted }}>
              {offset + 1}–{Math.min(offset + LIMIT, total)} / {total}
            </span>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => load(offset + LIMIT)}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer',
                background: offset + LIMIT >= total ? 'rgba(255,255,255,0.04)' : C.card,
                color: offset + LIMIT >= total ? C.dim : C.text,
                border: `1px solid ${C.border}`,
              }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {/* Spacer mobile */}
      <div style={{ height: 80 }} />
    </div>
  )
}
