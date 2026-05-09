'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItCredential, Property } from '@/lib/supabase/types'
import { saveCredentialAction, type ActionResult } from '../../actions'
import { CREDENTIAL_CATEGORY_LABELS, asOptions } from '../../_lib/labels'

const initial: ActionResult = {}

export function CredentialForm({
  properties,
  existing,
}: {
  properties: Property[]
  existing?: ItCredential
}) {
  const [state, action, pending] = useActionState(
    saveCredentialAction,
    initial,
  )
  const options = asOptions(CREDENTIAL_CATEGORY_LABELS)

  return (
    <form action={action} className="space-y-4">
      {existing ? (
        <input type="hidden" name="id" value={existing.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service name" htmlFor="cred-name">
          <Input
            id="cred-name"
            name="service_name"
            defaultValue={existing?.service_name ?? ''}
            placeholder="Mews PMS"
            required
          />
        </Field>
        <Field label="Category" htmlFor="cred-category">
          <select
            id="cred-category"
            name="category"
            defaultValue={existing?.category ?? 'pms'}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            required
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Property"
        htmlFor="cred-property"
        hint="Leave blank if this login covers the whole organization."
      >
        <select
          id="cred-property"
          name="property_id"
          defaultValue={existing?.property_id ?? ''}
          className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Login URL" htmlFor="cred-url">
        <Input
          id="cred-url"
          name="url"
          type="url"
          defaultValue={existing?.url ?? ''}
          placeholder="https://app.example.com/login"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username / email" htmlFor="cred-username">
          <Input
            id="cred-username"
            name="username"
            defaultValue={existing?.username ?? ''}
          />
        </Field>
        <Field label="Password" htmlFor="cred-password">
          <Input
            id="cred-password"
            name="password"
            defaultValue={existing?.password ?? ''}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="cred-notes" hint="MFA setup, recovery codes location, who pays the bill...">
        <textarea
          id="cred-notes"
          name="notes"
          defaultValue={existing?.notes ?? ''}
          rows={3}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : existing ? 'Save changes' : 'Save login'}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  )
}
