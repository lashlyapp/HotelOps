import { NextResponse, type NextRequest } from 'next/server'
import { generatePost } from '@/app/(app)/social/_lib/generator'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Organization, Property } from '@/lib/supabase/types'

/**
 * Vercel Cron: drafts one social post per property per day.
 *
 * Runs every morning (see vercel.json — 11:00 UTC, ~6am ET / 3am PT).
 * For every property under an org with social_studio_addon_active = true:
 *
 *   1. Skip if a row for (property_id, today) already exists. The
 *      unique constraint on social_post_log makes the upsert idempotent
 *      even without this check — the explicit skip just saves an
 *      OpenAI call when a retry fires after partial completion.
 *   2. Generate the post (topic pick, photo pick, captions+hashtags
 *      via OpenAI) — generator.ts handles the brand voice / feedback
 *      loop / template fallback.
 *   3. Upsert into social_post_log. The /social page reads this row;
 *      there is no on-demand generation, which keeps per-property AI
 *      cost flat at ~$0.0006 / day regardless of how many times the
 *      GM opens the page.
 *
 * Auth: same `Authorization: Bearer ${CRON_SECRET}` convention used by
 * the other crons.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Generating for many properties can take a while — each OpenAI call
// is a few seconds, plus weather lookups. Bump from the default 10s.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not set' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not set' },
      { status: 500 },
    )
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Orgs that have the add-on intent on. The reconciler keeps this
  // and the per-property SubscriptionItems in sync — but the daily
  // cron only needs the intent flag, since generation cost is borne
  // by the platform key, not by the per-property line item.
  const { data: orgs, error: orgsErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('social_studio_addon_active', true)
  if (orgsErr) {
    return NextResponse.json(
      { ok: false, error: `orgs lookup: ${orgsErr.message}` },
      { status: 500 },
    )
  }

  let generated = 0
  let skipped = 0
  const failures: string[] = []

  for (const org of (orgs ?? []) as Pick<Organization, 'id' | 'name'>[]) {
    const { data: properties } = await admin
      .from('properties')
      .select('*')
      .eq('org_id', org.id)
      .order('name', { ascending: true })

    for (const property of (properties ?? []) as Property[]) {
      // Cheap idempotency check before calling OpenAI.
      const { data: existing } = await admin
        .from('social_post_log')
        .select('id')
        .eq('property_id', property.id)
        .eq('post_date', today)
        .maybeSingle()
      if (existing) {
        skipped += 1
        continue
      }

      try {
        const post = await generatePost({
          property,
          orgName: org.name,
          today,
        })
        const { error: insertErr } = await admin
          .from('social_post_log')
          .upsert(
            {
              property_id: property.id,
              org_id: org.id,
              post_date: today,
              topic: post.topic.key,
              captions: post.captions,
              hashtag_sets: post.hashtagSets,
              media_key: post.media?.key ?? null,
            },
            { onConflict: 'property_id,post_date' },
          )
        if (insertErr) {
          failures.push(`${property.id}: ${insertErr.message}`)
          continue
        }
        generated += 1
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        failures.push(`${property.id}: ${message}`)
      }
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    generated,
    skipped,
    failures,
    date: today,
  })
}
