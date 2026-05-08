import { requirePlatformAdmin } from '@/lib/auth/session'
import { CreateTenantForm } from './_components/create-tenant-form'

export default async function NewTenantPage() {
  await requirePlatformAdmin()

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Create tenant
        </h1>
        <p className="mt-1 text-sm text-muted">
          Set up a new organization, its properties, and its initial owner. The
          owner can sign in immediately with the email and password you set
          here.
        </p>
      </div>

      <CreateTenantForm />
    </div>
  )
}
