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

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Gestion de l&apos;équipe</h1>
        <p className="text-gray-500 text-sm mt-1">
          Créez les comptes de vos commerciaux et consultez leur statut.
        </p>
      </div>

      <CreateUserForm />

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">
          Membres de l&apos;équipe ({team.length})
        </h2>
        {team.length === 0 && (
          <p className="text-gray-400 text-sm">
            Aucun commercial dans votre équipe pour l&apos;instant.
          </p>
        )}
        {team.map(c => (
          <div
            key={c.id}
            className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3"
          >
            <div>
              <p className="font-medium text-sm">{c.prenom} {c.nom}</p>
              <p className="text-gray-400 text-xs">{c.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {c.must_change_password && (
                <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  1ère connexion
                </span>
              )}
              <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                {c.role}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
