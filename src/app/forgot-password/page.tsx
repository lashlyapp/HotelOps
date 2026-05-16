import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { createClient } from '@/lib/supabase/server'
import { requestPasswordReset } from './actions'

type SearchParams = Promise<{ error?: string }>

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const { error } = await searchParams
  const locale = await getLocale()
  const t = getDictionary(locale).forgotPassword
  const errorMessage =
    error && error in t.errors
      ? t.errors[error as keyof typeof t.errors]
      : null

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <Link
            href="/login"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            ← {t.backToLogin}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 text-center">
            <Wordmark size="lg" href="/" />
            <p className="text-sm text-muted">{t.title}</p>
          </div>

          <form action={requestPasswordReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
              <p className="text-xs text-subtle">{t.hint}</p>
            </div>

            {errorMessage ? (
              <p className="text-sm text-danger-fg">{errorMessage}</p>
            ) : null}

            <Button type="submit" className="w-full">
              {t.cta}
            </Button>
          </form>

          <p className="text-center text-xs text-subtle">
            {t.remembered}{' '}
            <Link
              href="/login"
              className="font-medium text-fg hover:underline"
            >
              {t.loginLink}
            </Link>
            .
          </p>
        </div>
      </main>

      <Footer variant="public" />
    </div>
  )
}
