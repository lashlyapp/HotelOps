/**
 * Convert a human-readable name into a kebab-case slug.
 *   "Cupertino Hotel"   → "cupertino-hotel"
 *   "St. Regis -- Aspen" → "st-regis-aspen"
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Append "-2", "-3", ... if the slug already exists.
 */
export function uniqueSlug(base: string, exists: (s: string) => boolean): string {
  if (!exists(base)) return base
  let n = 2
  while (exists(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
