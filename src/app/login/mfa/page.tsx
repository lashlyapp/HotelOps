import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import {
  getPrimaryVerifiedFactorId,
  needsMfaChallenge,
} from '@/lib/auth/mfa'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'
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
  if (!user) redirect('/login')
  const needs = await needsMfaChallenge()
  if (!needs) redirect('/dashboard')

  const factorId = await getPrimaryVerifiedFactorId()
  if (!factorId) {
    redirect('/dashboard')
  }

  const { error } = await searchParams
  const locale = await getLocale()
  const t = getDictionary(locale).loginMfa

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
              {t.eyebrow}
            </p>
            <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
              {t.headline}
            </h1>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              {interpolate(t.sub, { email: user.email ?? '' })}
            </p>
          </div>

          <Card className="mt-8">
            <CardBody className="p-6 sm:p-8">
              <MfaChallengeForm
                factorId={factorId}
                initialError={error}
                t={t}
              />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-xs text-subtle">
            {t.lostAccess}{' '}
            <Link href="/login" className="font-medium text-fg hover:underline">
              {t.signInAgain}
            </Link>{' '}
            {t.lostAccessSuffix}
          </p>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
