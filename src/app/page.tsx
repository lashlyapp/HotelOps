import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { createClient } from '@/lib/supabase/server'

// Public marketing imagery. The originals are large (multi-MB) JPEGs in
// /public; next/image generates optimized variants on Vercel automatically,
// so the browser never sees the raw size.
const HERO_IMAGE = '/AdobeStock_94588323.jpeg' // manager with tablet, warm hotel interior
const RECEPTION_IMAGE = '/AdobeStock_327436679.jpeg' // reception desk with brass service bell
const GUEST_ROOM_IMAGE = '/AdobeStock_131189921.jpeg' // modern guest room

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
          <div className="flex items-center gap-1">
            <a
              href={`mailto:${BRAND.supportEmail}?subject=Interested%20in%20${BRAND.name}`}
              className="focus-ring hidden sm:inline-flex rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              Request access
            </a>
            <Link
              href="/login"
              className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-muted"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Operations platform for hotel property owners
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-fg leading-[1.05]">
                Run your hotel
                <br />
                from one place.
              </h1>
              <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                {BRAND.name} brings your property&apos;s media library, catering
                &amp; events, IT documentation, team, and billing into a single
                workspace — built for the way hotels actually work.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                >
                  Sign in
                </Link>
                <a
                  href={`mailto:${BRAND.supportEmail}?subject=Interested%20in%20${BRAND.name}`}
                  className="focus-ring inline-flex h-11 items-center rounded-md px-5 text-base font-medium text-fg hover:bg-surface-muted transition-colors"
                >
                  Request access →
                </a>
              </div>
              <p className="mt-6 text-xs text-subtle">
                Accounts are invite-only. We onboard you and your team manually.
              </p>
            </div>

            <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
              <Image
                src={HERO_IMAGE}
                alt="Hotel manager reviewing operations on a tablet"
                fill
                priority
                sizes="(min-width: 1024px) 540px, (min-width: 640px) 90vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ─── Feature grid ──────────────────────────────────────────── */}
        <section className="border-y border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                What ships today
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                Every module already in your hands.
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                We ship one module at a time and only list what&apos;s actually
                in the product — no roadmap-as-marketing. Here&apos;s what
                you&apos;ll find on day one.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature
                title="Media catalog"
                body="Every photo and video for every property in one place. Permanent CDN URLs — paste straight into your hotel website and it just works."
              />
              <Feature
                title="Catering & events"
                body="Track inquiries through tentative, proposal sent, definite, and completed. Email the customer a proposal with line items, deposit, and balance due."
              />
              <Feature
                title="IT Hub"
                body="House contracts, runbooks, and vendor login credentials in one auditable place. Encrypted at rest, scoped to staff."
              />
              <Feature
                title="Per-property workspace"
                body="Each hotel gets its own catalog, events pipeline, document store, and storefront. Switch properties with one click."
              />
              <Feature
                title="Stripe billing built in"
                body="Monthly per-property pricing. Save a card once and renewals charge automatically; full invoice history in your account."
              />
              <Feature
                title="Cloudflare-fast"
                body="Files served from Cloudflare R2 and the global CDN. Fast page loads for your guests, wherever they are."
              />
            </div>
          </div>
        </section>

        {/* ─── Identity band: built for hotels ───────────────────────── */}
        <section className="relative isolate overflow-hidden">
          <Image
            src={RECEPTION_IMAGE}
            alt="Hotel reception desk with brass service bell"
            fill
            sizes="100vw"
            className="object-cover"
          />
          {/* dark overlay so the headline is readable on top of the photo */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/55 to-black/35" />
          <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Built for hospitality
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
                Designed around how hotels actually work — not generic SaaS.
              </h2>
              <p className="mt-4 text-base text-white/85 leading-relaxed">
                Each module starts from a real workflow our customers walked us
                through: a media request from a travel writer, a wedding inquiry
                that came in over the weekend, the PMS contract everyone keeps
                losing the renewal date for. No bloat, no abstractions —
                features that match the binders behind your front desk.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Closing CTA band ──────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted order-2 lg:order-1">
              <Image
                src={GUEST_ROOM_IMAGE}
                alt="Modern hotel guest room"
                fill
                sizes="(min-width: 1024px) 540px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                Your property, finally organized.
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                Stop chasing photos in Dropbox, proposals in email threads, and
                the Wi-Fi password in a Slack DM. {BRAND.name} puts the day-to-day
                of running a property in one shared workspace — for you, your
                team, and the next person who replaces them.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={`mailto:${BRAND.supportEmail}?subject=Interested%20in%20${BRAND.name}`}
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                >
                  Request access
                </a>
                <Link
                  href="/login"
                  className="focus-ring inline-flex h-11 items-center rounded-md px-5 text-base font-medium text-fg hover:bg-surface-muted transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
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
