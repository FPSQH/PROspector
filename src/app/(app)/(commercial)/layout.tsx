import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import BottomTabBar from '@/components/layout/BottomTabBar'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import OnboardingGuide from '@/components/onboarding/OnboardingGuide'

export default async function CommercialLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('nom, prenom, must_change_password')
    .eq('id', user.id)
    .single()

  if (commercial?.must_change_password) {
    redirect('/change-password')
  }

  const nom      = commercial?.nom     ?? ''
  const prenom   = commercial?.prenom  ?? ''
  const userName = [prenom, nom].filter(Boolean).join(' ') || 'Commercial'
  const initials = [prenom?.[0], nom?.[0]].filter(Boolean).join('').toUpperCase() || 'FP'

  return (
    <OnboardingProvider>
      <AppShell userName={userName} userInitials={initials}>
        {children}
        <BottomTabBar />
      </AppShell>
      <OnboardingGuide />
    </OnboardingProvider>
  )
}
