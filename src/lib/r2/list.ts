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
  description: string
  url: string
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
      // Hide platform-internal files (logos, future per-property metadata)
      // from the customer-facing media catalog.
      const rel = obj.Key!.slice(normalizedPrefix.length)
      return !rel.startsWith('_meta/')
    })

  return visibleObjects
    .map((obj) => {
      const key = obj.Key!
      const filename = key.slice(normalizedPrefix.length)
      return {
        key,
        filename,
        description: humanizeFilename(filename),
        url: r2PublicUrl(key),
        size: obj.Size ?? 0,
        lastModified: obj.LastModified
          ? obj.LastModified.toISOString()
          : null,
        contentType: guessContentType(filename),
        tags: [] as string[],
      }
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

/**
 * List media for a property and join user-applied tags onto each file.
 * One round-trip to Supabase per call regardless of file count.
 */
export async function listMediaWithTags(
  propertyId: string,
  prefix: string,
): Promise<MediaFile[]> {
  const files = await listMediaForPrefix(prefix)
  if (files.length === 0) return files

  const admin = createAdminClient()
  const { data: tagRows } = await admin
    .from('media_tags')
    .select('file_key, tag')
    .eq('property_id', propertyId)
    .order('tag', { ascending: true })

  const byKey = new Map<string, string[]>()
  for (const row of tagRows ?? []) {
    const existing = byKey.get(row.file_key) ?? []
    existing.push(row.tag)
    byKey.set(row.file_key, existing)
  }

  return files.map((f) => ({ ...f, tags: byKey.get(f.key) ?? [] }))
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
