import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!commercial) redirect('/login')

  const { data: communes } = await supabase
    .from('communes')
    .select('id, nom, code_insee, chargee_at')
    .eq('commercial_id', commercial.id)

  if (!communes || communes.length === 0) redirect('/onboarding')

  const communesInsee = communes.map((c: any) => c.code_insee)

  const { count: nbAdresses } = await supabase
    .from('adresses')
    .select('id', { count: 'exact', head: true })
    .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])

  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_prospectables, nb_adresses, capacite_theorique, statut')
    .eq('commercial_id', commercial.id)
    .order('numero')

  const nbZones = zones?.length ?? 0
  const totalAdressesZones = (zones ?? []).reduce((s: number, z: any) => s + (z.nb_prospectables ?? 0), 0)

  const now    = new Date()
  const jourSemaine = now.getDay() // 0=dim, 2=mar, 3=mer, 5=ven
  const joursProspection = [2, 3, 5]
  const prochainJour = joursProspection.find((j) => j > jourSemaine)
    ?? joursProspection[0]
  const joursRestants = prochainJour > jourSemaine
    ? prochainJour - jourSemaine
    : 7 - jourSemaine + prochainJour
  const nomJours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']

  // Zone recommandée = première zone (ordre de rotation)
  const zoneRecommandee = zones?.[0] ?? null

  // Déterminer l'étape actuelle du commercial
  const etape = nbZones === 0 ? 'setup_zones'
    : 'pret'

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4' }}>

      {/* ── Header page (léger, sans logo — AppShell gère la nav) ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 28px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>
            Bonjour {commercial?.prenom} 👋
          </span>
          <span style={{ marginLeft: 12, fontSize: '0.8rem', color: '#9b9b96' }}>
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <form action="/auth/signout" method="post">
          <button style={{
            padding: '5px 12px', borderRadius: 7,
            border: '1px solid #e8e7e0', background: 'transparent',
            fontSize: '0.78rem', color: '#9b9b96', cursor: 'pointer',
          }}>
            Déconnexion
          </button>
        </form>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>

        {/* ── Bannière setup si pas de zones ── */}
        {etape === 'setup_zones' && (
          <div style={{
            background: '#fff', border: '1.5px solid #bbf7d0',
            borderRadius: 12, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24,
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1a1a18', marginBottom: 4 }}>
                Configurez vos zones de prospection
              </div>
              <div style={{ fontSize: '0.82rem', color: '#5F5E5A' }}>
                {(nbAdresses ?? 0).toLocaleString('fr-FR')} adresses chargées sur {communes.length} commune{communes.length > 1 ? 's' : ''} — prêtes à être découpées en zones.
              </div>
            </div>
            <Link href="/zones" style={{
              padding: '9px 18px', borderRadius: 8,
              background: '#1D9E75', color: '#fff',
              fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none',
              flexShrink: 0, marginLeft: 20,
            }}>
              Générer les zones →
            </Link>
          </div>
        )}

        {/* ── KPIs ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12, marginBottom: 24,
        }}>
          {[
            {
              label: 'Communes',
              value: communes.length,
              sub:   'dans le secteur',
              href:  '/onboarding',
              color: '#2196F3',
            },
            {
              label: 'Adresses',
              value: (nbAdresses ?? 0).toLocaleString('fr-FR'),
              sub:   'chargées BAN',
              href:  null,
              color: '#9b9b96',
            },
            {
              label: 'Zones',
              value: nbZones,
              sub:   nbZones === 0 ? 'à configurer' : `${totalAdressesZones.toLocaleString('fr-FR')} adresses`,
              href:  '/zones',
              color: '#1D9E75',
              empty: nbZones === 0,
            },
            {
              label: 'Prochaine session',
              value: joursRestants === 0 ? "Aujourd'hui" : `Dans ${joursRestants}j`,
              sub:   `${nomJours[prochainJour]} 10h–12h`,
              href:  null,
              color: '#FF9800',
            },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: kpi.empty ? '#fafaf8' : '#fff',
              border: `1px solid ${kpi.empty ? '#e8e7e0' : '#f0efeb'}`,
              borderRadius: 12, padding: '16px 18px',
            }}>
              <div style={{
                fontSize: '0.72rem', fontWeight: 500,
                color: '#9b9b96', marginBottom: 6,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {kpi.label}
              </div>
              <div style={{
                fontSize: '1.5rem', fontWeight: 700,
                color: kpi.empty ? '#c9c8c2' : '#1a1a18',
                lineHeight: 1, marginBottom: 4,
              }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9b9b96' }}>
                {kpi.sub}
              </div>
              {kpi.href && (
                <Link href={kpi.href} style={{
                  display: 'inline-block', marginTop: 8,
                  fontSize: '0.72rem', color: kpi.color,
                  textDecoration: 'none', fontWeight: 500,
                }}>
                  {kpi.empty ? 'Configurer →' : 'Voir →'}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* ── Grille principale ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

          {/* Colonne gauche */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Prochaine tournée */}
            <div style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid #f0efeb', padding: '20px 24px',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 16,
              }}>
                <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>
                  Prochaine tournée
                </h2>
                <span style={{
                  background: '#f0fdf4', color: '#0F6E56',
                  fontSize: '0.72rem', fontWeight: 600,
                  padding: '3px 8px', borderRadius: 6,
                }}>
                  {nomJours[prochainJour].charAt(0).toUpperCase() + nomJours[prochainJour].slice(1)} 10h–12h
                </span>
              </div>

              {nbZones === 0 ? (
                /* Empty state */
                <div style={{
                  textAlign: 'center', padding: '32px 0',
                  border: '1.5px dashed #e8e7e0', borderRadius: 10,
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🗺️</div>
                  <div style={{ fontSize: '0.875rem', color: '#5F5E5A', marginBottom: 4 }}>
                    Aucune zone configurée
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#9b9b96', marginBottom: 16 }}>
                    Générez vos zones pour planifier vos tournées
                  </div>
                  <Link href="/zones" style={{
                    padding: '8px 16px', borderRadius: 8,
                    background: '#1D9E75', color: '#fff',
                    fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none',
                  }}>
                    Générer les zones
                  </Link>
                </div>
              ) : zoneRecommandee ? (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  gap: 16, padding: '14px 16px',
                  background: '#f8fffe', borderRadius: 10,
                  border: '1px solid #e1f5ee',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: zoneRecommandee.couleur + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: zoneRecommandee.couleur,
                    }}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18' }}>
                      {zoneRecommandee.nom}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#5F5E5A', marginTop: 2 }}>
                      {zoneRecommandee.nb_prospectables} adresses · créneau 10h–12h
                    </div>
                  </div>
                  <Link href="/zones" style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: '#1D9E75', color: '#fff',
                    fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none',
                    flexShrink: 0,
                  }}>
                    Démarrer →
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Mes zones */}
            <div style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid #f0efeb', padding: '20px 24px',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 16,
              }}>
                <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>
                  Mes zones
                </h2>
                <Link href="/zones" style={{
                  fontSize: '0.78rem', color: '#1D9E75', textDecoration: 'none',
                }}>
                  Gérer →
                </Link>
              </div>

              {nbZones === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '24px 0',
                  color: '#9b9b96', fontSize: '0.82rem',
                }}>
                  Aucune zone — <Link href="/zones" style={{ color: '#1D9E75' }}>générer maintenant</Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(zones ?? []).slice(0, 8).map((z: any) => {
                    const cible    = z.capacite_theorique ?? 150
                    const val      = z.nb_prospectables ?? 0
                    const ratio    = cible > 0 ? val / cible : 0
                    const barColor = ratio > 2   ? '#ef4444'
                      : ratio > 1.3 ? '#f59e0b'
                      : '#1D9E75'
                    const pct = Math.min(ratio * 100, 100)

                    return (
                      <div key={z.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: z.couleur, flexShrink: 0,
                        }}/>
                        <div style={{
                          fontSize: '0.78rem', color: '#1a1a18',
                          width: 70, flexShrink: 0,
                        }}>
                          {z.nom}
                        </div>
                        <div style={{
                          flex: 1, height: 5, background: '#f0efeb',
                          borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: barColor, borderRadius: 3,
                          }}/>
                        </div>
                        <div style={{
                          fontSize: '0.72rem', color: '#9b9b96',
                          width: 36, textAlign: 'right', flexShrink: 0,
                        }}>
                          {val}
                        </div>
                      </div>
                    )
                  })}
                  {nbZones > 8 && (
                    <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 4 }}>
                      +{nbZones - 8} zones · <Link href="/zones" style={{ color: '#1D9E75' }}>voir tout</Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Secteur */}
            <div style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid #f0efeb', padding: '20px 24px',
            }}>
              <h2 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>
                Mon secteur
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {communes.map((c: any) => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.82rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: c.chargee_at ? '#1D9E75' : '#f59e0b',
                        flexShrink: 0,
                      }}/>
                      <span style={{ color: '#1a1a18' }}>{c.nom}</span>
                    </div>
                    <span style={{ color: '#9b9b96', fontSize: '0.72rem' }}>
                      {c.chargee_at ? 'BAN chargé' : 'En cours…'}
                    </span>
                  </div>
                ))}
              </div>
              <Link href="/onboarding" style={{
                display: 'block', marginTop: 12,
                fontSize: '0.75rem', color: '#1D9E75', textDecoration: 'none',
              }}>
                Gérer le secteur →
              </Link>
            </div>

            {/* Actions rapides */}
            <div style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid #f0efeb', padding: '20px 24px',
            }}>
              <h2 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>
                Actions rapides
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { href: '/zones',      label: 'Voir les zones',        icon: '🗺️', active: true },
                  { href: '/zones/edit', label: 'Éditer les zones',      icon: '✏️', active: nbZones > 0 },
                  { href: '/onboarding', label: 'Gérer le secteur',      icon: '🏘️', active: true },
                ].map((action) => (
                  action.active ? (
                    <Link key={action.href} href={action.href} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      background: '#f8f7f4', textDecoration: 'none',
                      fontSize: '0.82rem', color: '#1a1a18',
                    }}>
                      <span style={{ fontSize: '14px' }}>{action.icon}</span>
                      {action.label}
                      <span style={{ marginLeft: 'auto', color: '#9b9b96' }}>→</span>
                    </Link>
                  ) : (
                    <div key={action.href} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      background: '#fafaf8',
                      fontSize: '0.82rem', color: '#c9c8c2',
                      cursor: 'not-allowed',
                    }}>
                      <span style={{ fontSize: '14px', opacity: 0.4 }}>{action.icon}</span>
                      {action.label}
                      <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: '#d1d0c8' }}>bientôt</span>
                    </div>
                  )
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
