import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { OTP_LENGTH, OTP_TTL_MINUTES } from '@/lib/auth/otp-constants'
import { BRAND } from '@/lib/brand'
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
              ← Start over
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-md px-6 py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Verify your email
            </p>
            <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
              Enter your {OTP_LENGTH}-digit code
            </h1>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              We sent a code to <strong className="text-fg">{email}</strong>.
              It expires in {OTP_TTL_MINUTES} minutes.
            </p>
          </div>

          <Card className="mt-8">
            <CardBody className="p-6 sm:p-8">
              <VerifyForm email={email} />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-xs text-subtle">
            Wrong email?{' '}
            <Link href="/signup" className="font-medium text-fg hover:underline">
              Start over
            </Link>
            . Need help? <a href={`mailto:${BRAND.supportEmail}`} className="font-medium text-fg hover:underline">{BRAND.supportEmail}</a>
          </p>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
