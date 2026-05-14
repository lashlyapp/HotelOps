'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function PairForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = (await res.json()) as
        | { ok: true; token: string }
        | { ok: false; error: string }
      if (!json.ok) {
        setError(json.error)
        return
      }
      router.replace(`/${json.token}`)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="code" className="sr-only">
        Pairing code
      </label>
      <input
        id="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className="w-full rounded-md border border-white/20 bg-black/30 px-4 py-3 text-center text-2xl tracking-[0.5em] tabular-nums focus:border-white focus:outline-none"
        autoFocus
      />
      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
      >
        {pending ? 'Pairing…' : 'Pair this screen'}
      </button>
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
