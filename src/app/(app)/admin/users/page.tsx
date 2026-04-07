import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateUserForm from './CreateUserForm'

interface Commercial {
  id: string
  nom: string
  prenom: string
  email: string
  role: string
  must_change_password: boolean
}

async function getTeam(managerId: string): Promise<Commercial[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, email, role, must_change_password')
    .eq('manager_id', managerId)
    .order('nom')
  return data ?? []
}

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caller } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (caller?.role !== 'manager') redirect('/dashboard')

  const team = await getTeam(user.id)

  const wrapStyle: React.CSSProperties = {
    maxWidth: 680, margin: '0 auto', padding: '32px 20px', display: 'flex',
    flexDirection: 'column', gap: '32px',
  }
  const headingStyle: React.CSSProperties = {
    fontSize: '22px', fontWeight: 700, margin: 0, color: '#2C2C2A',
  }
  const subStyle: React.CSSProperties = {
    fontSize: '14px', color: '#5F5E5A', margin: '6px 0 0',
  }
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '15px', fontWeight: 600, color: '#2C2C2A', margin: '0 0 12px',
  }
  const emptyStyle: React.CSSProperties = {
    fontSize: '14px', color: '#B4B2A9', textAlign: 'center', padding: '32px',
  }
  const cardStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#fff', borderRadius: '12px', border: '1px solid #E8E6DF',
    padding: '14px 18px',
  }
  const nameStyle: React.CSSProperties = {
    fontSize: '15px', fontWeight: 600, color: '#2C2C2A', margin: 0,
  }
  const emailStyle: React.CSSProperties = {
    fontSize: '13px', color: '#5F5E5A', margin: '2px 0 0',
  }
  const badgeBase: React.CSSProperties = {
    fontSize: '12px', borderRadius: '20px', padding: '3px 10px', fontWeight: 500,
  }

  return (
    <div style={wrapStyle}>
      <div>
        <h1 style={headingStyle}>Gestion de l&apos;équipe</h1>
        <p style={subStyle}>Créez les comptes de vos commerciaux et consultez leur statut.</p>
      </div>

      <CreateUserForm />

      <div>
        <p style={sectionTitleStyle}>
          Membres de l&apos;équipe ({team.length})
        </p>
        {team.length === 0 ? (
          <p style={emptyStyle}>Aucun commercial dans votre équipe pour l&apos;instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {team.map(c => (
              <div key={c.id} style={cardStyle}>
                <div>
                  <p style={nameStyle}>{c.prenom} {c.nom}</p>
                  <p style={emailStyle}>{c.email}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {c.must_change_password && (
                    <span style={{ ...badgeBase, background: '#FEF3C7', color: '#92400E' }}>
                      1ère connexion
                    </span>
                  )}
                  <span style={{ ...badgeBase, background: '#F1EFE8', color: '#5F5E5A' }}>
                    {c.role}
                  </span>
                  <DeleteButton userId={c.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Petit composant client pour le bouton supprimer
function DeleteButton({ userId }: { userId: string }) {
  'use client'
  // Note: Server Component ne peut pas avoir de handlers inline
  // → on utilisera un form action
  return (
    <form action={`/api/admin/users/${userId}`} method="POST">
      <input type="hidden" name="_method" value="DELETE" />
      <button
        type="submit"
        style={{
          background: 'none', border: '1px solid #E24B4A', color: '#E24B4A',
          borderRadius: '8px', padding: '5px 12px', fontSize: '13px',
          cursor: 'pointer', fontWeight: 500,
        }}
        onClick={async (e) => {
          e.preventDefault()
          if (!confirm('Supprimer ce compte ? Cette action est irréversible.')) return
          const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
          if (res.ok) window.location.reload()
          else alert('Erreur lors de la suppression')
        }}
      >
        Supprimer
      </button>
    </form>
  )
}
