# MyHotelOps Design System

The foundation that everything else builds on. The principle is simple: **markup references roles, not raw colors**. If you find yourself writing `bg-zinc-100` or `#0c0a09` in a component, stop — there's a token for that.

## Where things live

| Concern              | File                                     |
| -------------------- | ---------------------------------------- |
| Tokens (CSS vars)    | `src/app/globals.css`                    |
| Tailwind theme map   | `src/app/globals.css` (`@theme inline`)  |
| Fonts                | `src/app/layout.tsx` (`next/font`)       |
| Brand strings        | `src/lib/brand.ts`                       |
| Wordmark             | `src/components/brand/wordmark.tsx`      |
| Footer               | `src/components/layout/footer.tsx`       |
| UI primitives        | `src/components/ui/*`                    |

## Color tokens

All colors are exposed as semantic Tailwind utilities. **Use these, not raw palettes.**

### Backgrounds & surfaces

- `bg-bg` — page background
- `bg-surface` — cards, inputs, elevated panels
- `bg-surface-muted` — subtle highlights, sidebar, table headers
- `bg-surface-elevated` — modals, popovers (room to differ from `surface` in dark mode)

### Text

- `text-fg` — primary copy (headings, body)
- `text-muted` — secondary copy (captions, meta)
- `text-subtle` — tertiary (placeholders, hints, disabled labels)

### Borders

- `border-border-subtle` — default card borders, table dividers
- `border-border-default` — input borders
- `border-border-strong` — focus / hover states on borders

### Brand action

- `bg-primary` / `text-primary-fg` — the call-to-action button
- `bg-primary-hover` — hover state

### Status

`{tone}-bg` for the background, `{tone}-fg` for the text. Used by `<Badge>`.

| Tone     | Use                            |
| -------- | ------------------------------ |
| success  | paid, success states           |
| warning  | pending, attention needed      |
| danger   | errors, destructive actions    |
| info     | informational, neutral notices |

### Focus

- `text-ring` is the ring color used by the `focus-ring` utility. Add `focus-ring` to any focusable element to get the standard 2px outline.

## Radii

`rounded-xs` (4px) · `rounded-sm` (6px) · `rounded-md` (8px, default for inputs/buttons) · `rounded-lg` (12px, default for cards) · `rounded-xl` (16px) · `rounded-full`

## Shadows

`shadow-xs` · `shadow-sm` · `shadow-md` · `shadow-lg` — all four scale into dark mode (deeper alpha so they remain visible against a dark surface).

## Motion

CSS variables `--duration-fast` (120ms), `--duration-base` (180ms), `--ease-out` are available for transitions. Most primitives use these via inline `transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]`.

## Typography

- **Sans (`font-sans`)** — Inter, loaded via `next/font` with `--font-inter` variable. Used for everything by default.
- **Mono (`font-mono`)** — JetBrains Mono, used for code, file paths, URLs.

There is no separate display font in v1. If we add a serif/display family later, it goes here as `font-display`.

## Dark mode

Driven by `prefers-color-scheme`. Every semantic token has a dark counterpart in `globals.css`. To support manual theme toggling later, add a `[data-theme="dark"]` selector mirroring the media-query block.

## Adding a new component

1. Build it in `src/components/ui/` if it's a generic primitive, or in a feature folder if it's specific.
2. Reference **only** semantic tokens (`bg-surface`, `text-muted`, etc).
3. Apply the `focus-ring` utility to any focusable element.
4. If the component has variants (e.g. `tone`, `size`), define them as a `Record<Tone, string>` map at the top of the file — keep variant logic out of JSX.

## Brand

Strings live in `src/lib/brand.ts` (legal name, address, support email, domain). Use the `<Wordmark>` component for the logo lockup; do not hand-roll "MyHotelOps" in markup.
