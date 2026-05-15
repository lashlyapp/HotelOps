import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import {
  getPrimaryVerifiedFactorId,
  needsMfaChallenge,
} from '@/lib/auth/mfa'
import { createClient } from '@/lib/supabase/server'
import { MfaChallengeForm } from './_components/challenge-form'

type SearchParams = Promise<{ error?: string }>

/**
 * Post-password sign-in MFA gate. Reached only when:
 *   1. The user just authenticated with their password successfully.
 *   2. They have at least one verified TOTP factor on file.
 *
 * Submitting the 6-digit code escalates the session to aal2; the
 * action then redirects to /dashboard. Users without a factor never
 * land here — the login action sends them straight to /dashboard.
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // No session → kick to /login. Already at aal2 → kick to /dashboard.
  // The "needs challenge" check covers everything in between.
  if (!user) redirect('/login')
  const needs = await needsMfaChallenge()
  if (!needs) redirect('/dashboard')

  const factorId = await getPrimaryVerifiedFactorId()
  if (!factorId) {
    // User had a factor at password-check time but it was unenrolled
    // between then and now. Bounce to dashboard — session is still
    // valid, just at aal1.
    redirect('/dashboard')
  }

  const { error } = await searchParams

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-md px-6 py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Two-factor authentication
            </p>
            <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
              Enter your 6-digit code
            </h1>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              Open your authenticator app and enter the current code for
              your {user.email} account.
            </p>
          </div>

          <Card className="mt-8">
            <CardBody className="p-6 sm:p-8">
              <MfaChallengeForm factorId={factorId} initialError={error} />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-xs text-subtle">
            Lost access?{' '}
            <Link href="/login" className="font-medium text-fg hover:underline">
              Sign in again
            </Link>{' '}
            or contact your admin to disable 2FA on your account.
          </p>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
