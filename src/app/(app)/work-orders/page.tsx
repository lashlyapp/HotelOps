import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Profile,
  WorkOrder,
  WorkOrderAttachment,
  WorkOrderStatus,
} from '@/lib/supabase/types'
import { Board } from './_components/board'
import type { WorkOrderCardData } from './_components/card'
import { PRIORITY_ORDER, STATUS_ORDER } from './_lib/labels'

type SearchParams = Promise<{
  property?: string
  mine?: string
}>

export default async function WorkOrdersBoardPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireOrgUser()
  const params = await searchParams
  const propertySlug = params.property
  const mine = params.mine === '1'

  if (session.properties.length === 0) {
    return (
      <div className="p-4 sm:p-8">
        <Card>
          <CardBody className="text-sm text-muted">
            Add a property first, then come back to start tracking work.
          </CardBody>
        </Card>
      </div>
    )
  }

  const propertyTabs = [
    { slug: '', name: 'All properties', id: null as string | null },
    ...session.properties.map((p) => ({
      slug: p.slug,
      name: p.name,
      id: p.id,
    })),
  ]
  const activeProperty =
    propertyTabs.find((p) => p.slug === propertySlug) ?? propertyTabs[0]

  const admin = createAdminClient()
  let q = admin
    .from('work_orders')
    .select('*')
    .eq('org_id', session.organization.id)
  if (activeProperty.id) q = q.eq('property_id', activeProperty.id)
  if (mine) q = q.eq('assignee_id', session.userId)
  const { data: workOrderRows } = await q.order('created_at', { ascending: false })
  const workOrders = (workOrderRows ?? []) as WorkOrder[]
  const workOrderIds = workOrders.map((t) => t.id)

  // Batched fetches keyed by work_order_id — single round trip each regardless of
  // work order count (Supabase IN clauses are happy up to a few hundred ids; we
  // limit upstream at the property tab to keep this comfortable).
  const attachmentsByWorkOrder = new Map<string, WorkOrderAttachment[]>()
  const commentCountByWorkOrder = new Map<string, number>()
  const assigneeNameById = new Map<string, string>()

  if (workOrderIds.length > 0) {
    const [{ data: attachments }, { data: comments }] = await Promise.all([
      admin
        .from('work_order_attachments')
        .select('*')
        .in('work_order_id', workOrderIds)
        .order('created_at', { ascending: true }),
      admin
        .from('work_order_comments')
        .select('work_order_id')
        .in('work_order_id', workOrderIds),
    ])
    for (const att of (attachments ?? []) as WorkOrderAttachment[]) {
      const list = attachmentsByWorkOrder.get(att.work_order_id) ?? []
      list.push(att)
      attachmentsByWorkOrder.set(att.work_order_id, list)
    }
    for (const c of comments ?? []) {
      const n = commentCountByWorkOrder.get(c.work_order_id) ?? 0
      commentCountByWorkOrder.set(c.work_order_id, n + 1)
    }

    const assigneeIds = [
      ...new Set(
        workOrders
          .map((t) => t.assignee_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]
    if (assigneeIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', assigneeIds)
      for (const p of (profiles ?? []) as Pick<Profile, 'id' | 'full_name'>[]) {
        if (p.full_name) assigneeNameById.set(p.id, p.full_name)
      }
    }
  }

  // Group + sort: priority first, then newest, within each status column.
  const groups: Record<WorkOrderStatus, WorkOrderCardData[]> = {
    open: [],
    in_progress: [],
    waiting: [],
    done: [],
  }
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))
  for (const workOrder of workOrders) {
    groups[workOrder.status].push({
      workOrder,
      attachments: attachmentsByWorkOrder.get(workOrder.id) ?? [],
      property: propertyById.get(workOrder.property_id),
      assigneeLabel: workOrder.assignee_id
        ? assigneeNameById.get(workOrder.assignee_id) ?? 'Assigned'
        : null,
      commentCount: commentCountByWorkOrder.get(workOrder.id) ?? 0,
    })
  }
  for (const status of STATUS_ORDER) {
    groups[status].sort((a, b) => {
      const p = PRIORITY_ORDER[a.workOrder.priority] - PRIORITY_ORDER[b.workOrder.priority]
      if (p !== 0) return p
      return (
        new Date(b.workOrder.created_at).getTime() -
        new Date(a.workOrder.created_at).getTime()
      )
    })
  }

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <Toolbar
        propertyTabs={propertyTabs}
        activeSlug={activeProperty.slug}
        mine={mine}
      />

      {workOrders.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No work orders yet.{' '}
            <Link
              href="/work-orders/new"
              className="focus-ring rounded-sm font-medium text-fg underline"
            >
              Capture the first one
            </Link>{' '}
            with a photo or a 10-second video.
          </CardBody>
        </Card>
      ) : (
        <Board groups={groups} />
      )}
    </div>
  )
}

function Toolbar({
  propertyTabs,
  activeSlug,
  mine,
}: {
  propertyTabs: { slug: string; name: string; id: string | null }[]
  activeSlug: string
  mine: boolean
}) {
  function hrefFor(opts: { propertySlug?: string; mine?: boolean }) {
    const params = new URLSearchParams()
    const ps = opts.propertySlug ?? activeSlug
    if (ps) params.set('property', ps)
    const m = opts.mine ?? mine
    if (m) params.set('mine', '1')
    const qs = params.toString()
    return qs ? `/work-orders?${qs}` : '/work-orders'
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav
        aria-label="Filter by property"
        className="flex flex-wrap gap-1 text-sm"
      >
        {propertyTabs.map((tab) => {
          const isActive = activeSlug === tab.slug
          return (
            <Link
              key={tab.slug || 'all'}
              href={hrefFor({ propertySlug: tab.slug })}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'focus-ring rounded-md bg-surface-muted px-3 py-1.5 font-medium text-fg'
                  : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg'
              }
            >
              {tab.name}
            </Link>
          )
        })}
      </nav>

      <div className="flex gap-1 text-sm">
        <Link
          href={hrefFor({ mine: false })}
          aria-current={!mine ? 'page' : undefined}
          className={
            !mine
              ? 'focus-ring rounded-md bg-surface-muted px-3 py-1.5 font-medium text-fg'
              : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg'
          }
        >
          All
        </Link>
        <Link
          href={hrefFor({ mine: true })}
          aria-current={mine ? 'page' : undefined}
          className={
            mine
              ? 'focus-ring rounded-md bg-surface-muted px-3 py-1.5 font-medium text-fg'
              : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg'
          }
        >
          Mine
        </Link>
      </div>
    </div>
  )
}
