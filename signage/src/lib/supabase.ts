import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client. The signage project only reads (manifest) and
// writes back heartbeat metadata — neither flow has an end-user session.
// The same SUPABASE_SERVICE_ROLE_KEY env var is used as the operator app.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the signage Vercel project.',
    )
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
