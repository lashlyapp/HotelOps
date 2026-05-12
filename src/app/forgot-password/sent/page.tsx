import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'

export default function ForgotPasswordSentPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <Link
            href="/login"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            ← Back to log in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardBody className="space-y-4 p-8 text-center">
            <div
              aria-hidden
              className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-bg text-success-fg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6"
              >
                <path d="M22 4 12 14.01l-3-3" />
                <path d="M22 12v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12" />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Check your inbox.
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              If an account exists for the address you entered, we’ve sent a
              one-time link to reset your password. The link expires in
              about an hour.
            </p>
            <p className="pt-2 text-xs text-subtle">
              Didn’t see anything?{' '}
              <Link
                href="/forgot-password"
                className="font-medium text-fg hover:underline"
              >
                Try again
              </Link>
              {' '}or email{' '}
              <a
                href={`mailto:${BRAND.supportEmail}`}
                className="font-medium text-fg hover:underline"
              >
                {BRAND.supportEmail}
              </a>
              .
            </p>
          </CardBody>
        </Card>
      </main>

      <Footer variant="public" />
    </div>
  )
}
