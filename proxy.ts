//middleware.ts

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canvasV2LocalEvaluationEnabled } from '@/lib/canvas-v2/local-evaluation'

export async function proxy(request: NextRequest) {
  // Browser release-gate harnesses must exercise their real iframe boundaries
  // without depending on a developer's Supabase cookies. They remain unavailable
  // in production even if the explicit E2E environment is set accidentally.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NORTHSTAR_E2E === "1" &&
    (request.nextUrl.pathname.startsWith("/__northstar-e2e") ||
      request.nextUrl.pathname.startsWith("/canvas-v2-e2e") ||
      request.nextUrl.pathname === "/canvas" ||
      (canvasV2LocalEvaluationEnabled() && request.nextUrl.pathname.startsWith("/api/canvas-v2/")) ||
      request.nextUrl.pathname === "/api/canvas-ai/artifact-ack")
  ) {
    return NextResponse.next({ request })
  }

  const isApiPath = request.nextUrl.pathname.startsWith('/api/')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !supabaseAnonKey) {
    const message = 'Northstar account services are not configured for this server.'
    return isApiPath
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503 })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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
    if (isApiPath) {
      return NextResponse.json({ error: 'Sign in to access Northstar account data.' }, { status: 401 })
    }
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
