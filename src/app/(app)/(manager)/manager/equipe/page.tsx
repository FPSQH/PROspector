import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ManagerEquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: equipe } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, email, telephone, agence_nom, derniere_connexion, must_change_password')
    .eq('manager_id', user.id)
    .order('nom')

  const nb = equipe?.length ?? 0

  const TEAL = '#1D9E75', TEAL_BG = 'rgba(29,158,117,0.1)', TEAL_BDR = 'rgba(29,158,117,0.2)'
  const GOLD = '#D97706', GOLD_BG = 'rgba(217,119,6,0.1)',  GOLD_BDR = 'rgba(217,119,6,0.2)'
  const RED  = '#EF4444', RED_BG  = 'rgba(239,68,68,0.1)',  RED_BDR  = 'rgba(239,68,68,0.2)'
  const BORDER = 'rgba(255,255,255,0.06)', TEXT = '#F0F0F2', MUTED = '#6B6B7B', DIM = '#4A4A58'

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, color: TEXT }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Commerciaux</h1>
          <p style={{ color: MUTED, marginTop: 4, fontSize: '0.85rem' }}>{nb} membre{nb > 1 ? 's' : ''} dans votre équipe</p>
        </div>
        <a href="/admin/users" style={{
          padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
          background: TEAL_BG, border: `1px solid ${TEAL_BDR}`, color: TEAL,
          textDecoration: 'none',
        }}>
          + Ajouter un commercial
        </a>
      </div>

      {nb === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: DIM,
        }}>
          <p>Aucun commercial rattaché à votre équipe.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {equipe?.map((c) => {
            const initials = `${c.prenom?.[0] ?? ''}${c.nom?.[0] ?? ''}`
            const inactif = !c.derniere_connexion ||
              (Date.now() - new Date(c.derniere_connexion).getTime()) > 7 * 24 * 3600 * 1000
            const firstLogin = c.must_change_password

            return (
              <div key={c.id} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '18px 24px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    background: inactif ? RED_BG : TEAL_BG,
                    border: `2px solid ${inactif ? RED_BDR : TEAL_BDR}`,
                    color: inactif ? RED : TEAL,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.prenom} {c.nom}</span>
                      {firstLogin && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          background: GOLD_BG, border: `1px solid ${GOLD_BDR}`, color: GOLD,
                        }}>Première connexion</span>
                      )}
                      {inactif && !firstLogin && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          background: RED_BG, border: `1px solid ${RED_BDR}`, color: RED,
                        }}>Inactif +7j</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 2 }}>
                      {c.email}
                      {c.telephone && ` · ${c.telephone}`}
                    </div>
                    {c.agence_nom && (
                      <div style={{ fontSize: '0.72rem', color: DIM, marginTop: 1 }}>{c.agence_nom}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={`/manager/equipe/${c.id}`} style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                    background: TEAL_BG, border: `1px solid ${TEAL_BDR}`, color: TEAL,
                    textDecoration: 'none',
                  }}>Voir la fiche →</a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
