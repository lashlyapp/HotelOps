import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export async function normalizeReviews(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('source, payload, observed_at')
    .eq('target_kind', 'review')
    .gte('cleansed_at', since)
    .limit(5000)
  if (error) throw new Error(`normalizeReviews read: ${error.message}`)

  type Row = {
    target_kind: string
    target_id: string
    source: string
    external_id: string
    posted_at: string | null
    rating: number | null
    text: string | null
    language: string | null
    sentiment_score: number | null
    reviewer_hash: string | null
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    source: string
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    const p = row.payload
    const target_kind = typeof p.target_kind === 'string' ? p.target_kind : null
    const target_id = typeof p.target_id === 'string' ? p.target_id : null
    const external_id = typeof p.external_id === 'string' ? p.external_id : null
    if (!target_kind || !target_id || !external_id) continue
    rows.push({
      target_kind,
      target_id,
      source: row.source,
      external_id,
      posted_at: typeof p.posted_at === 'string' ? p.posted_at : null,
      rating: typeof p.rating === 'number' ? p.rating : null,
      text: typeof p.text === 'string' ? p.text : null,
      language: typeof p.language === 'string' ? p.language : null,
      sentiment_score: typeof p.sentiment_score === 'number' ? p.sentiment_score : null,
      reviewer_hash: typeof p.reviewer_hash === 'string' ? p.reviewer_hash : null,
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('review_observations')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: false })
  if (insErr) throw new Error(`normalizeReviews write: ${insErr.message}`)
  return rows.length
}
