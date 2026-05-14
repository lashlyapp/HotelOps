'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItDocument, ItDocumentFolder } from '@/lib/supabase/types'
import { updateDocumentAction, type UpdateResult } from '../actions'
import {
  DOCUMENT_CATEGORY_LABELS,
  asOptions,
} from '../../_lib/labels'
import { flattenFolderOptions } from '../_lib/folder-options'

const initial: UpdateResult = {}

export function EditDocumentForm({
  document,
  folders,
}: {
  document: ItDocument
  folders: ItDocumentFolder[]
}) {
  const [state, action, pending] = useActionState(updateDocumentAction, initial)
  const options = asOptions(DOCUMENT_CATEGORY_LABELS)
  const folderOptions = flattenFolderOptions(folders)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={document.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor={`doc-title-${document.id}`}>
          <Input
            id={`doc-title-${document.id}`}
            name="title"
            defaultValue={document.title}
            required
          />
        </Field>
        <Field label="Category" htmlFor={`doc-cat-${document.id}`}>
          <select
            id={`doc-cat-${document.id}`}
            name="category"
            defaultValue={document.category}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Folder" htmlFor={`doc-folder-${document.id}`}>
        <select
          id={`doc-folder-${document.id}`}
          name="folder_id"
          defaultValue={document.folder_id ?? ''}
          className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
        >
          <option value="">Documents (root)</option>
          {folderOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Expires" htmlFor={`doc-exp-${document.id}`}>
        <Input
          id={`doc-exp-${document.id}`}
          name="expires_at"
          type="date"
          defaultValue={document.expires_at ?? ''}
        />
      </Field>

      <Field label="Notes" htmlFor={`doc-notes-${document.id}`}>
        <textarea
          id={`doc-notes-${document.id}`}
          name="notes"
          defaultValue={document.notes ?? ''}
          rows={2}
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
        {pending ? 'Saving...' : 'Save changes'}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
