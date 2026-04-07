import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CreateUserForm from './CreateUserForm'
import DeleteButton from './DeleteButton'

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

  return (
    <div style={{
      maxWidth: 680, margin: '0 auto', padding: '32px 20px',
      display: 'flex', flexDirection: 'column', gap: '32px',
    }}>

      {/* Bouton retour */}
      <Link href="/dashboard" style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '14px', color: '#1D9E75', textDecoration: 'none', fontWeight: 500,
        width: 'fit-content',
      }}>
        ← Tableau de bord
      </Link>

      {/* En-tête */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#2C2C2A' }}>
          Gestion de l&apos;équipe
        </h1>
        <p style={{ fontSize: '14px', color: '#5F5E5A', margin: '6px 0 0' }}>
          Créez les comptes de vos commerciaux et consultez leur statut.
        </p>
      </div>

      {/* Formulaire création */}
      <CreateUserForm />

      {/* Liste équipe */}
      <div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#2C2C2A', margin: '0 0 12px' }}>
          Membres de l&apos;équipe ({team.length})
        </p>

        {team.length === 0 ? (
          <p style={{ fontSize: '14px', color: '#B4B2A9', textAlign: 'center', padding: '32px' }}>
            Aucun commercial dans votre équipe pour l&apos;instant.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {team.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fff', borderRadius: '12px', border: '1px solid #E8E6DF',
                padding: '14px 18px',
              }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#2C2C2A', margin: 0 }}>
                    {c.prenom} {c.nom}
                  </p>
                  <p style={{ fontSize: '13px', color: '#5F5E5A', margin: '2px 0 0' }}>
                    {c.email}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {c.must_change_password && (
                    <span style={{
                      fontSize: '12px', borderRadius: '20px', padding: '3px 10px',
                      fontWeight: 500, background: '#FEF3C7', color: '#92400E',
                    }}>
                      1ère connexion
                    </span>
                  )}
                  <span style={{
                    fontSize: '12px', borderRadius: '20px', padding: '3px 10px',
                    fontWeight: 500, background: '#F1EFE8', color: '#5F5E5A',
                  }}>
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
