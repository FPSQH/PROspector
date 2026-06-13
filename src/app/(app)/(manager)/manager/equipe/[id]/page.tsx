import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'

// ── Helpers ───────────────────────────────────────────────────
function getPeriodeDates(periode: string) {
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
  return { debut: '', fin: '' }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Couleurs ─────────────────────────────────────────────────
const TEAL = '#1D9E75', TEAL_BG = 'rgba(29,158,117,0.1)', TEAL_BDR = 'rgba(29,158,117,0.2)'
const GOLD = '#D97706', GOLD_BG = 'rgba(217,119,6,0.1)',  GOLD_BDR = 'rgba(217,119,6,0.2)'
const RED  = '#EF4444', RED_BG  = 'rgba(239,68,68,0.1)',  RED_BDR  = 'rgba(239,68,68,0.2)'
const BORDER = 'rgba(255,255,255,0.06)', TEXT = '#F0F0F2', MUTED = '#6B6B7B', DIM = '#4A4A58'
const CARD_BG = '#141416'

const STATUT_LABEL: Record<string, string> = {
  planifiee: 'Planifiée', en_cours: 'En cours', realisee: 'Réalisée',
  annulee: 'Annulée', non_realisee: 'Non réalisée',
}
const STATUT_COLOR: Record<string, string> = {
  planifiee: GOLD, en_cours: TEAL, realisee: TEAL,
  annulee: DIM, non_realisee: RED,
}
const HORIZON_LABEL: Record<string, string> = {
  immediat: 'Immédiat', '3_mois': '3 mois', '6_mois': '6 mois',
  '1_an': '1 an', plus: '+ 1 an',
}
const HORIZON_COLOR: Record<string, string> = {
  immediat: RED, '3_mois': GOLD, '6_mois': GOLD, '1_an': MUTED, plus: DIM,
}

// ── Page ──────────────────────────────────────────────────────
export default async function FicheCommercialePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periode?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: commercialId } = await params
  const { periode: periodeParam } = await searchParams
  const periode = periodeParam ?? 'mois'
  const { debut, fin } = getPeriodeDates(periode)

  // Vérifie que ce commercial appartient bien à l'équipe du manager
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, email, telephone, agence_nom, agence_adresse, agence_telephone, derniere_connexion, role')
    .eq('id', commercialId)
    .eq('manager_id', user.id)
    .single()

  if (!commercial) notFound()

  // Chargement parallèle des données
  const [
    { data: zones },
    { data: sessionsRecentes },
    { data: contactsChauds },
    { data: statsRpc },
  ] = await Promise.all([
    // Zones actives avec stats
    supabase
      .from('zones_prospection')
      .select('id, nom, numero, couleur, statut, nb_adresses, nb_prospectables, nb_portes_total, nb_contacts_total')
      .eq('commercial_id', commercialId)
      .eq('statut', 'active')
      .order('numero'),

    // 8 dernières sessions
    supabase
      .from('sessions_prospection')
      .select('id, date_session, statut, heure_debut, heure_fin, zone_id, zones_prospection(nom)')
      .eq('commercial_id', commercialId)
      .order('date_session', { ascending: false })
      .limit(8),

    // Contacts chauds sans RDV
    supabase
      .from('contacts')
      .select('id, prenom, type_contact, horizon_vente, notes, created_at')
      .eq('commercial_id', commercialId)
      .in('horizon_vente', ['immediat', '3_mois', '6_mois'])
      .order('created_at', { ascending: false })
      .limit(10),

    // Tentative RPC pour KPIs période
    supabase.rpc('get_stats_equipe', {
      p_manager_id: user.id,
      p_debut: debut || null,
      p_fin:   fin   || null,
    }),
  ])

  // Stats individuelles depuis la RPC ou fallback à 0
  const statsCommercial = (statsRpc as { commercial_id: string; nb_sessions_realisees: number; nb_sessions_planifiees: number; nb_portes: number; nb_contacts_terrain: number; nb_mandats: number; nb_contacts_chauds: number }[] | null)
    ?.find((s) => s.commercial_id === commercialId)

  const kpis = statsCommercial ?? {
    nb_sessions_realisees: 0, nb_sessions_planifiees: 0,
    nb_portes: 0, nb_contacts_terrain: 0, nb_mandats: 0, nb_contacts_chauds: 0,
  }

  const PERIODES = [
    { value: 'semaine', label: 'Semaine' },
    { value: 'mois',    label: 'Ce mois' },
    { value: 'tout',    label: 'Tout' },
  ]

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, color: TEXT, background: '#0C0C0E', minHeight: '100%' }}>

      {/* ── Navigation retour ── */}
      <a href="/manager/dashboard" style={{ fontSize: '0.8rem', color: MUTED, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7L9 12" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Vue équipe
      </a>

      {/* ── En-tête commercial ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: TEAL_BG, border: `2px solid ${TEAL_BDR}`, color: TEAL,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', fontWeight: 700, flexShrink: 0,
          }}>
            {commercial.prenom?.[0]}{commercial.nom?.[0]}
          </div>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
              {commercial.prenom} {commercial.nom}
            </h1>
            <div style={{ fontSize: '0.82rem', color: MUTED, marginTop: 3 }}>
              {commercial.email}
              {commercial.telephone && ` · ${commercial.telephone}`}
            </div>
            {commercial.agence_nom && (
              <div style={{ fontSize: '0.78rem', color: DIM, marginTop: 2 }}>
                {commercial.agence_nom}
                {commercial.agence_adresse && ` — ${commercial.agence_adresse}`}
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: DIM, marginTop: 4 }}>
              Dernière connexion : {formatDateTime(commercial.derniere_connexion)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Sélecteur période */}
          <form method="GET" style={{ display: 'flex', gap: 4 }}>
            {PERIODES.map((p) => (
              <button key={p.value} name="periode" value={p.value} type="submit" style={{
                padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem',
                fontWeight: periode === p.value ? 600 : 400,
                background: periode === p.value ? TEAL_BG : 'transparent',
                border: `1px solid ${periode === p.value ? TEAL_BDR : BORDER}`,
                color: periode === p.value ? TEAL : MUTED, cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </form>

          {/* Bouton délégation */}
          <a href={`/manager/delegation/${commercialId}`} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            background: GOLD_BG, border: `1px solid ${GOLD_BDR}`, color: GOLD,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Agir en tant que →
          </a>
        </div>
      </div>

      {/* ── KPIs période ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 28 }}>
        {[
          { label: 'Sessions réalisées', value: kpis.nb_sessions_realisees, color: TEAL, bg: TEAL_BG, border: TEAL_BDR },
          { label: 'Sessions planifiées', value: kpis.nb_sessions_planifiees, color: GOLD, bg: GOLD_BG, border: GOLD_BDR },
          { label: 'Portes frappées',    value: kpis.nb_portes,             color: TEXT, bg: CARD_BG, border: BORDER },
          { label: 'Contacts terrain',   value: kpis.nb_contacts_terrain,   color: TEAL, bg: TEAL_BG, border: TEAL_BDR },
          { label: 'Mandats signés',     value: kpis.nb_mandats,            color: GOLD, bg: GOLD_BG, border: GOLD_BDR },
          { label: 'Contacts chauds',    value: kpis.nb_contacts_chauds,    color: RED,  bg: RED_BG,  border: RED_BDR },
        ].map((k) => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: '0.7rem', color: MUTED, marginTop: 5, lineHeight: 1.3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* ── Zones actives ── */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Zones actives</span>
            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: MUTED }}>{zones?.length ?? 0}</span>
          </div>
          {!zones?.length ? (
            <div style={{ padding: '24px 20px', color: DIM, fontSize: '0.85rem' }}>Aucune zone active.</div>
          ) : (
            <div>
              {zones.map((z, i) => {
                const couverture = z.nb_prospectables > 0
                  ? Math.round(z.nb_contacts_total / z.nb_prospectables * 100)
                  : 0
                return (
                  <div key={z.id} style={{
                    padding: '14px 20px',
                    borderBottom: i < zones.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: z.couleur ?? TEAL,
                      }} />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{z.nom}</div>
                        <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: 1 }}>
                          {z.nb_adresses ?? 0} adresses · {z.nb_contacts_total ?? 0} contacts
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: couverture > 70 ? GOLD : couverture > 30 ? TEAL : DIM }}>
                        {couverture}%
                      </div>
                      <div style={{ fontSize: '0.68rem', color: DIM }}>couverture</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Sessions récentes ── */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sessions récentes</span>
          </div>
          {!sessionsRecentes?.length ? (
            <div style={{ padding: '24px 20px', color: DIM, fontSize: '0.85rem' }}>Aucune session.</div>
          ) : (
            <div>
              {sessionsRecentes.map((s, i) => {
                const zone = s.zones_prospection as { nom: string } | null
                return (
                  <div key={s.id} style={{
                    padding: '12px 20px',
                    borderBottom: i < sessionsRecentes.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        {formatDate(s.date_session)}
                        {zone && <span style={{ color: MUTED }}> · {zone.nom}</span>}
                      </div>
                      {s.heure_debut && (
                        <div style={{ fontSize: '0.7rem', color: DIM, marginTop: 1 }}>
                          {s.heure_debut}{s.heure_fin ? ` → ${s.heure_fin}` : ''}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px',
                      borderRadius: 5, background: `${STATUT_COLOR[s.statut] ?? DIM}18`,
                      color: STATUT_COLOR[s.statut] ?? DIM,
                      border: `1px solid ${STATUT_COLOR[s.statut] ?? DIM}30`,
                    }}>
                      {STATUT_LABEL[s.statut] ?? s.statut}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Contacts chauds ── */}
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Contacts chauds</span>
            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: MUTED }}>horizon ≤ 6 mois</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: RED }}>{contactsChauds?.length ?? 0} contact{(contactsChauds?.length ?? 0) > 1 ? 's' : ''}</span>
        </div>
        {!contactsChauds?.length ? (
          <div style={{ padding: '24px 20px', color: DIM, fontSize: '0.85rem' }}>Aucun contact chaud.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Prénom', 'Type', 'Horizon', 'Note', 'Ajouté le'].map((h) => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: DIM, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contactsChauds.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < contactsChauds.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none' }}>
                  <td style={{ padding: '12px 20px', fontWeight: 600, fontSize: '0.85rem' }}>{c.prenom || '—'}</td>
                  <td style={{ padding: '12px 20px', fontSize: '0.8rem', color: MUTED }}>{c.type_contact?.replace(/_/g, ' ') ?? '—'}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                      background: `${HORIZON_COLOR[c.horizon_vente] ?? DIM}18`,
                      color: HORIZON_COLOR[c.horizon_vente] ?? DIM,
                      border: `1px solid ${HORIZON_COLOR[c.horizon_vente] ?? DIM}30`,
                    }}>
                      {HORIZON_LABEL[c.horizon_vente] ?? c.horizon_vente}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '0.78rem', color: MUTED, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.notes || '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '0.78rem', color: DIM }}>{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
