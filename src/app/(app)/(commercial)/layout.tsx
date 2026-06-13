import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import AppShell from '@/components/layout/AppShell'
import BottomTabBar from '@/components/layout/BottomTabBar'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import OnboardingGuide from '@/components/onboarding/OnboardingGuide'
import DelegationBanner from '@/components/layout/DelegationBanner'

export default async function CommercialLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const delegationId  = cookieStore.get('delegation_commercial_id')?.value
  const delegationMgr = cookieStore.get('delegation_manager_id')?.value

  // Mode délégation : manager agit en tant que commercial
  const isDelegation = !!(delegationId && delegationMgr && delegationMgr === user.id)
  const effectiveId  = isDelegation ? delegationId! : user.id

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('nom, prenom, role, must_change_password')
    .eq('id', effectiveId)
    .single()

  // Hors délégation : bloquer les managers et forcer le changement de mdp
  if (!isDelegation && commercial?.role === 'manager') redirect('/manager/dashboard')
  if (!isDelegation && commercial?.must_change_password) redirect('/change-password')

  const nom      = commercial?.nom    ?? ''
  const prenom   = commercial?.prenom ?? ''
  const userName = [prenom, nom].filter(Boolean).join(' ') || 'Commercial'
  const initials = [prenom?.[0], nom?.[0]].filter(Boolean).join('').toUpperCase() || 'FP'

  return (
    <OnboardingProvider>
      {isDelegation && <DelegationBanner commercialNom={nom} commercialPrenom={prenom} />}
      <div style={isDelegation ? { paddingTop: 37 } : undefined}>
        <AppShell userName={userName} userInitials={initials}>
          {children}
          <BottomTabBar />
        </AppShell>
      </div>
      <OnboardingGuide />
    </OnboardingProvider>
  )
}
