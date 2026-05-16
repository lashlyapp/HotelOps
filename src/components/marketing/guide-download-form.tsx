'use client'

import { useActionState } from 'react'
import {
  type GuideRequestResult,
  type GuideSlug,
  requestGuideDownload,
} from '@/app/blog/actions'

type Props = {
  guideSlug: GuideSlug
  /** Copy strings — passed in rather than read from dictionary here
   *  so the post page (server-rendered) keeps full control of the
   *  locale resolution and this component stays presentational. */
  t: {
    heading: string
    sub: string
    nameLabel: string
    namePlaceholder: string
    emailLabel: string
    emailPlaceholder: string
    hotelLabel: string
    hotelPlaceholder: string
    websiteLabel: string
    websitePlaceholder: string
    submit: string
    submitting: string
    privacy: string
    successHeading: string
    successBody: string
    successCta: string
    successFallback: string
  }
}

const INITIAL: GuideRequestResult = {}

export function GuideDownloadForm({ guideSlug, t }: Props) {
  const [state, action, pending] = useActionState(
    requestGuideDownload,
    INITIAL,
  )

  // Empty downloadUrl is the honeypot-tripped sentinel: pretend the
  // submission succeeded so a bot does not learn to retry, but render
  // a plain confirmation without a download CTA.
  if (state.success && state.success.downloadUrl) {
    return (
      <div className="not-prose mt-10 rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Sent
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-fg">
          {t.successHeading}
        </h3>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          {t.successBody}
        </p>
        <div className="mt-5">
          <a
            href={state.success.downloadUrl}
            className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            {t.successCta}
          </a>
        </div>
        <p className="mt-4 text-xs text-subtle">{t.successFallback}</p>
      </div>
    )
  }
  if (state.success) {
    return (
      <div className="not-prose mt-10 rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Sent
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-fg">
          {t.successHeading}
        </h3>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          {t.successBody}
        </p>
      </div>
    )
  }

  return (
    <form
      action={action}
      className="not-prose mt-10 rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8"
    >
      <input type="hidden" name="guide_slug" value={guideSlug} />
      {/* Honeypot: humans don't see this; bots fill every input.
          aria-hidden + tabIndex=-1 keep assistive tech off it,
          autoComplete=off discourages browser autofill from
          tripping it for real users on saved-form devices. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
      >
        <label>
          Company size
          <input
            type="text"
            name="company_size"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-fg">
        {t.heading}
      </h3>
      <p className="mt-2 text-sm text-muted leading-relaxed">{t.sub}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          name="name"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          required
          autoComplete="name"
        />
        <Field
          name="email"
          type="email"
          label={t.emailLabel}
          placeholder={t.emailPlaceholder}
          required
          autoComplete="email"
        />
        <Field
          name="hotel_name"
          label={t.hotelLabel}
          placeholder={t.hotelPlaceholder}
          required
          autoComplete="organization"
        />
        <Field
          name="website"
          type="url"
          label={t.websiteLabel}
          placeholder={t.websitePlaceholder}
          autoComplete="url"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-4 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {pending ? t.submitting : t.submit}
        </button>
        <p className="text-xs text-subtle">{t.privacy}</p>
      </div>
    </form>
  )
}

function Field({
  name,
  label,
  placeholder,
  type = 'text',
  required = false,
  autoComplete,
}: {
  name: string
  label: string
  placeholder: string
  type?: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-fg">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-red-600">
            *
          </span>
        ) : null}
      </span>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        maxLength={400}
        className="focus-ring mt-1 block h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder-subtle"
      />
    </label>
  )
}
