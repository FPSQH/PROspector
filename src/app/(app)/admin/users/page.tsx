// src/app/(app)/admin/users/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { CreateUserForm } from './CreateUserForm'
import { UserList }       from './UserList'

export default async function AdminUsersPage() {
  const supabase = await createClient()
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
      <div style={{
        background: '#fff', borderRadius: 12, padding: '1.25rem',
        border: '1.5px solid #e8e7e0', marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#1a1a18' }}>
          Créer un accès
        </h2>
        <CreateUserForm />
      </div>

      {/* Liste des utilisateurs */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '1.25rem',
        border: '1.5px solid #e8e7e0',
      }}>
        <UserList
          users={users ?? []}
          currentUser={user.id}
        />
      </div>
    </div>
  )
}
