import { notFound } from 'next/navigation'
import { loadManifestByToken } from '@/lib/manifest'
import { Player } from './player'

export const dynamic = 'force-dynamic'

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await loadManifestByToken(token)
  if (!result.ok) {
    notFound()
  }
  return <Player token={token} initial={result.manifest} />
}
