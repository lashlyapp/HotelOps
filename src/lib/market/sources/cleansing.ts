// Cleansing helpers used by every adapter. The goal is to make the
// L1 `external_observations.payload` shape stable and queryable
// regardless of source quirks. See docs/revenue-intelligence.md
// § "L1.5 — Cleansing" for the full policy.

const MAX_TEXT_BYTES = 8 * 1024

/**
 * Build a stable city_key like 'city:charleston-sc-us' from raw
 * address fields. Lower-cased, alphanumeric + hyphens only. Stable
 * across re-runs.
 */
export function buildCityKey(input: {
  city: string | null
  state?: string | null
  country?: string | null
}): string | null {
  if (!input.city) return null
  const parts = [input.city, input.state, input.country]
    .filter((s): s is string => Boolean(s && s.trim()))
    .map(slugify)
  if (parts.length === 0) return null
  return `city:${parts.join('-')}`
}

/**
 * Build a stable property-level geo_key when lat/lon is known. Snaps
 * to 3 decimals (~110m) so the same property always produces the
 * same key.
 */
export function buildGeoPointKey(lat: number, lon: number): string {
  return `geo:${lat.toFixed(3)},${lon.toFixed(3)}`
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Ensure a value parses as a valid ISO timestamp; throw otherwise so
 * the adapter rejects the row before it hits the DB.
 */
export function ensureIsoTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string, got ${typeof value}`)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} is not a valid timestamp: ${value}`)
  }
  return d.toISOString()
}

/** Coerce a finite number from any input; return null on failure. */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Trim text, strip control chars, cap byte length. */
export function sanitizeText(value: unknown, maxBytes = MAX_TEXT_BYTES): string | null {
  if (typeof value !== 'string') return null
  // Strip C0 control chars except tab/newline/CR.
  let cleaned = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue
    if (code === 127) continue
    cleaned += ch
  }
  cleaned = cleaned.trim()
  if (cleaned === '') return null
  if (Buffer.byteLength(cleaned, 'utf8') <= maxBytes) return cleaned
  // Truncate by byte length, not character length, to honour DB limits.
  return Buffer.from(cleaned, 'utf8').slice(0, maxBytes).toString('utf8').replace(/[�]+$/, '')
}

/**
 * Strip obvious PII patterns (emails, US phone numbers) from a string.
 * Best-effort — not a guarantee. Use for free-text fields from
 * unstructured sources (review text, event descriptions).
 */
export function stripPii(value: string): string {
  return value
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
}

/** Hash a value (HMAC-SHA256, hex) for k-anonymity buckets. */
export function hashForAnonymity(value: string, salt: string): string {
  // Lazy-import: server-only, avoid bundling crypto into client paths.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require('node:crypto') as typeof import('node:crypto')
  return createHmac('sha256', salt).update(value).digest('hex')
}

/** Deduplicate an array of observations on (target_kind, target_key). */
export function dedupeObservations<T extends { target_kind: string; target_key?: string | null }>(
  observations: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const o of observations) {
    const key = `${o.target_kind}::${o.target_key ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}
