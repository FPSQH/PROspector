import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateUserForm } from './CreateUserForm'

export default async function AdminUsersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Réservé aux managers
  const { data: commercial } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (commercial?.role !== 'manager') redirect('/dashboard')

  const { data: users } = await supabase
    .from('commerciaux').select('*').order('nom')

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: '#1a1a18' }}>
        Gestion des utilisateurs
      </h1>

      {/* Formulaire ajout */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1.5px solid #e8e7e0', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem', color: '#1a1a18' }}>
          Créer un accès
        </h2>
        <CreateUserForm />
      </div>

      {/* Liste utilisateurs */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8e7e0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1efe8', fontSize: '0.8rem', fontWeight: 500, color: '#5F5E5A' }}>
          {users?.length ?? 0} utilisateur(s)
        </div>
        {users?.map(u => (
          <div key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 1.25rem', borderBottom: '1px solid #f8f7f4',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: '#E1F5EE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.875rem', fontWeight: 600, color: '#0F6E56', flexShrink: 0,
            }}>
              {u.prenom?.[0]}{u.nom?.[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#1a1a18' }}>
                {u.prenom} {u.nom}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#9b9b96' }}>{u.email}</div>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 500,
              background: u.role === 'manager' ? '#E1F5EE' : '#f1efe8',
              color: u.role === 'manager' ? '#0F6E56' : '#5F5E5A',
            }}>
              {u.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
