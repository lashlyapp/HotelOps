import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from './_components/signup-form'

export default async function SignupPage() {
  // Already-authenticated users have an account; bounce them home.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              ← Back to home
            </Link>
            <Link
              href="/login"
              className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-muted"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Start free
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
              Try {BRAND.name} free for 7 days
            </h1>
            <p className="mt-4 text-base text-muted leading-relaxed">
              Full access. No credit card. 10 GB of media included. Set up your
              property in under two minutes and start running it like a pro
              today.
            </p>
          </div>

          <Card className="mt-10">
            <CardBody className="p-6 sm:p-8">
              <SignupForm />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-xs text-subtle">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-fg hover:underline">
              Log in
            </Link>
            .
          </p>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
