/**
 * Platform admin access policy.
 *
 * Defense in depth: even if a profile somehow gets `role = platform_admin`
 * assigned (via SQL, a leaked service role key, or a bug), we additionally
 * require the auth user's email to be on our internal domain.
 *
 * Customer / tenant emails are unrestricted — only the platform admin role
 * is locked to @myhotelops.com.
 */
export const PLATFORM_ADMIN_EMAIL_DOMAIN = 'myhotelops.com'

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  return email.slice(at + 1).toLowerCase() === PLATFORM_ADMIN_EMAIL_DOMAIN
}
