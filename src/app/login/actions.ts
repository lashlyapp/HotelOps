'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { needsMfaChallenge } from '@/lib/auth/mfa'
import { reconcileStorageForProperty } from '@/lib/storage/reconcile'
import {
  STORAGE_STALE_MS,
  refreshStorageForProperty,
} from '@/lib/storage/usage'
import { reconcileOrgSubscriptions } from '@/lib/stripe/reconcile'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Per-IP / per-email throttle on failed login attempts, mirroring the
// signup-form approach so credential stuffing can't quietly brute-force
// passwords against a handful of accounts. Successes wipe the failure
// history for the same email so a normal session that started with a
// typo doesn't accumulate toward the cap.
const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 10
const RATE_LIMIT_PER_EMAIL = 5

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=missing')
  }

  const ipAddress = await getClientIp()
  const admin = createAdminClient()
  const since = new Date(
    Date.now() - RATE_WINDOW_MINUTES * 60 * 1000,
  ).toISOString()

  if (ipAddress) {
    const { count: ipCount } = await admin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .eq('succeeded', false)
      .gte('created_at', since)
    if ((ipCount ?? 0) >= RATE_LIMIT_PER_IP) {
      redirect('/login?error=rate_limited')
    }
  }
  const { count: emailCount } = await admin
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .ilike('email', email)
    .eq('succeeded', false)
    .gte('created_at', since)
  if ((emailCount ?? 0) >= RATE_LIMIT_PER_EMAIL) {
    redirect('/login?error=rate_limited')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    await admin.from('login_attempts').insert({
      email,
      ip_address: ipAddress,
      succeeded: false,
    })
    redirect('/login?error=invalid')
  }

  // Wipe the recent-failure history for this email so a successful
  // sign-in resets the counter. (Per-IP failures from unrelated emails
  // are left alone — they're still legitimate signal.)
  await admin
    .from('login_attempts')
    .delete()
    .ilike('email', email)
    .eq('succeeded', false)
    .gte('created_at', since)

  // Route to the role-appropriate landing page.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', data.user.id)
    .maybeSingle()

  // Background-reconcile this user's org with Stripe right after the
  // login response goes out. Runs via next/server's `after()`, so it's
  // off the redirect's critical path — the user navigates immediately
  // and the heal completes in the background while their browser is
  // loading the next page. By the time they reach /billing (if they
  // even go there), Grand-Hotel-style drift has self-corrected. The
  // reconciler short-circuits to a no-op when nothing's wrong, so a
  // healthy login is effectively free.
  if (profile?.org_id) {
    const orgId = profile.org_id as string
    after(async () => {
      try {
        const admin2 = createAdminClient()
        const { data: org } = await admin2
          .from('organizations')
          .select('stripe_customer_id')
          .eq('id', orgId)
          .maybeSingle()
        if (!org?.stripe_customer_id) return
        await reconcileOrgSubscriptions(orgId, org.stripe_customer_id)
        // Refresh storage usage too — but only when it's stale enough
        // to matter. Each refresh lists every R2 object under the
        // property's prefix, so a recent cron run (12h staleness
        // window) keeps us off the slow path.
        const { data: properties } = await admin2
          .from('properties')
          .select('id, r2_prefix, storage_used_at')
          .eq('org_id', orgId)
        const cutoff = Date.now() - STORAGE_STALE_MS
        for (const p of properties ?? []) {
          const lastAt = p.storage_used_at
            ? new Date(p.storage_used_at).getTime()
            : 0
          if (lastAt > cutoff) continue
          try {
            const usedBytes = await refreshStorageForProperty({
              propertyId: p.id,
              r2Prefix: p.r2_prefix,
            })
            await reconcileStorageForProperty({
              propertyId: p.id,
              usedBytes,
            })
          } catch (err) {
            console.warn(
              '[storage] post-login refresh failed',
              p.id,
              err instanceof Error ? err.message : err,
            )
          }
        }
      } catch (err) {
        // Best-effort; the nightly cron is the safety net behind this.
        console.warn(
          '[billing] post-login reconcile failed',
          orgId,
          err instanceof Error ? err.message : err,
        )
      }
    })
  }

  // If the user has a verified MFA factor, the session is currently
  // at aal1 — bounce them to /login/mfa to escalate before they reach
  // any protected route. requireUser also enforces this at the page
  // layer; doing it here lets us pick the correct landing page after
  // MFA succeeds (the MFA action re-derives role-vs-platform-admin).
  if (await needsMfaChallenge()) {
    redirect('/login/mfa')
  }

  if (profile?.role === 'platform_admin') {
    redirect('/admin')
  }
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

async function getClientIp(): Promise<string | null> {
  // Vercel / Cloudflare both set x-forwarded-for with the client IP
  // as the first comma-separated entry. Trust the first hop only.
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = h.get('x-real-ip')
  return real ?? null
}
