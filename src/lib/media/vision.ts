import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vision analysis for the media catalog. One call per image returns
 * a one-sentence literal description of what's in the frame plus a
 * bag of normalized tags (e.g. "terrace", "morning-light",
 * "two-chairs"). The Social Studio generator uses these in two
 * places:
 *
 *   1. pickMediaForTopic combines visionTags with user-applied tags
 *      when scoring which catalog photo best fits today's topic.
 *      Removes the "filename was 'IMG_4203.jpg' so we picked it at
 *      random" path that produced the bedroom-photo-with-terrace-
 *      caption bug.
 *
 *   2. buildPrompt passes the visionDescription verbatim into the
 *      OpenAI caption call so the LLM writes captions about the
 *      photo it's actually pairing with, not about the topic in
 *      abstract.
 *
 * Cost: gpt-4o-mini vision is ~$0.0001 per image at low-detail
 * mode, which is what we use — the photo is already a hero asset
 * at known resolution and the LLM doesn't need pixel-level detail
 * to produce "bedroom with city view at sunrise." A property with
 * 200 photos costs ~$0.02 total to backfill.
 *
 * Failure mode: when OPENAI_API_KEY isn't set or the call fails,
 * returns null. Callers persist nothing — the photo stays
 * untagged, and pickMediaForTopic falls through to the
 * user-applied tags / filename path. No tenant-visible breakage.
 */

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const TIMEOUT_MS = 20_000

// Bounded so a runaway model can't pollute the column.
const MAX_TAGS = 12
const MAX_DESCRIPTION_CHARS = 240

// Hotel-marketing vocabulary the prompt nudges the model toward.
// The matching path in topics.ts does substring contains() on lowercase
// tag text, so these need to overlap with topic.preferredTags
// ('room', 'food', 'morning', 'pool', etc.). Keep tags hyphenated
// rather than underscored so the existing tag normalization rules
// in media/actions.ts could ingest user edits if we ever expose
// them to the GM.
const TAG_HINTS = [
  // Spaces
  'bedroom', 'bathroom', 'lobby', 'reception', 'corridor', 'terrace', 'patio',
  'pool', 'spa', 'sauna', 'gym', 'dining-room', 'kitchen', 'bar', 'lounge',
  'library', 'fireplace', 'rooftop', 'garden', 'courtyard', 'parking',
  // Outside
  'exterior', 'facade', 'view', 'cityscape', 'ocean-view', 'mountain-view',
  'beach', 'forest', 'snow',
  // Food & drink
  'plate', 'breakfast', 'dinner', 'dessert', 'pastry', 'coffee', 'espresso',
  'tea', 'cocktail', 'wine', 'beer', 'bread', 'fruit',
  // People & activity
  'staff', 'chef', 'bartender', 'guest', 'children', 'couple', 'wedding',
  'event', 'banquet', 'yoga', 'massage',
  // Light & time
  'morning', 'sunrise', 'daylight', 'golden-hour', 'sunset', 'evening',
  'candlelight', 'night',
  // Vibe
  'cozy', 'modern', 'minimalist', 'ornate', 'rustic', 'coastal', 'industrial',
  'mediterranean',
  // Objects
  'bed', 'chair', 'sofa', 'table', 'art', 'plant', 'flowers', 'pendant-light',
  'window', 'curtain', 'rug', 'mirror',
]

const SYSTEM_PROMPT = `You analyze hotel and travel photos for a boutique-hotel marketing app. For each image return JSON: { "description": string, "tags": string[] }.

description: one sentence, max ${MAX_DESCRIPTION_CHARS} characters, a literal description of what's in the frame (subjects, lighting, composition). No marketing language. No "stunning", "luxurious", "elegant", "nestled", "boasts". Treat it like a museum caption — descriptive, not promotional.

tags: 6 to ${MAX_TAGS} lowercase hyphenated phrases that describe the actual visual content. Prefer these where accurate: ${TAG_HINTS.join(', ')}. Include 1-2 tags outside the list if they're more accurate to what's in the photo. Do not include emotions, aspirations, or hashtag-style words like "wanderlust" or "boutiquehotel".

Return only the JSON, no preamble.`

export type VisionAnalysis = {
  description: string
  tags: string[]
}

/**
 * Call OpenAI vision on a public image URL. The image must be
 * reachable from OpenAI's servers — R2 public URLs work; presigned
 * download URLs work but expire. Returns null on any failure
 * (missing key, network error, unparseable response) so callers
 * can no-op without UI breakage.
 *
 * Idempotent: same image → same prompt → very similar output. We
 * don't cache locally because the upload flow only calls this
 * once per file, but the function is safe to retry.
 */
export async function analyzeImageWithVision(
  imageUrl: string,
): Promise<VisionAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        // Low detail keeps the cost ~10× lower than high detail and
        // is sufficient for "what kind of room is this." High detail
        // would matter for OCR-style tasks; we don't need it.
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SYSTEM_PROMPT },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'low' },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 300,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(
        '[media-vision] openai returned',
        res.status,
        body.slice(0, 200),
      )
      return null
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const raw = json.choices?.[0]?.message?.content ?? ''
    return parseVisionResponse(raw)
  } catch (err) {
    console.warn('[media-vision] analysis failed', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseVisionResponse(raw: string): VisionAnalysis | null {
  if (!raw.trim()) return null
  let parsed: { description?: unknown; tags?: unknown }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return null
  }
  const description =
    typeof parsed.description === 'string'
      ? parsed.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
      : ''
  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const t of rawTags) {
    if (typeof t !== 'string') continue
    const norm = normalizeVisionTag(t)
    if (!norm) continue
    if (seen.has(norm)) continue
    seen.add(norm)
    tags.push(norm)
    if (tags.length >= MAX_TAGS) break
  }
  if (!description && tags.length === 0) return null
  return { description, tags }
}

function normalizeVisionTag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    // Replace underscores / spaces with hyphens; collapse runs.
    .replace(/[\s_]+/g, '-')
    // Drop punctuation outside [a-z0-9-]; keep the hyphen.
    .replace(/[^a-z0-9-]/g, '')
    // Collapse multi-hyphens and trim leading/trailing hyphens.
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (cleaned.length === 0) return null
  if (cleaned.length > 40) return null
  return cleaned
}

/**
 * Run the vision pass on a freshly-uploaded image and persist the
 * result to media_metadata. Best-effort: any failure is logged and
 * swallowed so the upload flow's foreground response is never
 * blocked or rolled back.
 *
 * Called from `revalidateAfterUploadAction` via `after()` so the
 * UI gets its cache-bust immediately and the ~3-5s vision call
 * runs in the background.
 */
export async function tagUploadedImage(args: {
  propertyId: string
  key: string
  publicUrl: string
  contentType: string | null
}): Promise<void> {
  // Only image content types. Videos take a different (poster-image)
  // path; PDFs / SVG don't pair with social posts.
  if (!args.contentType?.startsWith('image/')) return
  if (args.contentType === 'image/svg+xml') return

  const analysis = await analyzeImageWithVision(args.publicUrl)
  if (!analysis) return

  const admin = createAdminClient()
  const { error } = await admin.from('media_metadata').upsert(
    {
      property_id: args.propertyId,
      file_key: args.key,
      vision_description: analysis.description || null,
      vision_tags: analysis.tags,
      vision_tagged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id,file_key' },
  )
  if (error) {
    console.warn('[media-vision] persist failed', args.key, error.message)
  }
}
