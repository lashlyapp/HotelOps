'use server'

import { revalidatePath } from 'next/cache'
import { encryptString } from '@/lib/crypto/aes'
import { getEmailFrom, getResend } from '@/lib/email/client'
import { requireOrgUser, denyIfRestricted } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BrandVoice } from '@/lib/supabase/types'

export type ActionResult = { error?: string; success?: string }

const BRAND_VOICES: BrandVoice[] = [
  'warm',
  'luxury',
  'boutique',
  'family',
  'casual',
  'playful',
]

function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}
function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
}

async function loadPropertyInOrg(orgId: string, propertyId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}

// ---------------------------------------------------------------------------
// Save per-property settings (voice, API key, hashtags, handles)
// ---------------------------------------------------------------------------
export async function saveSocialSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const blocked = denyIfRestricted(session)
  if (blocked) return blocked

  const propertyId = trim(formData.get('property_id'))
  if (!propertyId) return { error: 'Missing property.' }
  if (!(await loadPropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }

  const brandVoice = trim(formData.get('brand_voice')) as BrandVoice
  if (!BRAND_VOICES.includes(brandVoice)) {
    return { error: 'Pick a brand voice.' }
  }

  const hashtags = trimOrNull(formData.get('signature_hashtags'))
  const handles = trimOrNull(formData.get('social_handles'))

  // The OpenAI key field. Three states:
  //   - left blank, no existing key  → null
  //   - left blank, existing key     → keep existing (don't overwrite)
  //   - submitted plaintext          → re-encrypt and replace
  // A "clear" checkbox lets the GM remove a previously-set key.
  const rawKey = trim(formData.get('openai_api_key'))
  const clearKey = formData.get('clear_openai_api_key') === 'on'

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('property_social_settings')
    .select('openai_api_key_enc')
    .eq('property_id', propertyId)
    .maybeSingle()

  let openai_api_key_enc: string | null
  if (clearKey) {
    openai_api_key_enc = null
  } else if (rawKey !== '') {
    if (!rawKey.startsWith('sk-')) {
      return { error: 'OpenAI keys start with "sk-". Double-check what you pasted.' }
    }
    try {
      openai_api_key_enc = encryptString(rawKey)
    } catch (err) {
      console.error('[social] failed to encrypt API key', err)
      return {
        error:
          'Could not securely store the key — server encryption is misconfigured. Contact support.',
      }
    }
  } else {
    openai_api_key_enc = existing?.openai_api_key_enc ?? null
  }

  const row = {
    property_id: propertyId,
    org_id: session.organization.id,
    brand_voice: brandVoice,
    openai_api_key_enc,
    signature_hashtags: hashtags,
    social_handles: handles,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from('property_social_settings')
    .upsert(row, { onConflict: 'property_id' })
  if (error) return { error: error.message }

  revalidatePath('/social')
  revalidatePath('/social/settings')
  return { success: 'Settings saved.' }
}

// ---------------------------------------------------------------------------
// Like / dislike a caption variant — drives the few-shot bias in
// future generations. Upserts on (property, caption) so flipping the
// vote works without dupes.
// ---------------------------------------------------------------------------
export async function voteCaptionAction(formData: FormData): Promise<void> {
  const session = await requireOrgUser({ write: true })
  if (denyIfRestricted(session)) return

  const propertyId = trim(formData.get('property_id'))
  const caption = trim(formData.get('caption'))
  const topic = trim(formData.get('topic'))
  const vote = trim(formData.get('vote')) // 'like' | 'dislike' | 'clear'
  if (!propertyId || !caption || !topic) return
  if (!(await loadPropertyInOrg(session.organization.id, propertyId))) return

  const admin = createAdminClient()

  if (vote === 'clear') {
    await admin
      .from('social_caption_feedback')
      .delete()
      .eq('property_id', propertyId)
      .eq('caption', caption)
  } else if (vote === 'like' || vote === 'dislike') {
    await admin.from('social_caption_feedback').upsert(
      {
        property_id: propertyId,
        org_id: session.organization.id,
        caption,
        topic,
        liked: vote === 'like',
        voter_id: session.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'property_id,caption' },
    )
  }

  revalidatePath('/social')
}

// ---------------------------------------------------------------------------
// Email the post to the signed-in GM. Uses Resend if configured;
// otherwise reports a soft failure so the UI can still nudge the user
// to copy/download.
// ---------------------------------------------------------------------------
export async function emailPostAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser()
  const caption = trim(formData.get('caption'))
  const imageUrl = trimOrNull(formData.get('image_url'))
  const propertyName = trim(formData.get('property_name')) || 'your hotel'
  if (!caption) return { error: 'Missing caption.' }

  const resend = getResend()
  if (!resend) {
    return {
      error:
        "Email isn't configured on this environment. Use the copy/download buttons instead.",
    }
  }

  const subject = `Today's post for ${propertyName}`
  const text = [
    `Here's the caption to post for ${propertyName} today:`,
    '',
    caption,
    '',
    imageUrl ? `Image: ${imageUrl}` : 'No image suggested — pair with one of your own.',
  ].join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      <p>Here's the caption to post for <strong>${escapeHtml(propertyName)}</strong> today:</p>
      <p style="background:#f5f5f4;border-left:3px solid #1c1917;padding:12px 16px;white-space:pre-wrap">${escapeHtml(caption)}</p>
      ${
        imageUrl
          ? `<p><a href="${imageUrl}" style="color:#1c1917">Open suggested image</a></p>
             <p><img src="${imageUrl}" alt="Suggested image" style="max-width:100%;border-radius:8px;border:1px solid #e7e5e4"/></p>`
          : `<p style="color:#57534e">No image suggested — pair with one of your own.</p>`
      }
    </div>
  `.trim()

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: session.email,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[social] resend email error', error)
      return { error: 'Could not send the email — try again in a minute.' }
    }
  } catch (err) {
    console.error('[social] resend threw', err)
    return { error: 'Could not send the email — try again in a minute.' }
  }

  return { success: `Sent to ${session.email}.` }
}

// ---------------------------------------------------------------------------
// Mark today's post as "used" so a) the topic feeds rotation history
// and b) the UI can show a subtle "you've posted today" indicator.
// ---------------------------------------------------------------------------
export async function markPostUsedAction(formData: FormData): Promise<void> {
  const session = await requireOrgUser({ write: true })
  if (denyIfRestricted(session)) return

  const propertyId = trim(formData.get('property_id'))
  const topic = trim(formData.get('topic'))
  const captionsRaw = trim(formData.get('captions'))
  const hashtagSetsRaw = trim(formData.get('hashtag_sets'))
  const mediaKey = trimOrNull(formData.get('media_key'))
  if (!propertyId || !topic || !captionsRaw) return
  if (!(await loadPropertyInOrg(session.organization.id, propertyId))) return

  let captions: string[]
  try {
    const parsed = JSON.parse(captionsRaw) as unknown
    if (!Array.isArray(parsed)) return
    captions = parsed.filter((c): c is string => typeof c === 'string')
  } catch {
    return
  }

  let hashtagSets: string[][] = captions.map(() => [])
  if (hashtagSetsRaw) {
    try {
      const parsed = JSON.parse(hashtagSetsRaw) as unknown
      if (Array.isArray(parsed)) {
        hashtagSets = parsed.map((set) =>
          Array.isArray(set)
            ? set.filter((t): t is string => typeof t === 'string')
            : [],
        )
      }
    } catch {
      // Keep the empty default — bad shape just means no hashtags in history.
    }
  }

  const admin = createAdminClient()
  await admin.from('social_post_log').insert({
    property_id: propertyId,
    org_id: session.organization.id,
    topic,
    captions,
    hashtag_sets: hashtagSets,
    media_key: mediaKey,
    marked_used_at: new Date().toISOString(),
  })
  revalidatePath('/social')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
