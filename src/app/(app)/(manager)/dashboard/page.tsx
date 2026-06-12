import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ManagerDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Commerciaux de l'équipe
  const { data: equipe } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, email, derniere_connexion')
    .eq('manager_id', user.id)
    .order('nom')

  const nbCommerciaux = equipe?.length ?? 0

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>

      {/* En-tête */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F0F0F2', margin: 0 }}>
          Vue équipe
        </h1>
        <p style={{ color: '#6B6B7B', marginTop: 6, fontSize: '0.9rem' }}>
          {nbCommerciaux} commercial{nbCommerciaux > 1 ? 'x' : ''} dans votre équipe
        </p>
      </div>

      {/* Tableau équipe */}
      {nbCommerciaux === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: '48px 32px',
          textAlign: 'center',
          color: '#4A4A58',
        }}>
          <p style={{ fontSize: '0.95rem' }}>Aucun commercial rattaché à votre équipe.</p>
          <p style={{ fontSize: '0.82rem', marginTop: 8 }}>
            Ajoutez des commerciaux depuis la page{' '}
            <a href="/admin/users" style={{ color: '#1D9E75', textDecoration: 'none' }}>Gestion équipe</a>.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Commercial', 'Email', 'Dernière connexion', 'Actions'].map((h) => (
                  <th key={h} style={{
                    padding: '14px 20px', textAlign: 'left',
                    fontSize: '0.75rem', fontWeight: 600,
                    color: '#4A4A58', letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipe?.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: i < equipe.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'rgba(29,158,117,0.12)',
                        border: '1.5px solid rgba(29,158,117,0.2)',
                        color: '#1D9E75',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                      }}>
                        {c.prenom?.[0]}{c.nom?.[0]}
                      </div>
                      <span style={{ fontWeight: 600, color: '#F0F0F2', fontSize: '0.9rem' }}>
                        {c.prenom} {c.nom}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', color: '#6B6B7B', fontSize: '0.85rem' }}>
                    {c.email}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#6B6B7B', fontSize: '0.85rem' }}>
                    {c.derniere_connexion
                      ? new Date(c.derniere_connexion).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <a
                      href={`/manager/equipe/${c.id}`}
                      style={{
                        fontSize: '0.78rem', fontWeight: 600,
                        color: '#1D9E75', textDecoration: 'none',
                        padding: '5px 12px',
                        background: 'rgba(29,158,117,0.08)',
                        border: '1px solid rgba(29,158,117,0.2)',
                        borderRadius: 6,
                        display: 'inline-block',
                      }}
                    >
                      Voir le détail →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
