import { PairForm } from './pair-form'

export default function PairPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-black text-white">
      <div className="w-full max-w-md text-center space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            HotelOps Signage
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Enter the 6-digit code shown on your operator dashboard.
          </p>
        </div>
        <PairForm />
        <p className="text-xs text-white/40">
          Don&apos;t have a code? Sign in at app.myhotelops.com → Signage →
          Add screen.
        </p>
      </div>
    </main>
  )
}
