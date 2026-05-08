/**
 * Create the very first platform admin user.
 *
 * Once a platform admin exists, all subsequent admin and tenant management
 * happens in the UI — this script is a one-shot bootstrap.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts \
 *     --email=support@myhotelops.com \
 *     --password=<strong-password>
 *
 * Idempotent: if the user already exists, updates their password and ensures
 * the profile row has role = platform_admin.
 *
 * Required env (read from .env.local locally; from secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const args = parseArgs(process.argv.slice(2))
const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = required('SUPABASE_SERVICE_ROLE_KEY')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  let userId = await findUserId(args.email)

  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: args.password,
      email_confirm: true,
    })
    if (error) throw error
    console.log(`Updated existing user: ${args.email}`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: args.email,
      password: args.password,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user!.id
    console.log(`Created user: ${args.email}`)
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, role: 'platform_admin', org_id: null })
  if (profileErr) throw profileErr

  console.log(`Profile set: role = platform_admin`)
  console.log('\nDone. Sign in at /login with this email and password.')
}

async function findUserId(email: string): Promise<string | null> {
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const match = data.users.find((u) => u.email === email)
    if (match) return match.id
    if (data.users.length < 200) return null
    page += 1
  }
}

function parseArgs(raw: string[]) {
  const out: { email?: string; password?: string } = {}
  for (const arg of raw) {
    const eq = arg.indexOf('=')
    if (eq === -1) usage(`Unrecognized argument: ${arg}`)
    const key = arg.slice(0, eq).replace(/^--/, '')
    const value = arg.slice(eq + 1)
    if (key === 'email') out.email = value
    else if (key === 'password') out.password = value
    else usage(`Unrecognized argument: --${key}`)
  }
  if (!out.email) usage('Missing --email')
  if (!out.password) usage('Missing --password')
  if (out.password!.length < 12) {
    usage('--password must be at least 12 characters')
  }
  return out as { email: string; password: string }
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

function usage(message: string): never {
  console.error(`\n${message}\n`)
  console.error(
    'Usage:\n  npx tsx scripts/bootstrap-admin.ts --email=<email> --password=<password>\n',
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
