import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Badge } from '@/components/ui/badge'
import { signOut } from '@/app/login/actions'
import { requirePlatformAdmin } from '@/lib/auth/session'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requirePlatformAdmin()

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="hidden md:flex w-64 flex-col border-r border-border-subtle bg-surface-muted">
        <div className="px-5 py-5 border-b border-border-subtle">
          <Wordmark size="md" href="/admin" />
          <div className="mt-4 flex items-center gap-2">
            <Badge tone="info">Platform admin</Badge>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          <NavLink href="/admin">Tenants</NavLink>
          <NavLink href="/admin/tenants/new">Create tenant</NavLink>
          <NavLink href="/admin/data-sources">Data pipeline</NavLink>
          <NavLink href="/admin/market-briefing/preview">Briefing preview</NavLink>
          <NavLink href="/admin/appointments">Appointments</NavLink>
          <NavLink href="/admin/leads">Guide leads</NavLink>
          <NavLink href="/admin/blog">Blog queue</NavLink>
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
      </aside>

      <div className="flex flex-1 min-h-0 flex-col">
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        <Footer variant="app" />
      </div>
    </div>
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
