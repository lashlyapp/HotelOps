import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requireOrgOwner } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AppRole } from '@/lib/supabase/types'
import { AddMemberForm } from './_components/add-member-form'

type TeamRow = {
  id: string
  email: string | null
  role: AppRole
  full_name: string | null
  created_at: string
}

export default async function TeamPage() {
  const session = await requireOrgOwner()
  const team = await loadTeam(session.organization.id)

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Team
        </h1>
        <p className="mt-1 text-sm text-muted">
          People at {session.organization.name} who can sign in to this portal.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {team.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-fg">{m.email ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{m.full_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={m.role === 'org_owner' ? 'info' : 'neutral'}>
                    {m.role.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(m.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      <AddMemberForm />
    </div>
  )
}

async function loadTeam(orgId: string): Promise<TeamRow[]> {
  const admin = createAdminClient()
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, role, full_name, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw error

  // Resolve emails via auth admin API.
  const ids = (profiles ?? []).map((p) => p.id)
  const emailById = new Map<string, string>()
  if (ids.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    for (const u of users?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email)
    }
  }

  return (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? null,
    role: p.role as AppRole,
    full_name: p.full_name,
    created_at: p.created_at,
  }))
}
