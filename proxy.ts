//middleware.ts

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()
  const isLoginPath = url.pathname.startsWith('/login')
  const isAuthCallback = url.pathname.startsWith('/auth')
  const isVerificationPath = url.pathname.startsWith('/verification')
  const isAdminPath = url.pathname.startsWith('/admin')

  // RULE 1: Unauthenticated users
  if (!user) {
    if (!isLoginPath && !isAuthCallback) {
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // RULE 2: Authenticated users - Check Profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('status, role')
    .eq('id', user.id)
    .single()

  // ADD THESE TWO LINES:
//   console.log("MIDDLEWARE LOG - User Email:", user.email);
//   console.log("MIDDLEWARE LOG - Fetched Profile:", profile);

  const status = profile?.status || 'pending'
  const role = profile?.role || 'user'

  // RULE 3: Routing based on Status
  if (status === 'rejected') {
    await supabase.auth.signOut()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (status === 'pending') {
    if (!isVerificationPath && !isAuthCallback) {
      url.pathname = '/verification'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  if (status === 'approved') {
    if (isLoginPath || isVerificationPath) {
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    if (isAdminPath && role !== 'admin') {
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// Added failsafe default export
export default proxy;