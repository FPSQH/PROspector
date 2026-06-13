import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Retourne l'ID commercial effectif pour une requête API.
 * En mode délégation (manager agissant pour un commercial),
 * retourne l'ID du commercial délégué après validation de sécurité.
 * Sinon, retourne l'ID de l'utilisateur authentifié.
 */
export async function getEffectiveCommercialId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const cookieStore = await cookies()
  const delegationId  = cookieStore.get('delegation_commercial_id')?.value
  const delegationMgr = cookieStore.get('delegation_manager_id')?.value

  // Valide : cookie présent + manager_id correspond à l'utilisateur connecté
  if (delegationId && delegationMgr && delegationMgr === user.id) {
    // Vérifie en base que ce commercial appartient bien à ce manager
    const { data } = await supabase
      .from('commerciaux')
      .select('id')
      .eq('id', delegationId)
      .eq('manager_id', user.id)
      .single()

    if (data) return delegationId
  }

  return user.id
}
