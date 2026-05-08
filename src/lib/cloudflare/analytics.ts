import 'server-only'

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'
const WINDOW_DAYS = 30

export type BandwidthResult =
  | { ok: true; bytes: number; days: number }
  | { ok: false; reason: string }

// Reads CDN egress bytes for the last 30 days from Cloudflare's GraphQL
// Analytics API, scoped to the zone's CDN host. R2 itself doesn't expose a
// "bandwidth" metric (egress is free) — every served file goes through the
// custom domain bound to the bucket, so the zone's HTTP request analytics is
// the right source.
//
// Requires CLOUDFLARE_API_TOKEN with "Account Analytics:Read" (or zone-scoped
// Analytics:Read) and CLOUDFLARE_ZONE_ID for the zone hosting the CDN.
export async function getCdnBandwidth(): Promise<BandwidthResult> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const zoneTag = process.env.CLOUDFLARE_ZONE_ID
  const cdnUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL

  if (!token || !zoneTag || !cdnUrl) {
    return { ok: false, reason: 'unconfigured' }
  }

  const host = (() => {
    try {
      return new URL(cdnUrl).hostname
    } catch {
      return null
    }
  })()
  if (!host) return { ok: false, reason: 'invalid-cdn-url' }

  const until = new Date()
  const since = new Date(until.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const query = `
    query CdnBandwidth($zoneTag: string!, $since: Time!, $until: Time!, $host: string!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequestsAdaptiveGroups(
            limit: 1
            filter: {
              datetime_geq: $since
              datetime_lt: $until
              clientRequestHTTPHost: $host
            }
          ) {
            sum {
              edgeResponseBytes
            }
          }
        }
      }
    }
  `

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag,
          since: since.toISOString(),
          until: until.toISOString(),
          host,
        },
      }),
      next: { revalidate: 3600 },
    })

    if (!res.ok) return { ok: false, reason: `http-${res.status}` }

    const json = (await res.json()) as {
      errors?: { message: string }[]
      data?: {
        viewer?: {
          zones?: {
            httpRequestsAdaptiveGroups?: { sum?: { edgeResponseBytes?: number } }[]
          }[]
        }
      }
    }

    if (json.errors?.length) {
      return { ok: false, reason: json.errors[0].message }
    }

    const bytes =
      json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum
        ?.edgeResponseBytes ?? 0

    return { ok: true, bytes, days: WINDOW_DAYS }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'fetch-failed' }
  }
}
