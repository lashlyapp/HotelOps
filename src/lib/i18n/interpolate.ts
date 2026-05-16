/**
 * Replace `{name}` placeholders in a template string with values from
 * a vars object. Missing keys are left as-is (`{name}`) so the
 * unsubstituted token shows up loudly in the output instead of an
 * empty string or `undefined` — easier to spot than a silent miss.
 *
 *   interpolate('Hi {name}', { name: 'Ada' })  → 'Hi Ada'
 *   interpolate('Hi {name}', {})               → 'Hi {name}'
 *   interpolate('{a} + {a}', { a: 'x' })       → 'x + x'
 *
 * Used by the dictionary-driven copy on signup pages + transactional
 * emails. Pure function; safe in both server and edge runtimes.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  )
}
