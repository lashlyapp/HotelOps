export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.4em] text-white/40">
          HotelOps Signage
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Screen not paired</h1>
        <p className="mt-3 text-sm text-white/60">
          Go to tv.myhotelops.com to enter a 6-digit pairing code.
        </p>
      </div>
    </div>
  )
}
