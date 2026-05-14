import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Profile,
  Task,
  TaskActivity,
  TaskAttachment,
  TaskComment,
} from '@/lib/supabase/types'
import { deleteTaskAction } from '../actions'
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

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireOrgUser()

  const admin = createAdminClient()
  const { data: taskRow } = await admin
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!taskRow) notFound()
  const task = taskRow as Task

  const [
    { data: attachmentsRows },
    { data: commentRows },
    { data: activityRows },
    { data: memberRows },
  ] = await Promise.all([
    admin
      .from('task_attachments')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true }),
    admin
      .from('task_comments')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true }),
    admin
      .from('task_activity')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true }),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', session.organization.id),
  ])

  const attachments = (attachmentsRows ?? []) as TaskAttachment[]
  const comments = (commentRows ?? []) as TaskComment[]
  const activity = (activityRows ?? []) as TaskActivity[]
  const members = (memberRows ?? []) as Pick<Profile, 'id' | 'full_name'>[]
  const profilesById = new Map(members.map((m) => [m.id, m]))
  const property = session.properties.find((p) => p.id === task.property_id)
  const hasAfterEvidence = attachments.some((a) => a.phase === 'after')
  const isOwner = session.profile.role === 'org_owner'

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
      <div>
        <Link
          href="/tasks"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to board
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-subtle">
              <span className="font-mono uppercase">{task.reference}</span>
              <span>·</span>
              <span>{CATEGORY_LABELS[task.category]}</span>
              {task.location ? (
                <>
                  <span>·</span>
                  <span>{task.location}</span>
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
              {task.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[task.status]}>
                {STATUS_LABELS[task.status]}
              </Badge>
              <Badge tone={PRIORITY_TONE[task.priority]}>
                {PRIORITY_LABELS[task.priority]} priority
              </Badge>
            </div>
          </div>
          {isOwner ? (
            <form action={deleteTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button
                type="submit"
                className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
              >
                Delete task
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6 min-w-0">
          {task.description ? (
            <Card>
              <CardBody className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-subtle">
                  Notes
                </p>
                <p className="whitespace-pre-wrap text-sm text-fg">
                  {task.description}
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
                    taskId={task.id}
                    propertyId={property.id}
                    initialPhase={
                      task.status === 'done' ? 'after' : 'progress'
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
                <CommentForm taskId={task.id} />
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody>
              <StatusControls
                taskId={task.id}
                status={task.status}
                priority={task.priority}
                assigneeId={task.assignee_id}
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
                <span className="text-fg">{formatDateTime(task.created_at)}</span>
              </p>
              {task.created_by_email ? (
                <p>
                  By <span className="text-fg">{task.created_by_email}</span>
                </p>
              ) : null}
              {task.resolved_at ? (
                <p>
                  Resolved{' '}
                  <span className="text-fg">
                    {formatDateTime(task.resolved_at)}
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
