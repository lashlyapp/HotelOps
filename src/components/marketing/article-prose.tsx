import type { ReactNode } from 'react'

/**
 * Tailwind-styled wrapper for long-form blog prose. We deliberately do not
 * pull in @tailwindcss/typography — the styles we need are a small,
 * stable set and we'd rather keep them in-tree than vendor a plugin.
 */
export function ArticleProse({ children }: { children: ReactNode }) {
  return (
    <div className="prose-fg max-w-2xl text-base leading-relaxed text-muted [&>p]:mt-5 [&>p:first-child]:mt-0 [&>h2]:mt-12 [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:text-fg [&>h3]:mt-8 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-fg [&>ul]:mt-5 [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-6 [&>ul>li]:pl-1 [&_strong]:text-fg [&_em]:italic">
      {children}
    </div>
  )
}
