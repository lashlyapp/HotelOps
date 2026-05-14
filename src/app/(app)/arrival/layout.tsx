export default function ArrivalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border-subtle bg-surface px-4 sm:px-8 py-5">
        <p className="text-xs uppercase tracking-wider text-subtle">
          Guest arrival
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-fg">
          Arrival experience
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Informational landing page for each property. The hotel hands
          guests a printed QR card; the guest scans, sees Wi-Fi, hours,
          menus, and what to do nearby. No app, no account.
        </p>
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
