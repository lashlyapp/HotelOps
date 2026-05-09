import { NextResponse, type NextRequest } from 'next/server'
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type _Object,
} from '@aws-sdk/client-s3'
import { r2Bucket, r2Client } from '@/lib/r2/client'
import { r2DeleteObject } from '@/lib/r2/upload'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vercel Cron: nightly sweep that deletes poster JPEGs whose owning video
 * is no longer in R2. The leak source is delete paths that fail between
 * the video DELETE and the poster DELETE (network blip, function timeout,
 * out-of-band manual delete via the R2 console). Cheap to run — listing a
 * property's prefix is one ListObjectsV2 call per ~1000 keys, and the only
 * write traffic is the orphan deletions themselves.
 *
 * Schedule lives in `vercel.json`. Auth uses Vercel's standard
 * `Authorization: Bearer ${CRON_SECRET}` header.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POSTER_PREFIX = '_posters/'
const META_PREFIX = '_meta/'

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not set' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: properties, error } = await admin
    .from('properties')
    .select('id, r2_prefix')
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const summary = {
    propertiesScanned: 0,
    postersScanned: 0,
    orphansDeleted: 0,
    failures: [] as Array<{ key: string; message: string }>,
  }

  for (const property of properties ?? []) {
    summary.propertiesScanned += 1
    try {
      const result = await sweepProperty(property.r2_prefix)
      summary.postersScanned += result.postersScanned
      summary.orphansDeleted += result.orphansDeleted
      summary.failures.push(...result.failures)
    } catch (err) {
      summary.failures.push({
        key: property.r2_prefix,
        message: err instanceof Error ? err.message : 'sweep failed',
      })
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}

async function sweepProperty(rawPrefix: string): Promise<{
  postersScanned: number
  orphansDeleted: number
  failures: Array<{ key: string; message: string }>
}> {
  const prefix = rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`
  const client = r2Client()
  const bucket = r2Bucket()

  const items: _Object[] = []
  let continuationToken: string | undefined = undefined
  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    if (res.Contents) items.push(...res.Contents)
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)

  // Build the set of "real" file keys (anything not under _posters/ or
  // _meta/) so a poster's expected sibling can be looked up in O(1).
  const fileKeys = new Set<string>()
  const posterKeys: string[] = []
  for (const obj of items) {
    if (!obj.Key) continue
    const rel = obj.Key.slice(prefix.length)
    if (rel.startsWith(POSTER_PREFIX)) {
      posterKeys.push(obj.Key)
    } else if (!rel.startsWith(META_PREFIX) && !obj.Key.endsWith('/')) {
      fileKeys.add(obj.Key)
    }
  }

  const failures: Array<{ key: string; message: string }> = []
  let orphansDeleted = 0
  for (const posterKey of posterKeys) {
    const expectedVideoKey = videoKeyForPoster(prefix, posterKey)
    if (!expectedVideoKey) continue
    if (fileKeys.has(expectedVideoKey)) continue
    try {
      await r2DeleteObject(posterKey)
      orphansDeleted += 1
    } catch (err) {
      failures.push({
        key: posterKey,
        message: err instanceof Error ? err.message : 'delete failed',
      })
    }
  }

  return { postersScanned: posterKeys.length, orphansDeleted, failures }
}

function videoKeyForPoster(propertyPrefix: string, posterKey: string): string | null {
  // posterKey: `{propertyPrefix}_posters/{filename}.jpg`
  // videoKey:  `{propertyPrefix}{filename}`   (filename retains its own
  //                                            extension — `lobby.mp4`)
  const rel = posterKey.slice(propertyPrefix.length)
  if (!rel.startsWith(POSTER_PREFIX)) return null
  if (!rel.endsWith('.jpg')) return null
  const filename = rel.slice(POSTER_PREFIX.length, rel.length - '.jpg'.length)
  if (!filename) return null
  return `${propertyPrefix}${filename}`
}
