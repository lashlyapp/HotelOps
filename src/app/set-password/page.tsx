import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS_HINT,
} from '@/lib/auth/password'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { createClient } from '@/lib/supabase/server'
import { setPassword } from './actions'

type SearchParams = Promise<{ error?: string }>

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await searchParams
  const locale = await getLocale()
  const t = getDictionary(locale).setPassword
  const errorMessage =
    error && error in t.errors
      ? t.errors[error as keyof typeof t.errors]
      : null

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 text-center">
            <Wordmark size="lg" />
            <p className="text-sm text-muted">{t.title}</p>
            <p className="text-xs text-subtle">{user.email}</p>
          </div>

          <form action={setPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t.newPassword}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                aria-describedby="password-hint"
              />
              {/* Password-policy hint stays in English (shared with the
                  validator output across signup + admin invite flows).
                  Translating it requires refactoring lib/auth/password
                  and is deferred. */}
              <p id="password-hint" className="text-xs text-subtle">
                {PASSWORD_REQUIREMENTS_HINT}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t.confirmPassword}</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
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
        </div>
      </main>
      <Footer variant="public" />
    </div>
  )
}
