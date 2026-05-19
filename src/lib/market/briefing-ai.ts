import 'server-only'
import type {
  MarketDemandSignal,
  PricingRecommendation,
  Property,
  PropertyMarketProfile,
  ReviewSentimentSignal,
} from '@/lib/supabase/types'

// AI briefing polisher. Takes the structured signal set + rule-based
// briefing draft, sends it to a small chat model, returns natural
// prose. Falls back to the original draft if no key is set or the
// call fails — the rule-based composer in briefing.ts is the source
// of truth for the underlying numbers; the AI layer ONLY rewords.
//
// Cost target: ~$0.001 per property per day at gpt-4o-mini rates.

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const TIMEOUT_MS = 15_000

export type BriefingInputs = {
  property: Property
  profile: PropertyMarketProfile
  draftHeadline: string
  draftBody: string
  outlook: string
  topSignals: MarketDemandSignal[]
  topRecommendations: PricingRecommendation[]
  reviewSignal: ReviewSentimentSignal | null
}

export type PolishedBriefing = {
  headline: string
  body: string
}

export async function polishBriefingWithAi(
  inputs: BriefingInputs,
): Promise<PolishedBriefing | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const userPayload = buildUserPayload(inputs)
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
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPayload },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 500,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as Partial<PolishedBriefing>
    if (!parsed?.headline || !parsed?.body) return null
    return {
      headline: String(parsed.headline).slice(0, 200),
      body: String(parsed.body).slice(0, 1800),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const SYSTEM = `You polish daily market briefings for boutique hotel GMs. Style:
- Executive, confident, conversational. Never analytical or BI-style.
- Mobile-readable: short sentences, 2-3 paragraphs MAX, no bullets in the body unless the input has them.
- Never invent facts not in the inputs. Never reference data not provided.
- The "headline" is one sentence. Lead with the most actionable observation.
- The "body" expands the headline with 2-3 short paragraphs covering demand outlook, comp-set movement, and 1-2 specific opportunities.
- Use the property's currency and market context. Never speak about other properties or markets.
Return strict JSON: { "headline": string, "body": string }.`

function buildUserPayload(inputs: BriefingInputs): string {
  const lines: string[] = []
  lines.push(`Property: ${inputs.property.name} (${inputs.profile.market_segment}, tier ${inputs.profile.tier})`)
  if (inputs.profile.location_descriptor) {
    lines.push(`Location: ${inputs.profile.location_descriptor}`)
  }
  lines.push(`Demand outlook: ${inputs.outlook}`)
  if (inputs.topSignals.length > 0) {
    lines.push('\nUpcoming demand signals:')
    for (const s of inputs.topSignals.slice(0, 4)) {
      lines.push(`- ${s.signal_date}: ${s.headline} (intensity ${s.intensity}/5)`)
    }
  }
  if (inputs.topRecommendations.length > 0) {
    lines.push('\nActive opportunities:')
    for (const r of inputs.topRecommendations.slice(0, 4)) {
      lines.push(`- ${r.target_date}: ${r.headline}`)
    }
  }
  if (inputs.reviewSignal) {
    const r = inputs.reviewSignal
    lines.push('\nReview trend (last 30d):')
    if (r.rating_avg != null) lines.push(`- avg rating ${r.rating_avg.toFixed(1)}`)
    if (r.rating_delta_vs_prev != null) {
      const sign = r.rating_delta_vs_prev >= 0 ? '+' : ''
      lines.push(`- delta vs prior 30d: ${sign}${r.rating_delta_vs_prev.toFixed(2)}`)
    }
    if (r.top_complaint_theme) lines.push(`- top complaint theme: "${r.top_complaint_theme}"`)
    if (r.top_praise_theme) lines.push(`- top praise theme: "${r.top_praise_theme}"`)
  }
  lines.push('\nRule-based draft (rewrite this in your voice; preserve all facts and numbers):')
  lines.push(`HEADLINE: ${inputs.draftHeadline}`)
  lines.push(`BODY:\n${inputs.draftBody}`)
  return lines.join('\n')
}
