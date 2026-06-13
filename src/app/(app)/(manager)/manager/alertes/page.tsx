import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString()
}

export default async function ManagerAlertesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: equipe } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, derniere_connexion')
    .eq('manager_id', user.id)
    .order('nom')

  const teamIds = (equipe ?? []).map((c) => c.id)

  if (teamIds.length === 0) {
    return (
      <div style={{ padding: '32px 40px', color: '#F0F0F2' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Alertes</h1>
        <p style={{ color: '#6B6B7B', marginTop: 8 }}>Aucun commercial dans votre équipe.</p>
      </div>
    )
  }

  const [
    { data: sessionsNonRealisees },
    { data: contactsChauds },
    { data: zonesActives },
    { data: sessionsRecentes },
  ] = await Promise.all([
    supabase
      .from('sessions_prospection')
      .select('id, commercial_id, date_session')
      .in('commercial_id', teamIds)
      .eq('statut', 'non_realisee')
      .gte('date_session', daysAgo(30))
      .order('date_session', { ascending: false }),

    supabase
      .from('contacts')
      .select('id, commercial_id, prenom, horizon_vente, created_at')
      .in('commercial_id', teamIds)
      .in('horizon_vente', ['immediat', '3_mois'])
      .order('created_at', { ascending: false }),

    supabase
      .from('zones_prospection')
      .select('id, commercial_id, nom, numero, nb_adresses, nb_portes_total, nb_prospectables')
      .in('commercial_id', teamIds)
      .eq('statut', 'active'),

    supabase
      .from('sessions_prospection')
      .select('zone_id')
      .in('commercial_id', teamIds)
      .in('statut', ['realisee', 'en_cours'])
      .gte('date_session', daysAgo(30)),
  ])

  // --- Calculs ---
  const inactifs = (equipe ?? []).filter((c) =>
    !c.derniere_connexion ||
    Date.now() - new Date(c.derniere_connexion).getTime() > 7 * 24 * 3600 * 1000
  )

  const snrParCommercial: Record<string, { id: string; date_session: string }[]> = {}
  for (const s of sessionsNonRealisees ?? []) {
    if (!snrParCommercial[s.commercial_id]) snrParCommercial[s.commercial_id] = []
    snrParCommercial[s.commercial_id]!.push(s)
  }

  const zonesSaturees = (zonesActives ?? []).filter((z) => {
    const denom = (z.nb_prospectables ?? 0) > 0 ? z.nb_prospectables : z.nb_adresses
    if (!denom) return false
    return (z.nb_portes_total ?? 0) / denom > 0.8
  })

  const zonesAvecSession = new Set((sessionsRecentes ?? []).map((s) => s.zone_id))
  const zonesInactives = (zonesActives ?? []).filter((z) => !zonesAvecSession.has(z.id))

  const nomCommercial = (id: string) => {
    const c = equipe?.find((x) => x.id === id)
    return c ? `${c.prenom} ${c.nom}` : '—'
  }

  const totalAlertes =
    inactifs.length +
    Object.keys(snrParCommercial).length +
    (contactsChauds?.length ?? 0) +
    zonesSaturees.length +
    zonesInactives.length

  // --- Styles ---
  const ORANGE = '#D97706', ORANGE_BG = 'rgba(217,119,6,0.08)', ORANGE_BDR = 'rgba(217,119,6,0.25)'
  const RED    = '#EF4444', RED_BG    = 'rgba(239,68,68,0.08)',  RED_BDR    = 'rgba(239,68,68,0.25)'
  const TEAL   = '#1D9E75', TEAL_BG   = 'rgba(29,158,117,0.08)', TEAL_BDR   = 'rgba(29,158,117,0.25)'
  const PURPLE = '#A855F7', PURPLE_BG = 'rgba(168,85,247,0.08)', PURPLE_BDR = 'rgba(168,85,247,0.25)'
  const TEXT   = '#F0F0F2', MUTED = '#6B6B7B', BORDER = 'rgba(255,255,255,0.06)'

  return (
    <div style={{ padding: '32px 40px', maxWidth: 860, color: TEXT }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Alertes</h1>
        <p style={{ color: MUTED, marginTop: 4, fontSize: '0.85rem' }}>
          {totalAlertes === 0
            ? 'Aucune alerte — tout est en ordre ✓'
            : `${totalAlertes} signal${totalAlertes > 1 ? 'aux' : ''} à traiter`}
        </p>
      </div>

      {totalAlertes === 0 && (
        <div style={{
          background: TEAL_BG, border: `1px solid ${TEAL_BDR}`,
          borderRadius: 12, padding: '40px 32px', textAlign: 'center',
          color: TEAL, fontWeight: 600,
        }}>
          Votre équipe est en bonne forme — aucun signal faible détecté.
        </div>
      )}

      {/* 1. Commerciaux inactifs */}
      {inactifs.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Commerciaux inactifs &gt; 7 jours
            </span>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99,
              background: RED_BG, border: `1px solid ${RED_BDR}`, color: RED,
            }}>{inactifs.length}</span>
          </div>
          {inactifs.map((c) => (
            <div key={c.id} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${RED}`, borderRadius: 8, padding: '12px 16px', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>{c.prenom} {c.nom}</span>
                <span style={{ color: MUTED, fontSize: '0.82rem', marginLeft: 10 }}>
                  {c.derniere_connexion
                    ? `Dernière connexion : ${new Date(c.derniere_connexion).toLocaleDateString('fr-FR')}`
                    : 'Jamais connecté'}
                </span>
              </div>
              <a href={`/manager/equipe/${c.id}`} style={{
                fontSize: '0.78rem', fontWeight: 600, color: RED,
                textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
                background: RED_BG, border: `1px solid ${RED_BDR}`,
              }}>Voir la fiche →</a>
            </div>
          ))}
        </section>
      )}

      {/* 2. Sessions non réalisées */}
      {Object.keys(snrParCommercial).length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sessions non réalisées — 30 derniers jours
            </span>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99,
              background: ORANGE_BG, border: `1px solid ${ORANGE_BDR}`, color: ORANGE,
            }}>{sessionsNonRealisees?.length ?? 0}</span>
          </div>
          {Object.entries(snrParCommercial).map(([cid, sessions]) => (
            <div key={cid} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${ORANGE}`, borderRadius: 8, padding: '12px 16px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{nomCommercial(cid)}</span>
                  <span style={{ color: MUTED, fontSize: '0.82rem', marginLeft: 10 }}>
                    {sessions.length} session{sessions.length > 1 ? 's' : ''} non réalisée{sessions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <a href={`/manager/equipe/${cid}`} style={{
                  fontSize: '0.78rem', fontWeight: 600, color: ORANGE,
                  textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
                  background: ORANGE_BG, border: `1px solid ${ORANGE_BDR}`,
                }}>Voir la fiche →</a>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sessions.slice(0, 5).map((s) => (
                  <span key={s.id} style={{
                    fontSize: '0.72rem', color: ORANGE, padding: '2px 8px', borderRadius: 4,
                    background: ORANGE_BG, border: `1px solid ${ORANGE_BDR}`,
                  }}>
                    {new Date(s.date_session).toLocaleDateString('fr-FR')}
                  </span>
                ))}
                {sessions.length > 5 && (
                  <span style={{ fontSize: '0.72rem', color: MUTED }}>+{sessions.length - 5} autres</span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 3. Contacts chauds */}
      {(contactsChauds?.length ?? 0) > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Contacts chauds à relancer
            </span>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99,
              background: PURPLE_BG, border: `1px solid ${PURPLE_BDR}`, color: PURPLE,
            }}>{contactsChauds!.length}</span>
          </div>
          {contactsChauds!.slice(0, 10).map((c) => (
            <div key={c.id} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${PURPLE}`, borderRadius: 8, padding: '12px 16px', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>{c.prenom ?? 'Contact'}</span>
                <span style={{ color: MUTED, fontSize: '0.82rem', marginLeft: 8 }}>
                  chez {nomCommercial(c.commercial_id)}
                </span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 600, marginLeft: 10, padding: '2px 8px', borderRadius: 4,
                  background: PURPLE_BG, border: `1px solid ${PURPLE_BDR}`, color: PURPLE,
                }}>
                  {c.horizon_vente === 'immediat' ? 'Immédiat' : '3 mois'}
                </span>
              </div>
              <span style={{ color: MUTED, fontSize: '0.78rem' }}>
                {new Date(c.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
          {contactsChauds!.length > 10 && (
            <p style={{ color: MUTED, fontSize: '0.82rem', marginTop: 8 }}>
              + {contactsChauds!.length - 10} autres contacts chauds
            </p>
          )}
        </section>
      )}

      {/* 4. Zones saturées */}
      {zonesSaturees.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Zones saturées — couverture &gt; 80%
            </span>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99,
              background: ORANGE_BG, border: `1px solid ${ORANGE_BDR}`, color: ORANGE,
            }}>{zonesSaturees.length}</span>
          </div>
          {zonesSaturees.map((z) => {
            const denom = (z.nb_prospectables ?? 0) > 0 ? z.nb_prospectables : z.nb_adresses
            const taux  = denom ? Math.round(((z.nb_portes_total ?? 0) / denom) * 100) : 0
            return (
              <div key={z.id} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
                borderLeft: `3px solid ${ORANGE}`, borderRadius: 8, padding: '12px 16px', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontWeight: 600 }}>Zone {z.numero} — {z.nom}</span>
                  <span style={{ color: MUTED, fontSize: '0.82rem', marginLeft: 8 }}>
                    ({nomCommercial(z.commercial_id)})
                  </span>
                </div>
                <span style={{
                  fontSize: '0.82rem', fontWeight: 700, color: ORANGE,
                  padding: '3px 10px', borderRadius: 6,
                  background: ORANGE_BG, border: `1px solid ${ORANGE_BDR}`,
                }}>
                  {taux}% couvert
                </span>
              </div>
            )
          })}
        </section>
      )}

      {/* 5. Zones inactives */}
      {zonesInactives.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Zones sans prospection depuis 30 jours
            </span>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99,
              background: TEAL_BG, border: `1px solid ${TEAL_BDR}`, color: TEAL,
            }}>{zonesInactives.length}</span>
          </div>
          {zonesInactives.map((z) => (
            <div key={z.id} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${TEAL}`, borderRadius: 8, padding: '12px 16px', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>Zone {z.numero} — {z.nom}</span>
                <span style={{ color: MUTED, fontSize: '0.82rem', marginLeft: 8 }}>
                  ({nomCommercial(z.commercial_id)})
                </span>
              </div>
              <a href={`/manager/delegation/${z.commercial_id}`} style={{
                fontSize: '0.78rem', fontWeight: 600, color: TEAL,
                textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
                background: TEAL_BG, border: `1px solid ${TEAL_BDR}`,
              }}>Agir →</a>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
