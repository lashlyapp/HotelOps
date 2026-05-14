import Link from 'next/link'
import { BillingBanner } from '@/components/billing/billing-banner'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { signOut } from '@/app/login/actions'
import { requireSession, type Session } from '@/lib/auth/session'
import { MobileNav } from './_components/mobile-nav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  const nav = <SidebarBody session={session} />

  return (
    <div className="flex flex-1 min-h-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-fg focus:shadow-lg"
      >
        Skip to main content
      </a>
      <aside className="hidden md:flex w-64 flex-col border-r border-border-subtle bg-surface-muted">
        {nav}
      </aside>

      <div className="flex flex-1 min-h-0 flex-col">
        <MobileNav>{nav}</MobileNav>
        <BillingBanner gate={session.gate} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-h-0 overflow-auto"
        >
          {children}
        </main>
        <Footer variant="app" />
      </div>
    </div>
  )
}

function SidebarBody({ session }: { session: Session }) {
  return (
    <>
      <div className="px-5 py-5 border-b border-border-subtle">
        <Wordmark size="md" href="/dashboard" />
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-subtle">
            Organization
          </p>
          <p className="mt-0.5 text-sm font-semibold text-fg">
            {session.organization.name}
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/events">Events</NavLink>
        <NavLink href="/media">Media catalog</NavLink>
        <NavLink href="/it-hub">IT Hub</NavLink>
        {session.profile.role === 'org_owner' ? (
          <NavLink href="/properties">Properties</NavLink>
        ) : null}
        <NavLink href="/billing">Billing</NavLink>
        {session.profile.role === 'org_owner' ? (
          <NavLink href="/team">Team</NavLink>
        ) : null}
        <NavLink href="/account">Account</NavLink>
      </nav>

      <form
        action={signOut}
        className="border-t border-border-subtle px-5 py-4"
      >
        <p className="text-xs text-subtle truncate" title={session.email}>
          {session.email}
        </p>
        <button
          type="submit"
          className="focus-ring mt-2 rounded-sm text-sm font-medium text-muted hover:text-fg"
        >
          Sign out
        </button>
      </form>
    </>
  )
}

function NavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="focus-ring block rounded-md px-3 py-2 text-muted hover:bg-surface hover:text-fg"
    >
      {children}
    </Link>
  )
}
