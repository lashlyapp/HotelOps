/**
 * Public URL builder for arrival pages. Lives next to the operator UI
 * so the print and preview buttons can render absolute URLs that work
 * outside the app (e.g. on a printed QR card). Defaults to the main
 * site origin when `NEXT_PUBLIC_SITE_URL` is set.
 */
export function arrivalBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ??
    'https://www.myhotelops.com'
  )
}

export function arrivalPublicUrl(slug: string): string {
  return `${arrivalBaseUrl()}/a/${encodeURIComponent(slug)}`
}
