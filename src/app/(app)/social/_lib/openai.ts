import 'server-only'

// Minimal Chat Completions client. We don't pull in the official SDK
// because the surface we need is a single endpoint and we want zero
// transitive deps for a feature where the API key belongs to the
// tenant, not to us.
//
// Errors are swallowed by the caller (generator.ts) — a bad key, a
// rate limit, or a timeout all degrade the same way: fall back to
// templated captions and surface a small inline notice in the UI.

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const TIMEOUT_MS = 15_000

export type ChatMessage = { role: 'system' | 'user'; content: string }

export type AiResult = {
  captions: string[]
  // Parallel array: one hashtag set per caption. Items may be empty
  // arrays if the model returned a caption without hashtags.
  hashtagSets: string[][]
}

export async function generateCaptions(
  apiKey: string,
  messages: ChatMessage[],
): Promise<AiResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        // We ask the model for JSON so we can pull out the three
        // variants without regex-parsing freeform prose.
        response_format: { type: 'json_object' },
        // Slightly creative but not unhinged — captions need to land in
        // the requested voice without inventing facts about the hotel.
        temperature: 0.8,
        max_tokens: 600,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `OpenAI returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      )
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = body.choices?.[0]?.message?.content ?? ''
    return parseResult(content)
  } finally {
    clearTimeout(timer)
  }
}

function parseResult(raw: string): AiResult {
  try {
    const parsed = JSON.parse(raw) as {
      // The prompt asks for `variants: [{caption, hashtags: []}, ...]`.
      // We also accept a flat `captions` array (with a separate
      // `hashtags` parallel array) for resilience.
      variants?: unknown
      captions?: unknown
      hashtags?: unknown
    }

    if (Array.isArray(parsed.variants)) {
      const captions: string[] = []
      const hashtagSets: string[][] = []
      for (const v of parsed.variants) {
        if (!v || typeof v !== 'object') continue
        const obj = v as { caption?: unknown; hashtags?: unknown }
        if (typeof obj.caption !== 'string') continue
        const text = obj.caption.trim()
        if (!text) continue
        captions.push(text)
        hashtagSets.push(coerceHashtags(obj.hashtags))
        if (captions.length >= 3) break
      }
      if (captions.length > 0) return { captions, hashtagSets }
    }

    if (Array.isArray(parsed.captions)) {
      const captions = parsed.captions
        .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        .map((c) => c.trim())
        .slice(0, 3)
      const rawSets = Array.isArray(parsed.hashtags) ? parsed.hashtags : []
      const hashtagSets = captions.map((_, i) => coerceHashtags(rawSets[i]))
      if (captions.length > 0) return { captions, hashtagSets }
    }
  } catch {
    // Fall through to one-caption recovery below.
  }

  const trimmed = raw.trim()
  return trimmed ? { captions: [trimmed], hashtagSets: [[]] } : { captions: [], hashtagSets: [] }
}

function coerceHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    let tag = item.trim()
    if (!tag) continue
    // Models sometimes return bare words; sometimes return "#word". Normalize.
    if (!tag.startsWith('#')) tag = `#${tag}`
    // Strip spaces inside hashtags — Instagram won't accept them anyway.
    tag = tag.replace(/\s+/g, '')
    // Cap each hashtag at a sensible length so a runaway model can't
    // pollute the UI.
    if (tag.length > 64) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 8) break
  }
  return out
}
