import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing: 'Email and password are required.',
  invalid: 'Invalid email or password.',
  no_org: "Your account isn't linked to an organization. Contact your admin.",
  unauthorized: 'Your account is not authorized for the admin portal.',
}

type SearchParams = Promise<{ error?: string }>

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] : null

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <Link
            href="/"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-fg"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 text-center">
            <Wordmark size="lg" href="/" />
            <p className="text-sm text-muted">Sign in to your account</p>
          </div>

          <form action={signIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
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
              Sign in
            </Button>
          </form>

          <p className="text-center text-xs text-subtle leading-relaxed">
            Accounts are created by invitation. Contact your administrator if
            you don&apos;t have access.
          </p>
        </div>
      </main>

      <Footer variant="public" />
    </div>
  )
}
