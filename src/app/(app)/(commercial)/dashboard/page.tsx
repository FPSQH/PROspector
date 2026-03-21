import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Vérifier si le commercial a des communes configurées
  const { count } = await supabase
    .from('communes')
    .select('id', { count: 'exact', head: true })
    .eq('commercial_id', user.id)

  // Pas de communes → onboarding
  if (!count || count === 0) {
    redirect('/onboarding')
  }

  // Récupérer les données du dashboard
  const [{ data: commercial }, { data: communes }, { data: sessions }] = await Promise.all([
    supabase.from('commerciaux').select('*').eq('id', user.id).single(),
    supabase.from('communes').select('*').eq('commercial_id', user.id).order('nom'),
    supabase.from('sessions_prospection')
      .select('*, zone:zones_prospection(nom, couleur)')
      .eq('commercial_id', user.id)
      .gte('date_session', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date_session', { ascending: true })
      .limit(10),
  ])

  const communesInsee = (communes ?? []).map((c: any) => c.code_insee)
  const { count: nbAdresses } = await supabase
    .from('adresses')
    .select('id', { count: 'exact', head: true })
    .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4' }}>
      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#1D9E75',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
              <path d="M12 22V12M2 7l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>PROspector</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: '0.875rem', color: '#5F5E5A' }}>
            {commercial?.prenom} {commercial?.nom}
          </span>
          <form action="/auth/signout" method="post">
            <button style={{
              padding: '6px 12px', borderRadius: 7, border: '1px solid #e8e7e0',
              background: 'transparent', fontSize: '0.8rem', color: '#5F5E5A', cursor: 'pointer',
            }}>
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      {/* Contenu */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color: '#1a1a18' }}>
            Bonjour {commercial?.prenom}
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#9b9b96', marginTop: 2 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Cartes stat */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Communes', value: communes?.length ?? 0, icon: '🗺️', sub: 'dans le secteur' },
            { label: 'Adresses', value: (nbAdresses ?? 0).toLocaleString('fr-FR'), icon: '📍', sub: 'chargées BAN' },
            { label: 'Sessions', value: sessions?.filter((s: any) => s.statut === 'realisee').length ?? 0, icon: '✅', sub: 'réalisées ce mois' },
            { label: 'Sessions', value: sessions?.filter((s: any) => s.statut === 'planifiee').length ?? 0, icon: '📅', sub: 'à venir' },
          ].map((stat, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 12, padding: '16px 18px',
              border: '1.5px solid #e8e7e0',
            }}>
              <div style={{ fontSize: '1.25rem', marginBottom: 6 }}>{stat.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18' }}>{stat.value}</div>
              <div style={{ fontSize: '0.8rem', color: '#9b9b96', marginTop: 2 }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Sessions à venir */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1.5px solid #e8e7e0' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1a1a18', marginBottom: 14 }}>
              Sessions à venir
            </h2>
            {sessions?.filter((s: any) => s.statut === 'planifiee').length === 0
              ? <p style={{ fontSize: '0.875rem', color: '#9b9b96' }}>Aucune session planifiée</p>
              : sessions?.filter((s: any) => s.statut === 'planifiee').map((s: any) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0', borderBottom: '1px solid #f1efe8',
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: s.zone?.couleur ?? '#1D9E75',
                    }}/>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>
                        {s.zone?.nom ?? 'Zone ?'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#9b9b96' }}>
                        {new Date(s.date_session).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {' · '}{s.heure_debut}–{s.heure_fin}
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Secteur résumé */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1.5px solid #e8e7e0' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1a1a18', marginBottom: 14 }}>
              Mon secteur
            </h2>
            {(communes ?? []).map((c: any) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', borderBottom: '1px solid #f1efe8', fontSize: '0.875rem',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: c.chargee_at ? '#1D9E75' : '#EF9F27', flexShrink: 0,
                }}/>
                <span style={{ color: '#1a1a18' }}>{c.nom}</span>
                <span style={{ color: '#B4B2A9', marginLeft: 'auto' }}>{c.code_postal}</span>
              </div>
            ))}
            <a href="/onboarding" style={{
              display: 'inline-block', marginTop: 12,
              fontSize: '0.8rem', color: '#1D9E75', textDecoration: 'none',
            }}>
              + Modifier le secteur
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
