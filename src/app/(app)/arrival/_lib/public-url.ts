// Client-safe R2 public URL builder. The server-only module
// `src/lib/r2/client.ts` can't be imported from a 'use client' file
// (the `import 'server-only'` directive in it deliberately throws),
// but the operator's section editors need to render previews of
// already-uploaded R2 objects. Mirrors the server helper.

export function clientR2PublicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
  const trimmed = base.replace(/\/+$/, '')
  const encoded = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${trimmed}/${encoded}`
}
