import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Verify a password for an already-authenticated user without
 * disturbing their current session.
 *
 * Why a throwaway client: the cookie-bound `@supabase/ssr` client
 * persists the response of `signInWithPassword` into the cookie jar,
 * which would replace the user's existing aal2 session with a fresh
 * aal1 one — defeating the purpose of MFA. Spinning up a one-off
 * `@supabase/supabase-js` client (no cookie binding) lets us hit the
 * same Auth endpoint purely to validate the credential and discard
 * the resulting session before it lands anywhere.
 *
 * Use sparingly: every call counts against Supabase's rate limits
 * and it does a real password hash comparison server-side. Intended
 * for "confirm your password to do X" flows (disable MFA, delete
 * account, etc.) — not as a general-purpose auth check.
 *
 * Returns true on match, false on wrong password. Throws only on
 * infrastructure errors (network, misconfigured env).
 */
export async function verifyPasswordForEmail(
  email: string,
  password: string,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase env vars missing.')
  }
  // persistSession=false so the throwaway client doesn't try to
  // stash anything anywhere; autoRefreshToken=false because we're
  // not going to use the access token. detectSessionInUrl=false
  // because there's no URL.
  const ephemeral = createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { data, error } = await ephemeral.auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    // "Invalid login credentials" → wrong password. Anything else is
    // an infrastructure failure we want to surface, but we treat it
    // as a non-match for the caller's purposes.
    return false
  }
  // Best-effort: clean up the access token we just obtained so it
  // can't sit around in memory longer than necessary. The ephemeral
  // client has no persistence so this is belt-and-suspenders.
  if (data.session?.access_token) {
    await ephemeral.auth.signOut({ scope: 'local' }).catch(() => {})
  }
  return true
}
