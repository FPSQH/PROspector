import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!commercial) redirect('/login')

  // Communes du commercial
  const { data: communes } = await supabase
    .from('communes')
    .select('id, nom, code_insee, chargee_at')
    .eq('commercial_id', commercial.id)

  // Si pas de communes → onboarding
  if (!communes || communes.length === 0) {
    redirect('/onboarding')
  }

  const communesInsee = (communes ?? []).map((c: any) => c.code_insee)

  // Adresses
  const { count: nbAdresses } = await supabase
    .from('adresses')
    .select('id', { count: 'exact', head: true })
    .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])

  // Zones
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, couleur, nb_prospectables')
    .eq('commercial_id', commercial.id)
    .order('numero')

  // Sessions
  const { data: sessions } = await supabase
    .from('sessions_prospection')
    .select('id, statut, date_session')
    .eq('commercial_id', commercial.id)
    .order('date_session', { ascending: false })
    .limit(20)

  const sessionsCeMois = (sessions ?? []).filter((s: any) => {
    const d = new Date(s.date_session)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4' }}>
      {/* ── Header ── */}
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

      {/* ── Contenu ── */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>

        {/* Salutation */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color: '#1a1a18' }}>
            Bonjour {commercial?.prenom} 👋
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#9b9b96', marginTop: 2 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* ── Cartes stats ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 28,
        }}>
          {[
            { label: 'Communes', value: communes?.length ?? 0, icon: '🏘️', sub: 'dans le secteur', href: '/onboarding' },
            { label: 'Adresses', value: (nbAdresses ?? 0).toLocaleString('fr-FR'), icon: '📍', sub: 'chargées BAN', href: null },
            { label: 'Zones', value: zones?.length ?? 0, icon: '🗺️', sub: 'de prospection', href: '/zones' },
            {
              label: 'Sessions',
              value: sessionsCeMois.filter((s: any) => s.statut === 'realisee').length,
              icon: '✅', sub: 'réalisées ce mois',
              href: null,
            },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid #e8e7e0',
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{stat.icon}</div>
              <div style={{ fontSize: '1.625rem', fontWeight: 700, color: '#1a1a18', lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 4 }}>
                {stat.label} · {stat.sub}
              </div>
              {stat.href && (
                <Link href={stat.href} style={{
                  display: 'inline-block', marginTop: 8,
                  fontSize: '0.75rem', color: '#1D9E75', textDecoration: 'none', fontWeight: 500,
                }}>
                  Gérer →
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* ── Navigation principale ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12, marginBottom: 28,
        }}>
          {[
            {
              href: '/zones',
              icon: '🗺️',
              title: 'Zones de prospection',
              desc: zones && zones.length > 0
                ? `${zones.length} zones configurées`
                : 'Configurer vos zones',
              color: '#1D9E75',
              badge: zones && zones.length === 0 ? '⚡ À faire' : undefined,
            },
            {
              href: '/onboarding',
              icon: '🏘️',
              title: 'Mon secteur',
              desc: `${communes?.length ?? 0} commune${(communes?.length ?? 0) > 1 ? 's' : ''}`,
              color: '#2196F3',
              badge: undefined,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: '#fff', borderRadius: 12,
                border: `1.5px solid ${item.color}22`,
                padding: '16px 20px', textDecoration: 'none',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: `${item.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.375rem', flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a18', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.title}
                  {item.badge && (
                    <span style={{
                      background: '#fef3c7', color: '#d97706',
                      fontSize: '0.65rem', padding: '1px 6px', borderRadius: 8,
                      fontWeight: 600,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#9b9b96', marginTop: 2 }}>{item.desc}</div>
              </div>
              <div style={{ marginLeft: 'auto', color: item.color, fontSize: '1rem' }}>→</div>
            </Link>
          ))}
        </div>

        {/* ── Zones résumé ── */}
        {zones && zones.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 12,
            border: '1px solid #e8e7e0',
            padding: '20px 24px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 16,
            }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>
                🗺️ Mes zones
              </h2>
              <Link href="/zones" style={{ fontSize: '0.8rem', color: '#1D9E75', textDecoration: 'none' }}>
                Voir tout →
              </Link>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {zones.slice(0, 9).map((z: any) => (
                <Link
                  key={z.id}
                  href="/zones"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: '#f8f7f4', borderRadius: 8,
                    border: '1px solid #e8e7e0',
                    padding: '6px 12px',
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.couleur }} />
                  <span style={{ fontSize: '0.8rem', color: '#1a1a18', fontWeight: 500 }}>{z.nom}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9b9b96' }}>{z.nb_prospectables}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
