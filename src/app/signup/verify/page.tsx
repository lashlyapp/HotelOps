import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { OTP_LENGTH, OTP_TTL_MINUTES } from '@/lib/auth/otp-constants'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'
import { createClient } from '@/lib/supabase/server'
import { VerifyForm } from './_components/verify-form'

type SearchParams = Promise<{ email?: string }>

export default async function SignupVerifyPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const { email: emailParam } = await searchParams
  const email = (emailParam ?? '').trim().toLowerCase()
  if (!email) redirect('/signup')

  const locale = await getLocale()
  const t = getDictionary(locale).signup.verify
  const common = getDictionary(locale).common

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <div className="flex items-center gap-1">
            <Link
              href="/signup"
              className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              ← {t.startOver}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-md px-6 py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t.eyebrow}
            </p>
            <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
              {interpolate(t.headline, { n: OTP_LENGTH })}
            </h1>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              {interpolate(t.sub, { email, minutes: OTP_TTL_MINUTES })
                .split(email)
                .map((part, i, all) => (
                  <span key={i}>
                    {part}
                    {i < all.length - 1 ? (
                      <strong className="text-fg">{email}</strong>
                    ) : null}
                  </span>
                ))}
            </p>
          </div>

          <Card className="mt-8">
            <CardBody className="p-6 sm:p-8">
              <VerifyForm email={email} t={t} />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-xs text-subtle">
            {t.wrongEmail}{' '}
            <Link href="/signup" className="font-medium text-fg hover:underline">
              {t.startOver}
            </Link>
            . {t.needHelp}{' '}
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="font-medium text-fg hover:underline"
            >
              {BRAND.supportEmail}
            </a>
          </p>

          {/* Locale-switcher hint at the bottom: if a French user
              landed here via /signup but the UI is in English, they
              can switch — that switch propagates to the OTP email
              language via the locale stored on signup_pending. */}
          <p className="sr-only">{common.language}</p>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
