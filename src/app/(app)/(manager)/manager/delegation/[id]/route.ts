import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', _req.url))

  const { id: commercialId } = await params

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id')
    .eq('id', commercialId)
    .eq('manager_id', user.id)
    .single()

  if (!commercial) return NextResponse.notFound()

  const cookieStore = await cookies()
  const res = NextResponse.redirect(new URL('/dashboard', _req.url))

  const opts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge:   30 * 60,
    path:     '/',
  }
  res.cookies.set('delegation_commercial_id', commercialId, opts)
  res.cookies.set('delegation_manager_id', user.id, opts)

  return res
}
