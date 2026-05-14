import Link from 'next/link'

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border-subtle bg-surface px-4 sm:px-8 py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">
              Maintenance &amp; service
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-fg">
              Task board
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Photo and video-first ticketing for non-routine work — a dripping
              faucet, a broken TV, a guest request. Snap, tag, hand off.
            </p>
          </div>
          <Link
            href="/tasks/new"
            className="focus-ring inline-flex h-10 items-center justify-center self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            + New task
          </Link>
        </div>
      </header>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
