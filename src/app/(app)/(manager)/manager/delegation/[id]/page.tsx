import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function EntrerDelegationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: commercialId } = await params

  // Vérifie que ce commercial est bien dans l'équipe du manager
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom')
    .eq('id', commercialId)
    .eq('manager_id', user.id)
    .single()

  if (!commercial) notFound()

  // Pose le cookie de délégation (30 min max)
  const cookieStore = await cookies()
  cookieStore.set('delegation_commercial_id', commercialId, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   30 * 60,
    path:     '/',
  })
  cookieStore.set('delegation_manager_id', user.id, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   30 * 60,
    path:     '/',
  })

  redirect('/dashboard')
}
