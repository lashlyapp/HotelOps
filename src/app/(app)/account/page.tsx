import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { ChangeEmailForm } from './_components/change-email-form'
import { ChangePasswordForm } from './_components/change-password-form'
import { DeleteAccountSection } from './_components/delete-account-section'
import { ProfileForm } from './_components/profile-form'

export default async function AccountPage() {
  const session = await requireSession()
  const deletableRole: 'org_owner' | 'org_staff' | null =
    session.profile.role === 'org_owner'
      ? 'org_owner'
      : session.profile.role === 'org_staff'
        ? 'org_staff'
        : null

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage your personal profile and account security.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody>
          <ProfileForm profile={session.profile} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangeEmailForm currentEmail={session.email} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>

      {deletableRole ? (
        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted leading-relaxed">
              {deletableRole === 'org_owner'
                ? 'Permanently delete your organization and your account. Cancels any active subscription and removes every team member, property, and uploaded file.'
                : 'Permanently delete your account. Your organization is unaffected.'}
            </p>
            <DeleteAccountSection
              role={deletableRole}
              orgName={session.organization.name}
              orgSlug={session.organization.slug}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
