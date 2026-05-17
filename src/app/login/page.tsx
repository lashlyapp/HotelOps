import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { signIn } from './actions'

type SearchParams = Promise<{ error?: string }>

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { error } = await searchParams
  const locale = await getLocale()
  const t = getDictionary(locale).login
  const common = getDictionary(locale).common
  const errorMessage =
    error && error in t.errors
      ? t.errors[error as keyof typeof t.errors]
      : null

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark size="md" href="/" />
          <div className="flex items-center gap-2">
            {/* Wordmark already links to /, so the explicit Back link
                is desktop-only — keeps the mobile header from
                wrapping the right-side CTA onto two lines. */}
            <Link
              href="/"
              className="focus-ring hidden sm:inline-flex rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              ← {common.backToHome}
            </Link>
            <Link
              href="/signup"
              className="focus-ring inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              {common.signUp}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 text-center">
            <Wordmark size="lg" href="/" />
            <p className="text-sm text-muted">{t.title}</p>
          </div>

          <form action={signIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">{t.password}</Label>
                <Link
                  href="/forgot-password"
                  className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
                >
                  {t.forgotPassword}
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-danger-fg">{errorMessage}</p>
            ) : null}

            <Button type="submit" className="w-full">
              {t.cta}
            </Button>
          </form>

          <p className="text-center text-xs text-subtle leading-relaxed">
            {t.noAccount}{' '}
            <Link
              href="/signup"
              className="font-medium text-fg hover:underline"
            >
              {t.signUpLink}
            </Link>
            .
          </p>
        </div>
      </main>

      <Footer variant="public" />
    </div>
  )
}
