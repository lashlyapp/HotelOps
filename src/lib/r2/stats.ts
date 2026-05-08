import type { MediaFile } from './list'

export type LibraryStats = {
  fileCount: number
  totalBytes: number
  imageCount: number
  videoCount: number
  lastModified: string | null
}

export function computeLibraryStats(files: MediaFile[]): LibraryStats {
  const stats: LibraryStats = {
    fileCount: files.length,
    totalBytes: 0,
    imageCount: 0,
    videoCount: 0,
    lastModified: null,
  }

  for (const file of files) {
    stats.totalBytes += file.size
    const ct = file.contentType ?? ''
    if (ct.startsWith('image/')) stats.imageCount += 1
    else if (ct.startsWith('video/')) stats.videoCount += 1

    if (
      file.lastModified &&
      (!stats.lastModified || file.lastModified > stats.lastModified)
    ) {
      stats.lastModified = file.lastModified
    }
  }

  return stats
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
