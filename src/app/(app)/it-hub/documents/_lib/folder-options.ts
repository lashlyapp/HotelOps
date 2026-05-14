import type { ItDocumentFolder } from '@/lib/supabase/types'

export type FolderOption = { id: string; label: string }

/**
 * Flatten the folder tree into a depth-first list of {id, label} entries,
 * where label is the full path ("Vendor Contracts / Comcast / 2024"). Used
 * in <select> dropdowns where a single line per folder is the cleanest way
 * to express the hierarchy without a custom picker.
 */
export function flattenFolderOptions(
  folders: ItDocumentFolder[],
): FolderOption[] {
  const byParent = new Map<string | null, ItDocumentFolder[]>()
  for (const f of folders) {
    const key = f.parent_id
    const list = byParent.get(key) ?? []
    list.push(f)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  const out: FolderOption[] = []
  function walk(parentId: string | null, prefix: string) {
    for (const f of byParent.get(parentId) ?? []) {
      const label = prefix ? `${prefix} / ${f.name}` : f.name
      out.push({ id: f.id, label })
      walk(f.id, label)
    }
  }
  walk(null, '')
  return out
}
