import 'server-only'
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type _Object,
} from '@aws-sdk/client-s3'
import { r2Bucket, r2Client, r2PublicUrl } from './client'
import { humanizeFilename } from '@/lib/media/humanize'
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
 */
export async function listMediaWithTags(
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
      .select('file_key, display_name, description, poster_key')
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
    }
  >()
  for (const row of metadataRows ?? []) {
    metaByKey.set(row.file_key, {
      display_name: row.display_name,
      description: row.description,
      poster_key: row.poster_key,
    })
  }

  return r2Files
    .map((f) => {
      const meta = metaByKey.get(f.key)
      return {
        ...f,
        displayName: meta?.display_name?.trim() || f.displayName,
        description: meta?.description ?? null,
        posterUrl: meta?.poster_key ? r2PublicUrl(meta.poster_key) : null,
        tags: tagsByKey.get(f.key) ?? [],
      }
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
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
