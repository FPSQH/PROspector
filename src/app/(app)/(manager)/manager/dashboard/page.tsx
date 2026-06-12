import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Helpers ───────────────────────────────────────────────────
function getPeriodeDates(periode: string): { debut: string; fin: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (periode === 'semaine') {
    const day = now.getDay() || 7
    const lundi = new Date(now); lundi.setDate(now.getDate() - day + 1)
    const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6)
    return { debut: fmt(lundi), fin: fmt(dimanche) }
  }
  if (periode === 'mois') {
    return {
      debut: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
      fin:   fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }
  }
  // 'tout' — pas de filtre
  return { debut: '', fin: '' }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Couleurs ─────────────────────────────────────────────────
const TEAL     = '#1D9E75'
const TEAL_BG  = 'rgba(29,158,117,0.1)'
const TEAL_BDR = 'rgba(29,158,117,0.2)'
const GOLD     = '#D97706'
const GOLD_BG  = 'rgba(217,119,6,0.1)'
const GOLD_BDR = 'rgba(217,119,6,0.2)'
const RED      = '#EF4444'
const RED_BG   = 'rgba(239,68,68,0.1)'
const RED_BDR  = 'rgba(239,68,68,0.2)'
const BORDER   = 'rgba(255,255,255,0.06)'
const TEXT     = '#F0F0F2'
const MUTED    = '#6B6B7B'
const DIM      = '#4A4A58'
const CARD_BG  = 'rgba(255,255,255,0.03)'

// ── Types ─────────────────────────────────────────────────────
interface StatsCommercial {
  commercial_id:          string
  nom:                    string
  prenom:                 string
  email:                  string
  derniere_connexion:     string | null
  nb_sessions_realisees:  number
  nb_sessions_planifiees: number
  nb_sessions_total:      number
  nb_portes:              number
  nb_contacts_terrain:    number
  nb_mandats:             number
  nb_contacts_chauds:     number
  dernier_passage:        string | null
  taux_couverture_moyen:  number
}

// ── Page ──────────────────────────────────────────────────────
export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { periode: periodeParam } = await searchParams
  const periode = periodeParam ?? 'semaine'
  const { debut, fin } = getPeriodeDates(periode)

  const { data: stats, error } = await supabase.rpc('get_stats_equipe', {
    p_manager_id: user.id,
    p_debut:      debut || null,
    p_fin:        fin   || null,
  }) as { data: StatsCommercial[] | null; error: unknown }

  const equipe = stats ?? []
  const nb = equipe.length

  // Totaux équipe
  const totaux = equipe.reduce(
    (acc, c) => ({
      sessions:  acc.sessions  + c.nb_sessions_realisees,
      planif:    acc.planif    + c.nb_sessions_planifiees,
      portes:    acc.portes    + c.nb_portes,
      contacts:  acc.contacts  + c.nb_contacts_terrain,
      mandats:   acc.mandats   + c.nb_mandats,
      chauds:    acc.chauds    + c.nb_contacts_chauds,
    }),
    { sessions: 0, planif: 0, portes: 0, contacts: 0, mandats: 0, chauds: 0 }
  )

  const PERIODES = [
    { value: 'semaine', label: 'Cette semaine' },
    { value: 'mois',    label: 'Ce mois' },
    { value: 'tout',    label: 'Tout' },
  ]

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1300, color: TEXT }}>

      {/* ── En-tête ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: TEXT, margin: 0 }}>
            Vue équipe
          </h1>
          <p style={{ color: MUTED, marginTop: 4, fontSize: '0.85rem' }}>
            {nb} commercial{nb > 1 ? 'x' : ''} · {
              periode === 'semaine' ? 'Semaine en cours' :
              periode === 'mois'    ? 'Mois en cours' :
                                     'Toute la période'
            }
          </p>
        </div>

        {/* Sélecteur de période */}
        <form method="GET" style={{ display: 'flex', gap: 4 }}>
          {PERIODES.map((p) => (
            <button
              key={p.value}
              name="periode"
              value={p.value}
              type="submit"
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem',
                fontWeight: periode === p.value ? 600 : 400,
                background: periode === p.value ? TEAL_BG : 'transparent',
                border: `1px solid ${periode === p.value ? TEAL_BDR : BORDER}`,
                color: periode === p.value ? TEAL : MUTED,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </form>
      </div>

      {/* ── KPIs totaux équipe ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Sessions réalisées', value: totaux.sessions, accent: TEAL, bg: TEAL_BG, border: TEAL_BDR },
          { label: 'Sessions planifiées', value: totaux.planif,  accent: GOLD, bg: GOLD_BG, border: GOLD_BDR },
          { label: 'Portes frappées',    value: totaux.portes,   accent: TEXT, bg: CARD_BG, border: BORDER },
          { label: 'Contacts terrain',   value: totaux.contacts, accent: TEAL, bg: TEAL_BG, border: TEAL_BDR },
          { label: 'Mandats signés',     value: totaux.mandats,  accent: GOLD, bg: GOLD_BG, border: GOLD_BDR },
          { label: 'Contacts chauds',    value: totaux.chauds,   accent: RED,  bg: RED_BG,  border: RED_BDR },
        ].map((kpi) => (
          <div key={kpi.label} style={{
            background: kpi.bg,
            border: `1px solid ${kpi.border}`,
            borderRadius: 10, padding: '16px 18px',
          }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: kpi.accent, lineHeight: 1 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: 6, lineHeight: 1.3 }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tableau par commercial ── */}
      {equipe.length === 0 ? (
        <div style={{
          background: CARD_BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: DIM,
        }}>
          <p style={{ fontSize: '0.95rem' }}>Aucun commercial dans votre équipe.</p>
        </div>
      ) : (
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {[
                  'Commercial', 'Sessions\nréalisées', 'Planifiées',
                  'Portes', 'Contacts', 'Mandats',
                  'Contacts\nchauds', 'Dernier passage', 'Couverture', '',
                ].map((h) => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontSize: '0.7rem', fontWeight: 600, color: DIM,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                    whiteSpace: 'pre',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipe.map((c, i) => {
                const inactif = !c.dernier_passage ||
                  (Date.now() - new Date(c.dernier_passage).getTime()) > 7 * 24 * 3600 * 1000

                return (
                  <tr key={c.commercial_id} style={{
                    borderBottom: i < equipe.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                  }}>
                    {/* Identité */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: inactif ? RED_BG : TEAL_BG,
                          border: `1.5px solid ${inactif ? RED_BDR : TEAL_BDR}`,
                          color: inactif ? RED : TEAL,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.68rem', fontWeight: 700,
                        }}>
                          {c.prenom?.[0]}{c.nom?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: TEXT }}>
                            {c.prenom} {c.nom}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: MUTED }}>{c.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Sessions réalisées */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '1rem', fontWeight: 700,
                        color: c.nb_sessions_realisees > 0 ? TEAL : DIM,
                      }}>
                        {c.nb_sessions_realisees}
                      </span>
                    </td>

                    {/* Planifiées */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.9rem', fontWeight: 600,
                        color: c.nb_sessions_planifiees > 0 ? GOLD : DIM,
                      }}>
                        {c.nb_sessions_planifiees}
                      </span>
                    </td>

                    {/* Portes */}
                    <td style={{ padding: '14px 16px', textAlign: 'center', color: TEXT, fontSize: '0.9rem', fontWeight: 500 }}>
                      {c.nb_portes || '—'}
                    </td>

                    {/* Contacts terrain */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: c.nb_contacts_terrain > 0 ? TEAL : DIM }}>
                        {c.nb_contacts_terrain || '—'}
                      </span>
                    </td>

                    {/* Mandats */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {c.nb_mandats > 0 ? (
                        <span style={{
                          fontSize: '0.82rem', fontWeight: 700, color: GOLD,
                          background: GOLD_BG, border: `1px solid ${GOLD_BDR}`,
                          borderRadius: 6, padding: '2px 8px',
                        }}>
                          {c.nb_mandats}
                        </span>
                      ) : (
                        <span style={{ color: DIM, fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>

                    {/* Contacts chauds */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {c.nb_contacts_chauds > 0 ? (
                        <span style={{
                          fontSize: '0.82rem', fontWeight: 700, color: RED,
                          background: RED_BG, border: `1px solid ${RED_BDR}`,
                          borderRadius: 6, padding: '2px 8px',
                        }}>
                          {c.nb_contacts_chauds}
                        </span>
                      ) : (
                        <span style={{ color: DIM, fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>

                    {/* Dernier passage */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: '0.78rem',
                        color: inactif ? RED : MUTED,
                        fontWeight: inactif ? 600 : 400,
                      }}>
                        {formatDate(c.dernier_passage)}
                        {inactif && c.dernier_passage && (
                          <span style={{ display: 'block', fontSize: '0.68rem', color: RED }}>
                            Inactif &gt;7j
                          </span>
                        )}
                      </span>
                    </td>

                    {/* Taux couverture */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: 'rgba(255,255,255,0.08)', minWidth: 40,
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${Math.min(c.taux_couverture_moyen, 100)}%`,
                            background: c.taux_couverture_moyen > 70 ? GOLD :
                                        c.taux_couverture_moyen > 30 ? TEAL : DIM,
                          }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: MUTED, flexShrink: 0 }}>
                          {c.taux_couverture_moyen}%
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td style={{ padding: '14px 16px' }}>
                      <a
                        href={`/manager/equipe/${c.commercial_id}`}
                        style={{
                          fontSize: '0.75rem', fontWeight: 600, color: TEAL,
                          textDecoration: 'none', padding: '5px 10px',
                          background: TEAL_BG, border: `1px solid ${TEAL_BDR}`,
                          borderRadius: 6, display: 'inline-block', whiteSpace: 'nowrap',
                        }}
                      >
                        Détail →
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
