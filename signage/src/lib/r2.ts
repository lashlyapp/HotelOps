/**
 * Public CDN URL builder. Mirrors r2PublicUrl from the operator app —
 * intentionally duplicated to keep the signage project self-contained
 * (separate Vercel project, separate deploy lifecycle, no shared package).
 */
export function r2PublicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!base) throw new Error('NEXT_PUBLIC_R2_PUBLIC_URL is not set.')
  const trimmed = base.replace(/\/+$/, '')
  const encoded = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${trimmed}/${encoded}`
}
