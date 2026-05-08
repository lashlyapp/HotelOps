import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    redirect(profile?.role === 'platform_admin' ? '/admin' : '/dashboard')
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <Link
            href="/login"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Built for hotel property owners
          </p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-fg">
            Run your hotel operations
            <br />
            from one place.
          </h1>
          <p className="mt-5 text-lg text-muted max-w-2xl mx-auto">
            {BRAND.name} gives you a centralized media library, with permanent
            URLs you can paste straight into your hotel website. Billing, team
            access, and more on the roadmap.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Sign in
            </Link>
            <a
              href={`mailto:${BRAND.supportEmail}?subject=Interested%20in%20${BRAND.name}`}
              className="focus-ring rounded-md px-5 py-2.5 text-sm font-medium text-muted hover:text-fg"
            >
              Request access →
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            title="Centralized media library"
            body="Every photo and video for every property in one place. One permanent URL per file. Paste into your website and it just works."
          />
          <Feature
            title="Per-property organization"
            body="Each hotel gets its own catalog. Switch between properties with one click. Search by name, filter by media type."
          />
          <Feature
            title="Built on Cloudflare"
            body="Files served from Cloudflare's global CDN. Fast loads anywhere your guests are."
          />
          <Feature
            title="Invite-only accounts"
            body="No public signup. We onboard you and your team manually so your data stays yours."
          />
          <Feature
            title="Simple billing"
            body="Pay by check. Invoice history and statements available in your account."
          />
          <Feature
            title="More coming soon"
            body="Reservations, housekeeping, staff scheduling. Built one module at a time, with feedback from real hotels."
          />
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardBody>
        <h3 className="text-base font-semibold tracking-tight text-fg">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
      </CardBody>
    </Card>
  )
}
