import 'server-only'
import { unstable_cache } from 'next/cache'
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type _Object,
} from '@aws-sdk/client-s3'
import { r2Bucket, r2Client, r2PublicUrl } from './client'
import { humanizeFilename } from '@/lib/media/humanize'
import { mediaCacheTag } from '@/lib/media/cache-tags'
import { createAdminClient } from '@/lib/supabase/admin'

export type MediaFile = {
  key: string
  filename: string
  displayName: string
  description: string | null
  // Public CDN URL — videos play directly via <video src=url>.
  url: string
  posterUrl: string | null
  size: number
  lastModified: string | null
  contentType: string | null
  tags: string[]
}

export async function listMediaForPrefix(prefix: string): Promise<MediaFile[]> {
  const client = r2Client()
  const bucket = r2Bucket()
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`

  const items: _Object[] = []
  let continuationToken: string | undefined = undefined

  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      }),
    )
    if (res.Contents) items.push(...res.Contents)
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)

  const visibleObjects = items
    .filter((obj) => obj.Key && !obj.Key.endsWith('/'))
    .filter((obj) => {
      // Hide platform-internal files from the customer-facing catalog:
      //   _meta/    — logos and per-property metadata
      //   _posters/ — generated still-frame thumbnails for videos
      const rel = obj.Key!.slice(normalizedPrefix.length)
      return !rel.startsWith('_meta/') && !rel.startsWith('_posters/')
    })

  return visibleObjects
    .map((obj) => {
      const key = obj.Key!
      const filename = key.slice(normalizedPrefix.length)
      return {
        key,
        filename,
        displayName: humanizeFilename(filename),
        description: null,
        url: r2PublicUrl(key),
        posterUrl: null,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified
          ? obj.LastModified.toISOString()
          : null,
        contentType: guessContentType(filename),
        tags: [] as string[],
      } satisfies MediaFile
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

/**
 * List media for a property: all files live in R2 under the property prefix,
 * joined with user-applied display name / description / tags / poster_key.
 * Three Supabase round-trips total regardless of file count.
 *
 * Wrapped in `unstable_cache` so concurrent /media renders for the same
 * property hit Next's per-deployment cache instead of re-running the R2
 * `ListObjectsV2` + 3 Supabase queries on every request. TTL is short (30s)
 * because mutations call `revalidateTag(mediaCacheTag(propertyId))` to bust
 * eagerly — the TTL is only there as a safety floor in case a mutation
 * misses its bust call.
 */
export async function listMediaWithTags(
  propertyId: string,
  prefix: string,
): Promise<MediaFile[]> {
  return unstable_cache(
    () => listMediaWithTagsUncached(propertyId, prefix),
    ['media-with-tags', propertyId, prefix],
    {
      revalidate: 30,
      tags: [mediaCacheTag(propertyId)],
    },
  )()
}

async function listMediaWithTagsUncached(
  propertyId: string,
  prefix: string,
): Promise<MediaFile[]> {
  const admin = createAdminClient()
  const [r2Files, { data: tagRows }, { data: metadataRows }] = await Promise.all([
    listMediaForPrefix(prefix),
    admin
      .from('media_tags')
      .select('file_key, tag')
      .eq('property_id', propertyId)
      .order('tag', { ascending: true }),
    admin
      .from('media_metadata')
      .select('file_key, display_name, description, poster_key, updated_at')
      .eq('property_id', propertyId),
  ])

  const tagsByKey = new Map<string, string[]>()
  for (const row of tagRows ?? []) {
    const existing = tagsByKey.get(row.file_key) ?? []
    existing.push(row.tag)
    tagsByKey.set(row.file_key, existing)
  }

  const metaByKey = new Map<
    string,
    {
      display_name: string | null
      description: string | null
      poster_key: string | null
      updated_at: string | null
    }
  >()
  for (const row of metadataRows ?? []) {
    metaByKey.set(row.file_key, {
      display_name: row.display_name,
      description: row.description,
      poster_key: row.poster_key,
      updated_at: row.updated_at,
    })
  }

  return r2Files
    .map((f) => {
      const meta = metaByKey.get(f.key)
      // Cache-bust the poster on metadata mutations so picking a new cover
      // shows up immediately instead of waiting for the CDN edge to expire
      // its copy of the same R2 key.
      const posterUrl = meta?.poster_key
        ? cacheBust(r2PublicUrl(meta.poster_key), meta.updated_at)
        : null
      return {
        ...f,
        displayName: meta?.display_name?.trim() || f.displayName,
        description: meta?.description ?? null,
        posterUrl,
        tags: tagsByKey.get(f.key) ?? [],
      }
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

function cacheBust(url: string, version: string | null): string {
  if (!version) return url
  // Cloudflare's CDN includes the query string in the cache key by default,
  // so a different `v=` value bypasses the stale entry without us having to
  // mint a fresh R2 key per replacement.
  return `${url}?v=${encodeURIComponent(version)}`
}

function guessContentType(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop()
  if (!ext) return null
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    pdf: 'application/pdf',
  }
  return map[ext] ?? null
}
