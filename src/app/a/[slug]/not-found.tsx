export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          Arrival page
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">
          We can&apos;t find that page
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          The link may be out of date. Check with the front desk for an
          updated QR code.
        </p>
      </div>
    </div>
  )
}
