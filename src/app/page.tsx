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
            <Link
              href="/signup"
              className="focus-ring hidden sm:inline-flex rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              Sign up
            </Link>
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
                {BRAND.name} puts your property photos, event proposals,
                vendor records, team, and billing in one workspace —
                shared by everyone from the front desk to ownership.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                >
                  Sign up
                </Link>
                <Link
                  href="/login"
                  className="focus-ring inline-flex h-11 items-center rounded-md px-5 text-base font-medium text-fg hover:bg-surface-muted transition-colors"
                >
                  I already have an account →
                </Link>
              </div>
              <p className="mt-6 text-xs text-subtle">
                We onboard you and your team personally so you’re running on
                day one — no setup wizard, no months of implementation.
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
                What you can do today
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                Everything you need to run your hotel.
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                Replace the patchwork of spreadsheets, shared drives, and
                email threads. {BRAND.name} brings the day-to-day of running
                a hotel into one workspace your whole team shares.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature
                title="Your photos in one place"
                body="Every photo and video for every property in one organized library. Share them on your hotel website with a permanent link — no more broken images when a file gets renamed or moved."
              />
              <Feature
                title="Win more events"
                body="Move catering and event inquiries from first call to signed contract without leaving your inbox. Send a polished proposal with line items, deposit, and balance — branded as your hotel."
              />
              <Feature
                title="Stop losing the vendor password"
                body="Keep contracts, runbooks, and vendor logins in one place your whole team can find — even when the person who set it up isn’t around. Wi-Fi codes, PMS credentials, supplier accounts."
              />
              <Feature
                title="One account, every property"
                body="Run a single boutique hotel or a portfolio of properties from one login. Each property keeps its own photos, events, and documents — switch between them with one click."
              />
              <Feature
                title="Set-and-forget billing"
                body="Save a card once and your monthly subscription renews on its own. Every invoice is right there in your account whenever you need it for the books."
              />
              <Feature
                title="Photos that load anywhere"
                body="Your images are delivered through a worldwide content network, so they appear instantly — whether your guest is browsing from across town or across an ocean."
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
                Built around your day, not a one-size-fits-all template.
              </h2>
              <p className="mt-4 text-base text-white/85 leading-relaxed">
                Every part of {BRAND.name} comes from real workflows hotel
                owners walked us through — the media request from a travel
                writer, the weekend wedding inquiry, the renewal date nobody
                can find. No bloat, no learning curve. Just the pieces of
                your day, in one place.
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
                Stop digging through shared drives for the right photo,
                forwarding old emails to find a proposal, or texting the
                manager for the Wi-Fi password. {BRAND.name} keeps the
                day-to-day of running your hotel in one shared workspace —
                for you, your team, and whoever joins next year.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                >
                  Sign up
                </Link>
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
