import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/forgot-password') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/api')

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname === '/login') {
    // Récupère le rôle pour router vers le bon dashboard
    const { data: profile } = await supabase
      .from('commerciaux')
      .select('role')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    url.pathname = profile?.role === 'manager' ? '/manager/dashboard' : '/dashboard'
    return NextResponse.redirect(url)
  }

  // Redirige un manager qui tente d'accéder aux routes commerciales
  if (user && request.nextUrl.pathname === '/dashboard') {
    const { data: profile } = await supabase
      .from('commerciaux')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'manager') {
      const url = request.nextUrl.clone()
      url.pathname = '/manager/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Protège les routes /manager/* : rôle manager obligatoire
  if (user && request.nextUrl.pathname.startsWith('/manager')) {
    const { data: profile } = await supabase
      .from('commerciaux')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'manager') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|workbox).*)'],
}
