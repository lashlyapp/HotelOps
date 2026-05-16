import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

export default async function ForgotPasswordSentPage() {
  const locale = await getLocale()
  const t = getDictionary(locale).forgotPassword

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
              {t.sent.headline}
            </h1>
            <p className="text-sm text-muted leading-relaxed">{t.sent.body}</p>
            <p className="pt-2 text-xs text-subtle">
              {t.sent.tryAgain}{' '}
              <Link
                href="/forgot-password"
                className="font-medium text-fg hover:underline"
              >
                {t.sent.tryAgainLink}
              </Link>
              {' '}{t.sent.orEmail}{' '}
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
