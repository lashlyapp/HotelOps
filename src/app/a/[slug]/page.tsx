import { unstable_cache } from 'next/cache'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { arrivalCacheTag } from '@/app/(app)/arrival/_lib/cache-tags'
import {
  parseMarkdown,
  safeHref,
  type Block,
  type Node,
} from '@/app/(app)/arrival/_lib/sanitize'
import { r2PublicUrl } from '@/lib/r2/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ArrivalInfoItem,
  ArrivalMenuGroup,
  ArrivalPage,
  ArrivalSection,
  ItNetwork,
  Property,
} from '@/lib/supabase/types'

// We render the page from the live `arrival_pages` row (not a snapshot)
// for v1 — operators publish, but draft/published split lives in v1.1
// per spec. unstable_cache plus a slug-keyed cache tag keeps repeated
// guest scans from hammering Supabase.
const loadCached = (slug: string) =>
  unstable_cache(
    () => loadArrivalForSlug(slug),
    ['arrival-page', slug],
    { revalidate: 300, tags: [arrivalCacheTag(slug)] },
  )()

async function loadArrivalForSlug(slug: string): Promise<
  | {
      page: ArrivalPage
      property: Property
      sections: ArrivalSection[]
      networks: ItNetwork[]
    }
  | null
> {
  const admin = createAdminClient()
  const { data: pageRow } = await admin
    .from('arrival_pages')
    .select('*')
    .eq('public_slug', slug)
    .maybeSingle()
  if (!pageRow) return null
  const page = pageRow as ArrivalPage
  if (!page.published_at) return null
  const [{ data: propertyRow }, { data: sectionRows }, { data: networkRows }] =
    await Promise.all([
      admin
        .from('properties')
        .select('*')
        .eq('id', page.property_id)
        .maybeSingle(),
      admin
        .from('arrival_sections')
        .select('*')
        .eq('page_id', page.id)
        .eq('is_published', true)
        .order('sort_order', { ascending: true }),
      admin
        .from('it_networks')
        .select('*')
        .eq('property_id', page.property_id)
        .eq('is_shareable', true)
        .order('label', { ascending: true }),
    ])
  if (!propertyRow) return null
  const property = propertyRow as Property
  const sections = (sectionRows ?? []) as ArrivalSection[]
  const hidden = new Set(page.hidden_network_ids)
  const networks = ((networkRows ?? []) as ItNetwork[]).filter(
    (n) => !hidden.has(n.id),
  )
  return { page, property, sections, networks }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await loadCached(slug)
  return {
    title: data?.property.name ?? 'Arrival',
    robots: { index: false, follow: false },
  }
}

export default async function ArrivalPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await loadCached(slug)
  if (!data) notFound()
  const { page, property, sections, networks } = data
  const brand = page.brand_color ?? '#0F172A'

  return (
    <div
      className="min-h-screen bg-white text-slate-900"
      style={
        {
          // Expose the brand color as a CSS var so section accents pick it
          // up without re-threading the value into every component.
          '--arrival-brand': brand,
        } as React.CSSProperties
      }
    >
      <header
        className="px-5 py-8 text-white"
        style={{ background: brand }}
      >
        <div className="mx-auto max-w-2xl">
          {property.logo_key ? (
            <Image
              src={r2PublicUrl(property.logo_key)}
              alt=""
              width={140}
              height={40}
              unoptimized
              className="mb-3 h-10 w-auto object-contain"
            />
          ) : null}
          <p className="text-xs uppercase tracking-[0.25em] opacity-70">
            Welcome
          </p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight">
            {page.welcome_heading ?? property.name}
          </h1>
          {page.welcome_body ? (
            <div className="mt-3 space-y-2 text-sm leading-relaxed opacity-90">
              <Markdown blocks={parseMarkdown(page.welcome_body)} />
            </div>
          ) : null}
        </div>
      </header>

      <nav
        aria-label="On this page"
        className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl gap-3 overflow-x-auto px-5 py-2 text-sm">
          {networks.length > 0 ? (
            <AnchorLink href="#wifi">Wi-Fi</AnchorLink>
          ) : null}
          {sections.map((s) => (
            <AnchorLink key={s.id} href={`#section-${s.id}`}>
              {s.title}
            </AnchorLink>
          ))}
          {page.quick_info.length > 0 ||
          page.checkout_time ||
          page.parking ||
          page.pet_policy ||
          page.contact_phone ? (
            <AnchorLink href="#info">Info</AnchorLink>
          ) : null}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl space-y-10 px-5 py-8">
        {networks.length > 0 ? (
          <Section id="wifi" title="Wi-Fi">
            <ul className="space-y-3">
              {networks.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-slate-200 p-3"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {n.label}
                  </p>
                  {n.ssid ? (
                    <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                      Network
                    </p>
                  ) : null}
                  {n.ssid ? (
                    <p className="font-mono text-base text-slate-900">
                      {n.ssid}
                    </p>
                  ) : null}
                  {n.password ? (
                    <>
                      <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">
                        Password
                      </p>
                      <p className="select-all font-mono text-base text-slate-900">
                        {n.password}
                      </p>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {sections.map((section) => (
          <Section
            key={section.id}
            id={`section-${section.id}`}
            title={section.title}
          >
            {section.kind === 'menu'
              ? renderMenu(section)
              : renderInfo(section)}
          </Section>
        ))}

        <Section id="info" title="Good to know">
          <QuickInfo page={page} />
        </Section>
      </main>

      <footer className="border-t border-slate-200 px-5 py-6 text-center text-xs text-slate-500">
        {property.name}
        {property.phone ? ` · ${property.phone}` : ''}
      </footer>
    </div>
  )
}

function AnchorLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="rounded-sm px-2 py-1 text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      {children}
    </a>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <h2
        className="mb-3 text-xs uppercase tracking-[0.25em] text-slate-500"
        style={{ color: 'var(--arrival-brand)' }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm text-slate-800">{children}</div>
    </section>
  )
}

function renderInfo(section: ArrivalSection) {
  if (!('items' in section.body)) return null
  const items = (section.body as { items: ArrivalInfoItem[] }).items
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No items.</p>
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const href = item.url ? safeHref(item.url) : null
        return (
          <li
            key={item.id}
            className="overflow-hidden rounded-md border border-slate-200"
          >
            {item.image_key ? (
              <Image
                src={r2PublicUrl(item.image_key)}
                alt=""
                width={800}
                height={400}
                unoptimized
                className="h-40 w-full object-cover"
              />
            ) : null}
            <div className="p-3 space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                {item.title}
              </h3>
              {item.subtitle ? (
                <p className="text-sm text-slate-600">{item.subtitle}</p>
              ) : null}
              {item.hours ? (
                <p className="text-sm font-medium text-slate-900">
                  {item.hours}
                </p>
              ) : null}
              {item.body ? (
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {item.body}
                </p>
              ) : null}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-block text-sm font-medium underline"
                  style={{ color: 'var(--arrival-brand)' }}
                >
                  Learn more →
                </a>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function renderMenu(section: ArrivalSection) {
  if (!('groups' in section.body)) return null
  const groups = (section.body as { groups: ArrivalMenuGroup[] }).groups
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">Menu coming soon.</p>
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          <h3
            className="mb-2 text-base font-semibold"
            style={{ color: 'var(--arrival-brand)' }}
          >
            {group.name}
          </h3>
          <ul className="divide-y divide-slate-200">
            {group.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                {item.image_key ? (
                  <Image
                    src={r2PublicUrl(item.image_key)}
                    alt=""
                    width={120}
                    height={120}
                    unoptimized
                    className="h-16 w-16 rounded-md object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {item.name}
                    </p>
                    {item.price ? (
                      <p className="text-sm font-medium text-slate-900 tabular-nums">
                        {item.price}
                      </p>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="mt-0.5 text-xs text-slate-600">
                      {item.description}
                    </p>
                  ) : null}
                  {(item.diet ?? []).length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {(item.diet ?? []).map((d, i) => (
                        <span
                          key={`${d}-${i}`}
                          className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600"
                        >
                          {d}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function QuickInfo({ page }: { page: ArrivalPage }) {
  const rows: Array<{ label: string; value: string }> = []
  if (page.checkout_time) rows.push({ label: 'Checkout', value: page.checkout_time })
  if (page.contact_phone) rows.push({ label: 'Front desk', value: page.contact_phone })
  if (page.parking) rows.push({ label: 'Parking', value: page.parking })
  if (page.pet_policy) rows.push({ label: 'Pets', value: page.pet_policy })
  if (page.smoking_policy) rows.push({ label: 'Smoking', value: page.smoking_policy })
  rows.push(...page.quick_info)
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No extra info.</p>
  }
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="rounded-md border border-slate-200 p-3"
        >
          <dt className="text-xs uppercase tracking-wider text-slate-500">
            {r.label}
          </dt>
          <dd className="mt-0.5 text-sm text-slate-900">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Markdown({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i}>
            <RenderNodes nodes={block.children} />
          </p>
        ) : (
          <ul key={i} className="list-disc pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <RenderNodes nodes={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  )
}

function RenderNodes({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case 'text':
            return <span key={i}>{node.text}</span>
          case 'bold':
            return (
              <strong key={i}>
                <RenderNodes nodes={node.children} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <RenderNodes nodes={node.children} />
              </em>
            )
          case 'link': {
            const href = safeHref(node.href)
            return href ? (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline"
              >
                <RenderNodes nodes={node.children} />
              </a>
            ) : (
              <span key={i}>
                <RenderNodes nodes={node.children} />
              </span>
            )
          }
        }
      })}
    </>
  )
}
