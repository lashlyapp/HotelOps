import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Profile,
  WorkOrder,
  WorkOrderActivity,
  WorkOrderAttachment,
  WorkOrderComment,
} from '@/lib/supabase/types'
import { deleteWorkOrderAction } from '../actions'
import { ActivityList } from '../_components/activity-list'
import { CommentForm } from '../_components/comment-form'
import { EvidenceUploader } from '../_components/evidence-uploader'
import { Gallery } from '../_components/gallery'
import { StatusControls } from '../_components/status-controls'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  STATUS_LABELS,
  STATUS_TONE,
} from '../_lib/labels'
import { formatDateTime } from '../_lib/time'

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireOrgUser()

  const admin = createAdminClient()
  const { data: workOrderRow } = await admin
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!workOrderRow) notFound()
  const workOrder = workOrderRow as WorkOrder

  const [
    { data: attachmentsRows },
    { data: commentRows },
    { data: activityRows },
    { data: memberRows },
  ] = await Promise.all([
    admin
      .from('work_order_attachments')
      .select('*')
      .eq('work_order_id', workOrder.id)
      .order('created_at', { ascending: true }),
    admin
      .from('work_order_comments')
      .select('*')
      .eq('work_order_id', workOrder.id)
      .order('created_at', { ascending: true }),
    admin
      .from('work_order_activity')
      .select('*')
      .eq('work_order_id', workOrder.id)
      .order('created_at', { ascending: true }),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', session.organization.id),
  ])

  const attachments = (attachmentsRows ?? []) as WorkOrderAttachment[]
  const comments = (commentRows ?? []) as WorkOrderComment[]
  const activity = (activityRows ?? []) as WorkOrderActivity[]
  const members = (memberRows ?? []) as Pick<Profile, 'id' | 'full_name'>[]
  const profilesById = new Map(members.map((m) => [m.id, m]))
  const property = session.properties.find((p) => p.id === workOrder.property_id)
  const hasAfterEvidence = attachments.some((a) => a.phase === 'after')
  const isOwner = session.profile.role === 'org_owner'

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
      <div>
        <Link
          href="/work-orders"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to board
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-subtle">
              <span className="font-mono uppercase">{workOrder.reference}</span>
              <span>·</span>
              <span>{CATEGORY_LABELS[workOrder.category]}</span>
              {workOrder.location ? (
                <>
                  <span>·</span>
                  <span>{workOrder.location}</span>
                </>
              ) : null}
              {property ? (
                <>
                  <span>·</span>
                  <span>{property.name}</span>
                </>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">
              {workOrder.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[workOrder.status]}>
                {STATUS_LABELS[workOrder.status]}
              </Badge>
              <Badge tone={PRIORITY_TONE[workOrder.priority]}>
                {PRIORITY_LABELS[workOrder.priority]} priority
              </Badge>
            </div>
          </div>
          {isOwner ? (
            <form action={deleteWorkOrderAction}>
              <input type="hidden" name="id" value={workOrder.id} />
              <button
                type="submit"
                className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
              >
                Delete work order
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6 min-w-0">
          {workOrder.description ? (
            <Card>
              <CardBody className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-subtle">
                  Notes
                </p>
                <p className="whitespace-pre-wrap text-sm text-fg">
                  {workOrder.description}
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
            </CardHeader>
            <CardBody className="space-y-6">
              <Gallery attachments={attachments} canDelete={isOwner} />
              {property ? (
                <div className="border-t border-border-subtle pt-5">
                  <h4 className="mb-3 text-sm font-semibold text-fg">
                    Add more
                  </h4>
                  <EvidenceUploader
                    workOrderId={workOrder.id}
                    propertyId={property.id}
                    initialPhase={
                      workOrder.status === 'done' ? 'after' : 'progress'
                    }
                  />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <ActivityList
                activity={activity}
                comments={comments}
                profilesById={profilesById}
              />
              <div className="border-t border-border-subtle pt-5">
                <CommentForm workOrderId={workOrder.id} />
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody>
              <StatusControls
                workOrderId={workOrder.id}
                status={workOrder.status}
                priority={workOrder.priority}
                assigneeId={workOrder.assignee_id}
                assignees={members}
                isOwner={isOwner}
                hasAfterEvidence={hasAfterEvidence}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2 text-xs text-muted">
              <p>
                Reported{' '}
                <span className="text-fg">{formatDateTime(workOrder.created_at)}</span>
              </p>
              {workOrder.created_by_email ? (
                <p>
                  By <span className="text-fg">{workOrder.created_by_email}</span>
                </p>
              ) : null}
              {workOrder.resolved_at ? (
                <p>
                  Resolved{' '}
                  <span className="text-fg">
                    {formatDateTime(workOrder.resolved_at)}
                  </span>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  )
}
