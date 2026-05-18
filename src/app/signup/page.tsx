import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import {
  deserializeUtm,
  readUtmFromSearchParams,
  UTM_COOKIE,
} from '@/lib/marketing/utm'
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from './_components/signup-form'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const locale = await getLocale()
  const t = getDictionary(locale)

  // Resolve attribution: URL params win (a fresh ad click), then
  // fall back to the cookie set by UtmCapture on a previous landing.
  // Either way the values flow into the form as hidden inputs and
  // the action persists them onto signup_pending → organizations.
  const params = await searchParams
  const urlAttribution = readUtmFromSearchParams(
    new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((vi) => [k, vi]) : v ? [[k, v]] : [],
      ),
    ),
  )
  const cookieAttribution = deserializeUtm(
    (await cookies()).get(UTM_COOKIE)?.value,
  )
  const attribution = { ...cookieAttribution, ...urlAttribution }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark size="md" href="/" />
          <div className="flex items-center gap-1">
            {/* Wordmark already links to /, so the explicit Back link
                is desktop-only — keeps the mobile header from
                wrapping the right-side CTA onto two lines. */}
            <Link
              href="/"
              className="focus-ring hidden sm:inline-flex rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              ← {t.common.backToHome}
            </Link>
            <Link
              href="/login"
              className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg hover:bg-surface-muted"
            >
              {t.common.logIn}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t.signup.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
              {t.signup.headline}
            </h1>
            <p className="mt-4 text-base text-muted leading-relaxed">
              {t.signup.sub}
            </p>
          </div>

          <Card className="mt-10">
            <CardBody className="p-6 sm:p-8">
              <SignupForm t={t.signup} attribution={attribution} />
            </CardBody>
          </Card>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
