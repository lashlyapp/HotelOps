import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isInternalEmail } from '@/lib/admin/policy'

const LAST_ACTIVE_COOKIE = 'ho.last_active'
// Internal (platform-admin-domain) accounts get a tighter window because
// their session reaches across tenants. Picking by email domain keeps
// the proxy off the database — every authed request would otherwise
// pay for a `profiles` lookup. `isInternalEmail` already gates real
// platform-admin promotion (see requirePlatformAdmin), so it's the same
// surface area in practice.
const PLATFORM_ADMIN_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000

// Auth-only routes; we don't enforce idle-out here so an expired session
// doesn't redirect the login page back to itself.
const AUTH_PATH_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/set-password',
  '/api/auth',
]

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (request.cookies.has(LAST_ACTIVE_COOKIE)) {
      response.cookies.delete(LAST_ACTIVE_COOKIE)
    }
    return response
  }

  const path = request.nextUrl.pathname
  const onAuthRoute = AUTH_PATH_PREFIXES.some((p) => path.startsWith(p))

  const timeoutMs = isInternalEmail(user.email)
    ? PLATFORM_ADMIN_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS

  const now = Date.now()
  const lastActiveStr = request.cookies.get(LAST_ACTIVE_COOKIE)?.value
  const lastActive = lastActiveStr ? Number(lastActiveStr) : NaN
  const isIdleExpired =
    Number.isFinite(lastActive) && now - lastActive > timeoutMs

  if (isIdleExpired && !onAuthRoute) {
    return signOutAndRedirect(request)
  }

  response.cookies.set(LAST_ACTIVE_COOKIE, String(now), {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24,
  })
  return response
}

function signOutAndRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = '?error=session_expired'
  const res = NextResponse.redirect(url)
  // Clear every Supabase auth cookie (`sb-<ref>-auth-token`, plus any
  // chunked variants) so the next request is treated as unauthenticated
  // even before the redirect lands.
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith('sb-')) res.cookies.delete(c.name)
  }
  res.cookies.delete(LAST_ACTIVE_COOKIE)
  return res
}
