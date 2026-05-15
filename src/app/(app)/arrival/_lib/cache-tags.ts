/**
 * Cache-tag namespace for arrival pages. Shared by the public renderer
 * (which tags its `unstable_cache` entry) and the operator mutations in
 * `arrival/actions.ts` (which call `revalidateTag` to bust on writes).
 * Lives in its own module because `'use server'` files can only export
 * async functions.
 */
export function arrivalCacheTag(slug: string): string {
  return `arrival:${slug}`
}
