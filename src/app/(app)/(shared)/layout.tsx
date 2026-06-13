import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ManagerShell from '@/components/layout/ManagerShell'

export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('commerciaux')
    .select('nom, prenom, role, must_change_password')
    .eq('id', user.id)
    .single()

  if (profile?.must_change_password) redirect('/change-password')

  const nom      = profile?.nom    ?? ''
  const prenom   = profile?.prenom ?? ''
  const userName = [prenom, nom].filter(Boolean).join(' ') || 'Utilisateur'
  const initials = [prenom?.[0], nom?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  if (profile?.role === 'manager') {
    return (
      <ManagerShell userName={userName} userInitials={initials}>
        {children}
      </ManagerShell>
    )
  }

  return (
    <AppShell userName={userName} userInitials={initials}>
      {children}
    </AppShell>
  )
}
