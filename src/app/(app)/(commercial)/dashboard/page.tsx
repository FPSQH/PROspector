import DpeAlertsWidget from '@/components/dashboard/DpeAlertsWidget'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux').select('*').eq('id', user.id).single()
  if (!commercial) redirect('/login')

  const { data: communes } = await supabase
    .from('communes').select('id, nom, code_insee, chargee_at')
    .eq('commercial_id', commercial.id)

  if (!communes || communes.length === 0) redirect('/onboarding')

  const communesInsee = communes.map((c: any) => c.code_insee)

  const { count: nbAdresses } = await supabase
    .from('adresses').select('id', { count: 'exact', head: true })
    .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])

  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_prospectables, nb_adresses, capacite_theorique, statut')
    .eq('commercial_id', commercial.id)
    .order('numero')

  const nbZones            = zones?.length ?? 0
  const totalAdressesZones = (zones ?? []).reduce((s: number, z: any) => s + (z.nb_prospectables ?? 0), 0)

  // ✅ CORRECTION : lire les vraies sessions planifiées au lieu d'un calcul hardcodé
  const now      = new Date()
  const todayStr = now.toISOString().split('T')[0]

  const { data: prochainsSessions } = await supabase
    .from('planning_sessions')
    .select(`
      id, date_prevue, heure_debut, heure_fin, statut,
      zones_prospection:zone_id(id, nom, couleur, numero)
    `)
    .eq('commercial_id', commercial.id)
    .eq('statut', 'planifiee')
    .gte('date_prevue', todayStr)
    .order('date_prevue', { ascending: true })
    .limit(5)

  const prochaineSession  = prochainsSessions?.[0] ?? null
  const hasPlanning       = (prochainsSessions?.length ?? 0) > 0

  // ✅ Détection session en cours
const { data: sessionEnCoursArr } = await supabase
  .from('sessions_prospection')
  .select('id, zone_id, date_session, heure_debut, type_session, commune_nom, zones_prospection:zone_id(nom, couleur, numero)')
  .eq('commercial_id', commercial.id)
  .eq('statut', 'en_cours')
  .order('created_at', { ascending: false })
  .limit(1)

const sessionEnCours = sessionEnCoursArr?.[0] ?? null

  // ── Historique des 5 dernières sessions réalisées ─────────────────────────
  const { data: historiqueRaw } = await supabase
    .from('sessions_prospection')
    .select(`
      id, date_session, type_session, commune_nom, rapport_json, nb_portes,
      zones_prospection:zone_id(nom, couleur, numero)
    `)
    .eq('commercial_id', commercial.id)
    .eq('statut', 'realisee')
    .order('date_session', { ascending: false })
    .limit(5)

  const historique = historiqueRaw ?? []

  // Calcul jours restants depuis la vraie date_prevue
  const joursRestants = prochaineSession
    ? Math.max(0, Math.round(
        (new Date(prochaineSession.date_prevue + 'T12:00:00').getTime() - now.getTime()) / 86400000
      ))
    : null

  const nomJours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
  const prochainJourLabel = prochaineSession
    ? new Date(prochaineSession.date_prevue + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  const prochaineZone = prochaineSession?.zones_prospection as any

  const etape     = nbZones === 0 ? 'setup_zones' : 'pret'
  const isManager = commercial.role === 'manager'

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e7e0', padding: '0 28px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="dash-header">
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>Bonjour {commercial?.prenom} 👋</span>
          <span style={{ marginLeft: 12, fontSize: '0.8rem', color: '#9b9b96' }} className="dash-header-date">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <form action="/auth/signout" method="post">
          <button style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e8e7e0', background: 'transparent', fontSize: '0.78rem', color: '#9b9b96', cursor: 'pointer' }}>
            Déconnexion
          </button>
        </form>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }} className="dash-main">

        {/* Bannière manager */}
        {isManager && (
          <div style={{ background: '#fff', border: '1.5px solid #d1fae5', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18', marginBottom: 3 }}>👥 Espace manager</div>
              <div style={{ fontSize: '0.8rem', color: '#5F5E5A' }}>Gérez les comptes et les accès de votre équipe commerciale.</div>
            </div>
            <Link href="/admin/users" style={{ padding: '9px 18px', borderRadius: 8, background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', flexShrink: 0, marginLeft: 20 }}>
              Gérer l&apos;équipe →
            </Link>
          </div>
        )}

        {/* Bannière setup zones */}
        {etape === 'setup_zones' && (
          <div style={{ background: '#fff', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1a1a18', marginBottom: 4 }}>Configurez vos zones de prospection</div>
              <div style={{ fontSize: '0.82rem', color: '#5F5E5A' }}>
                {(nbAdresses ?? 0).toLocaleString('fr-FR')} adresses chargées sur {communes.length} commune{communes.length > 1 ? 's' : ''} — prêtes à être découpées en zones.
              </div>
            </div>
            <Link href="/zones" style={{ padding: '9px 18px', borderRadius: 8, background: '#1D9E75', color: '#fff', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', flexShrink: 0, marginLeft: 20 }}>
              Générer les zones →
            </Link>
          </div>
        )}

        {/* ✅ Bandeau session en cours */}
{sessionEnCours && (
  <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: '1.5rem' }}>⚠️</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e' }}>Session de prospection en cours</div>
        <div style={{ fontSize: '0.8rem', color: '#78350f', marginTop: 2 }}>
          {(sessionEnCours as any).zones_prospection
            ? `Zone ${(sessionEnCours as any).zones_prospection.numero} — ${(sessionEnCours as any).zones_prospection.nom}`
            : (sessionEnCours as any).commune_nom ?? 'Session libre'
          } · démarrée le {new Date((sessionEnCours as any).date_session).toLocaleDateString('fr-FR')} à {(sessionEnCours as any).heure_debut?.slice(0,5)}
        </div>
      </div>
    </div>
    <Link href="/terrain" style={{ padding: '9px 16px', borderRadius: 8, background: '#1D9E75', color: '#fff', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none', flexShrink: 0 }}>
      ▶ Reprendre →
    </Link>
  </div>
)}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 24 }} className="dash-kpis">
          {[
            { label: 'Communes',  value: communes.length,                                          sub: 'dans le secteur',  href: '/onboarding', color: '#2196F3' },
            { label: 'Adresses',  value: (nbAdresses ?? 0).toLocaleString('fr-FR'),               sub: 'chargées BAN',     href: null,          color: '#9b9b96' },
            { label: 'Zones',     value: nbZones,                                                  sub: nbZones === 0 ? 'à configurer' : `${totalAdressesZones.toLocaleString('fr-FR')} adresses`, href: '/zones', color: '#1D9E75', empty: nbZones === 0 },
            {
              label: 'Prochaine session',
              // ✅ Affiche la vraie date depuis planning_sessions
              value: !hasPlanning
                ? 'Non planifiée'
                : joursRestants === 0
                  ? "Aujourd'hui !"
                  : joursRestants === 1
                    ? 'Demain'
                    : `Dans ${joursRestants}j`,
              sub: hasPlanning && prochaineZone
                ? `${prochainJourLabel} — Z${prochaineZone.numero} ${prochaineZone.nom}`
                : hasPlanning
                  ? prochainJourLabel ?? ''
                  : 'Générer un planning →',
              href: !hasPlanning ? '/planning' : null,
              color: '#FF9800',
              empty: !hasPlanning,
            },
          ].map((kpi: any) => (
            <div key={kpi.label} style={{ background: kpi.empty ? '#fafaf8' : '#fff', border: `1px solid ${kpi.empty ? '#e8e7e0' : '#f0efeb'}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 500, color: '#9b9b96', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
              <div style={{ fontSize: kpi.empty ? '1rem' : '1.5rem', fontWeight: 700, color: kpi.empty ? '#c9c8c2' : '#1a1a18', lineHeight: 1, marginBottom: 4 }}>{kpi.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{kpi.sub}</div>
              {kpi.href && (
                <Link href={kpi.href} style={{ display: 'inline-block', marginTop: 8, fontSize: '0.72rem', color: kpi.color, textDecoration: 'none', fontWeight: 500 }}>
                  {kpi.empty ? 'Configurer →' : 'Voir →'}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Grille principale */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }} className="dash-grid">

          {/* Colonne gauche */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ✅ Prochaine tournée — depuis planning_sessions réelles */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0efeb', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>Prochaine tournée</h2>
                {hasPlanning && prochainJourLabel && (
                  <span style={{ background: '#f0fdf4', color: '#0F6E56', fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
                    {prochainJourLabel}
                  </span>
                )}
              </div>

              {nbZones === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9b9b96' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🗺️</div>
                  <p style={{ fontSize: '0.875rem', marginBottom: 12 }}>Configurez vos zones pour commencer à prospecter</p>
                  <Link href="/zones" style={{ padding: '8px 16px', borderRadius: 8, background: '#1D9E75', color: '#fff', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}>
                    Configurer les zones →
                  </Link>
                </div>
              ) : !hasPlanning ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9b9b96' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📅</div>
                  <p style={{ fontSize: '0.875rem', marginBottom: 12 }}>Aucune session planifiée à venir</p>
                  <Link href="/planning" style={{ padding: '8px 16px', borderRadius: 8, background: '#FF9800', color: '#fff', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}>
                    Générer le planning →
                  </Link>
                </div>
              ) : (
                <div>
                  {/* Sessions à venir */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {prochainsSessions?.slice(0, 3).map((s: any, idx: number) => {
                      const z   = s.zones_prospection
                      const dateLabel = new Date(s.date_prevue + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                      const jrs = Math.max(0, Math.round((new Date(s.date_prevue + 'T12:00:00').getTime() - now.getTime()) / 86400000))
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: idx === 0 ? '#f0fdf4' : '#f8f7f4', border: `1px solid ${idx === 0 ? '#bbf7d0' : '#e8e7e0'}` }}>
                          {z && <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.couleur, flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1a1a18', textTransform: 'capitalize' }}>{dateLabel}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9b9b96' }}>
                              {z ? `Zone ${z.numero} — ${z.nom}` : 'Zone non assignée'} · {s.heure_debut}–{s.heure_fin}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: idx === 0 ? '#0F6E56' : '#9b9b96', flexShrink: 0 }}>
                            {jrs === 0 ? "Aujourd'hui" : jrs === 1 ? 'Demain' : `J+${jrs}`}
                          </span>
                          {idx === 0 && z && (
                            <Link href={`/terrain?zone_id=${z.id}`} style={{ padding: '5px 10px', borderRadius: 6, background: '#1D9E75', color: '#fff', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                              Démarrer →
                            </Link>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <Link href="/planning" style={{ fontSize: '0.78rem', color: '#1D9E75', textDecoration: 'none', fontWeight: 500 }}>
                    Voir le planning complet →
                  </Link>
                </div>
              )}
            </div>

            {/* Widget DPE */}
            <DpeAlertsWidget />

            {/* Historique rapports de prospection */}
            {historique.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0efeb', padding: '20px 24px' }}>
                <h2 style={{ margin: '0 0 16px', fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>
                  Historique des sessions
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historique.map((s: any) => {
                    const z = s.zones_prospection
                    const r = s.rapport_json ?? {}
                    const dateLabel = new Date(s.date_session + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
                    const stats = [
                      { label: 'Portes',    value: r.nb_visites,             color: '#1D9E75' },
                      { label: 'Contacts',  value: r.nb_contacts,            color: '#3b82f6' },
                      { label: 'Maisons',   value: r.nb_maisons,             color: '#f59e0b' },
                      { label: 'Immeubles', value: r.nb_immeubles,           color: '#8b5cf6' },
                      { label: 'Suppr.',    value: r.nb_adresses_supprimees, color: '#9b9b96' },
                    ].filter(item => (item.value ?? 0) > 0)
                    return (
                      <div key={s.id} style={{ padding: '12px 14px', borderRadius: 10, background: '#f8f7f4', border: '1px solid #e8e7e0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats.length > 0 ? 8 : 0 }}>
                          {z
                            ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.couleur, flexShrink: 0 }} />
                            : <span style={{ fontSize: '0.8rem' }}>🚶</span>
                          }
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a1a18', flex: 1 }}>
                            {z ? `Z${z.numero} — ${z.nom}` : (s.commune_nom ?? 'Session libre')}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#9b9b96', flexShrink: 0, textTransform: 'capitalize' }}>
                            {dateLabel}
                          </span>
                        </div>
                        {stats.length > 0 ? (
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {stats.map(item => (
                              <span key={item.label} style={{
                                padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                                background: item.color + '22', color: item.color,
                              }}>
                                {item.value} {item.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#9b9b96', fontStyle: 'italic' }}>
                            Aucune interaction enregistrée
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Zones */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0efeb', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>Mes zones</h2>
                <Link href="/zones" style={{ fontSize: '0.75rem', color: '#1D9E75', textDecoration: 'none', fontWeight: 500 }}>Gérer →</Link>
              </div>
              {nbZones === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#9b9b96', textAlign: 'center', padding: '16px 0' }}>Aucune zone configurée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(zones ?? []).slice(0, 6).map((z: any) => (
                    <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.couleur, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.nom}</div>
                        <div style={{ fontSize: '0.7rem', color: '#9b9b96' }}>{z.nb_prospectables ?? 0} adresses</div>
                      </div>
                      <Link href={`/terrain?zone_id=${z.id}`} style={{ fontSize: '0.7rem', color: '#1D9E75', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>
                        →
                      </Link>
                    </div>
                  ))}
                  {nbZones > 6 && <p style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 4 }}>+{nbZones - 6} autres zones</p>}
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
