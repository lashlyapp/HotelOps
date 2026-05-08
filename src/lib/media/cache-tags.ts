/**
 * Cache-tag namespace for the catalog. Shared by `listMediaWithTags`
 * (which tags its `unstable_cache` entry) and the mutation actions in
 * `media/actions.ts` (which call `revalidateTag` to bust on writes).
 * Lives in its own module because `'use server'` files can only export
 * async functions.
 */
export function mediaCacheTag(propertyId: string): string {
  return `media:${propertyId}`
}
