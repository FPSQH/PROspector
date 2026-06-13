import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function SortirDelegationPage() {
  const cookieStore = await cookies()
  cookieStore.delete('delegation_commercial_id')
  cookieStore.delete('delegation_manager_id')
  redirect('/manager/dashboard')
}
