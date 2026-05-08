/**
 * Seed CG Hotel Group + properties + owner invite.
 *
 *   npm run setup
 *
 * Prerequisites:
 *   1. Apply supabase/migrations/0001_init.sql via the Supabase SQL Editor
 *      (Dashboard → SQL Editor → paste the file → Run).
 *   2. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *   3. Optionally set SEED_OWNER_EMAIL to invite the CG Hotel Group owner.
 *
 * Idempotent: safe to re-run.
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = required('SUPABASE_SERVICE_ROLE_KEY')
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  await assertSchemaApplied(admin)

  const orgId = await upsertOrg('CG Hotel Group', 'cg-hotel-group')
  await upsertProperty(orgId, 'Cupertino Hotel', 'cupertino-hotel')
  await upsertProperty(orgId, 'Grand Hotel', 'grand-hotel')

  if (OWNER_EMAIL) {
    await inviteOwner(OWNER_EMAIL, orgId)
  } else {
    console.log(
      '\nSkipped owner invite. Set SEED_OWNER_EMAIL in .env.local to invite one.',
    )
  }

  console.log('\nDone.')
}

async function assertSchemaApplied(client: SupabaseClient) {
  const { error } = await client.from('organizations').select('id').limit(1)
  if (error) {
    console.error(
      '\nSchema not found. Apply the migration first:\n' +
        '  1. Open the Supabase Dashboard → SQL Editor.\n' +
        '  2. Paste the contents of supabase/migrations/0001_init.sql.\n' +
        '  3. Run, then re-run `npm run setup`.\n\n' +
        `Underlying error: ${error.message}`,
    )
    process.exit(1)
  }
}

async function upsertOrg(name: string, slug: string) {
  const { data, error } = await admin
    .from('organizations')
    .upsert({ name, slug }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error) throw error
  console.log(`Org: ${name} (${data.id})`)
  return data.id as string
}

async function upsertProperty(orgId: string, name: string, slug: string) {
  const r2_prefix = `cg-hotel-group/${slug}/`
  const { error } = await admin
    .from('properties')
    .upsert(
      { org_id: orgId, name, slug, r2_prefix },
      { onConflict: 'org_id,slug' },
    )
  if (error) throw error
  console.log(`Property: ${name} -> ${r2_prefix}`)
}

async function inviteOwner(email: string, orgId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl.replace(/\/+$/, '')}/auth/callback`,
  })
  if (error && !/already.*registered/i.test(error.message)) throw error

  let userId = data?.user?.id
  if (!userId) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    if (listErr) throw listErr
    userId = list.users.find((u) => u.email === email)?.id
  }
  if (!userId) throw new Error(`Could not resolve user id for ${email}`)

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, org_id: orgId, role: 'org_owner' })
  if (profileErr) throw profileErr
  console.log(`Owner invited / linked: ${email}`)
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
