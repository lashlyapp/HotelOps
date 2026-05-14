import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { PlaylistMetaForm } from '../[id]/playlist-meta-form'

export default async function NewPlaylistPage() {
  const session = await requireOrgUser()
  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-2xl">
      <div>
        <Link
          href="/signage/playlists"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to playlists
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          New playlist
        </h2>
      </div>
      <Card>
        <CardBody>
          <PlaylistMetaForm properties={session.properties} />
        </CardBody>
      </Card>
    </div>
  )
}
