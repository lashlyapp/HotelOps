import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'

export default function SignupVerifyInvalidPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <Link
            href="/"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardBody className="space-y-4 p-8 text-center">
            <div
              aria-hidden
              className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger-fg"
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
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              That link doesn’t look right.
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              The confirmation link may have expired, already been used, or
              been copied incorrectly.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/signup"
                className="focus-ring inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
              >
                Start over
              </Link>
              <p className="text-xs text-subtle">
                Or email{' '}
                <a
                  href={`mailto:${BRAND.supportEmail}`}
                  className="font-medium text-fg hover:underline"
                >
                  {BRAND.supportEmail}
                </a>{' '}
                and we’ll help.
              </p>
            </div>
          </CardBody>
        </Card>
      </main>

      <Footer variant="public" />
    </div>
  )
}
