import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ManagerShell from '@/components/layout/ManagerShell'

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: manager } = await supabase
    .from('commerciaux')
    .select('nom, prenom, role, must_change_password')
    .eq('id', user.id)
    .single()

  if (!manager || manager.role !== 'manager') redirect('/dashboard')

  if (manager.must_change_password) redirect('/change-password')

  const nom      = manager.nom    ?? ''
  const prenom   = manager.prenom ?? ''
  const userName = [prenom, nom].filter(Boolean).join(' ') || 'Manager'
  const initials = [prenom?.[0], nom?.[0]].filter(Boolean).join('').toUpperCase() || 'M'

  return (
    <ManagerShell userName={userName} userInitials={initials}>
      {children}
    </ManagerShell>
  )
}
