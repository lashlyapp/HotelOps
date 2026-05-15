/**
 * Build a player URL the operator can hand to a TV. The signage project
 * runs as its own Vercel deployment at tv.myhotelops.com; this URL is
 * what we print on the pair instructions and (later) the per-screen
 * detail page so the operator can paste it into a Fire TV browser.
 */
const DEFAULT_BASE = 'https://tv.myhotelops.com'

export function signageBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SIGNAGE_BASE_URL ?? DEFAULT_BASE
}

export function playerUrlFor(token: string): string {
  const base = signageBaseUrl().replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(token)}`
}

export function pairEntryUrl(): string {
  return signageBaseUrl()
}
