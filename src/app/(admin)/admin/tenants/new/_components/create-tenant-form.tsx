'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioOption } from '@/components/ui/radio-option'
import { createTenantAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function CreateTenantForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial)
  const [properties, setProperties] = useState<Array<{ id: number }>>([
    { id: 1 },
  ])
  const [nextId, setNextId] = useState(2)
  const [mode, setMode] = useState<'self' | 'admin'>('self')

  function addProperty() {
    setProperties((p) => [...p, { id: nextId }])
    setNextId((n) => n + 1)
  }
  function removeProperty(id: number) {
    setProperties((p) => (p.length > 1 ? p.filter((x) => x.id !== id) : p))
  }

  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            label="Display name"
            id="org_name"
            name="org_name"
            placeholder="Acme Hotel Group"
            required
          />
          <Field
            label="Slug"
            id="org_slug"
            name="org_slug"
            placeholder="acme-hotel-group"
            hint="Kebab-case. Used in R2 paths and stored as the org identifier. Cannot be changed once created."
            pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
            required
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {properties.map((p, idx) => (
            <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <Field
                label={idx === 0 ? 'Slug' : ''}
                id={`property_slug_${p.id}`}
                name="property_slug"
                placeholder="downtown-suites"
                pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
                required
              />
              <Field
                label={idx === 0 ? 'Display name' : ''}
                id={`property_name_${p.id}`}
                name="property_name"
                placeholder="Downtown Suites"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProperty(p.id)}
                disabled={properties.length === 1}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addProperty}
          >
            + Add property
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Initial owner</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            label="Email"
            id="owner_email"
            name="owner_email"
            type="email"
            placeholder="owner@acmehotelgroup.com"
            autoComplete="off"
            required
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Password</legend>
            <RadioOption
              id="tenant-mode-self"
              name="password_mode"
              value="self"
              checked={mode === 'self'}
              onChange={() => setMode('self')}
              label="Let them set their own password"
              hint="Sends a one-time setup link to the owner by email."
            />
            <RadioOption
              id="tenant-mode-admin"
              name="password_mode"
              value="admin"
              checked={mode === 'admin'}
              onChange={() => setMode('admin')}
              label="I'll set a temporary password"
              hint="Share through a secure channel."
            />
          </fieldset>

          {mode === 'admin' ? (
            <Field
              label="Temporary password"
              id="owner_password"
              name="owner_password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required={mode === 'admin'}
              hint="At least 8 characters."
            />
          ) : null}

          {mode === 'admin' ? (
            <Checkbox
              id="owner-send-welcome"
              name="send_welcome"
              defaultChecked
              label="Send welcome email to the owner"
              hint="Includes a sign-in link only — the password is not included."
            />
          ) : (
            <p className="text-xs text-subtle">
              A welcome email with the setup link will be sent to the owner.
            </p>
          )}
        </CardBody>
      </Card>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating...' : 'Create tenant'}
        </Button>
        <a
          href="/admin"
          className="focus-ring rounded-md px-3 py-2 text-sm font-medium text-muted hover:text-fg"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}

function Field({
  label,
  id,
  hint,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  id: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Input id={id} {...rest} />
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  )
}
