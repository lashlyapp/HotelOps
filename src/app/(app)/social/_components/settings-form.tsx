'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BrandVoice } from '@/lib/supabase/types'
import { saveSocialSettingsAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

const VOICES: { value: BrandVoice; label: string; hint: string }[] = [
  { value: 'warm', label: 'Warm', hint: 'Welcoming, sincere, conversational.' },
  { value: 'luxury', label: 'Luxury', hint: 'Elevated, restrained, confident.' },
  { value: 'boutique', label: 'Boutique', hint: 'Curated, distinctive, a touch of wit.' },
  { value: 'family', label: 'Family', hint: 'Friendly, inclusive, easy.' },
  { value: 'casual', label: 'Casual', hint: 'Plainspoken, neighbor-next-door.' },
  { value: 'playful', label: 'Playful', hint: 'Cheeky, light, emoji-friendly.' },
]

export type SettingsFormProps = {
  propertyId: string
  initial: {
    brand_voice: BrandVoice
    signature_hashtags: string
    social_handles: string
    hasOpenAiKey: boolean
  }
}

export function SettingsForm({ propertyId, initial: init }: SettingsFormProps) {
  const [state, action, pending] = useActionState(saveSocialSettingsAction, initial)
  const [showKeyInput, setShowKeyInput] = useState(!init.hasOpenAiKey)

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="property_id" value={propertyId} />

      <div className="space-y-2">
        <Label>Brand voice</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VOICES.map((v) => (
            <label
              key={v.value}
              className="focus-ring flex cursor-pointer items-start gap-2 rounded-md border border-border-default bg-surface p-3 has-[:checked]:border-fg has-[:checked]:bg-surface-muted"
            >
              <input
                type="radio"
                name="brand_voice"
                value={v.value}
                defaultChecked={init.brand_voice === v.value}
                className="mt-0.5 accent-fg"
              />
              <span>
                <span className="block text-sm font-medium text-fg">{v.label}</span>
                <span className="block text-xs text-muted">{v.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signature_hashtags">Signature hashtags</Label>
        <Input
          id="signature_hashtags"
          name="signature_hashtags"
          type="text"
          defaultValue={init.signature_hashtags}
          maxLength={300}
          placeholder="#boutiquehotel #santabarbara #stayhere"
        />
        <p className="text-xs text-subtle">
          Appended to every caption. The generator never inlines hashtags into the body of the post.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="social_handles">Social handle</Label>
        <Input
          id="social_handles"
          name="social_handles"
          type="text"
          defaultValue={init.social_handles}
          maxLength={120}
          placeholder="@blueheronhotel"
        />
        <p className="text-xs text-subtle">
          Mentioned in captions when natural — handy for cross-posting from a regional account.
        </p>
      </div>

      <div className="space-y-1.5 border-t border-border-subtle pt-5">
        <Label htmlFor="openai_api_key">OpenAI API key</Label>
        {init.hasOpenAiKey && !showKeyInput ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm">
            <span className="text-muted">A key is on file (hidden).</span>
            <button
              type="button"
              className="focus-ring rounded-sm text-fg underline-offset-2 hover:underline"
              onClick={() => setShowKeyInput(true)}
            >
              Replace
            </button>
            <span className="text-subtle">·</span>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                name="clear_openai_api_key"
                className="accent-fg"
              />
              Clear key
            </label>
          </div>
        ) : (
          <Input
            id="openai_api_key"
            name="openai_api_key"
            type="password"
            autoComplete="off"
            placeholder="sk-..."
            maxLength={200}
          />
        )}
        <p className="text-xs text-subtle">
          Encrypted at rest. Used only to generate captions for this property. Without a key, the app uses templated drafts with placeholders. Get one at{' '}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer noopener"
            className="text-fg underline-offset-2 hover:underline"
          >
            platform.openai.com/api-keys
          </a>
          .
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  )
}
