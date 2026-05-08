/**
 * Onboard a new tenant (organization + properties + owner invite).
 *
 * Generic: works for any customer. Run once per new tenant.
 *
 * Usage:
 *   npx tsx scripts/onboard-tenant.ts \
 *     --slug=acme-hotel-group \
 *     --name="Acme Hotel Group" \
 *     --owner=owner@acmehotelgroup.com \
 *     --property=downtown-suites:"Downtown Suites" \
 *     --property=harbor-view:"Harbor View"
 *
 * Properties:
 *   --property=<slug>:<name>     repeat for each property; the R2 prefix
 *                                becomes "<org-slug>/<property-slug>/"
 *
 * Optional:
 *   --owner=<email>              omit to skip the invite (org + properties only)
 *
 * Idempotent: safe to re-run. Upserts the org/properties; tolerates
 * already-registered owners.
 *
 * Required env (read from .env.local locally; from workflow secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SITE_URL         (used as the invite-email redirect target)
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

type Args = {
  slug: string
  name: string
  owner?: string
  properties: Array<{ slug: string; name: string }>
}

const args = parseArgs(process.argv.slice(2))

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = required('SUPABASE_SERVICE_ROLE_KEY')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  await assertSchemaApplied(admin)

  const orgId = await upsertOrg(args.name, args.slug)
  for (const property of args.properties) {
    await upsertProperty(orgId, args.slug, property.name, property.slug)
  }

  if (args.owner) {
    await inviteOwner(args.owner, orgId)
  } else {
    console.log('\nSkipped owner invite (no --owner provided).')
  }

  console.log('\nDone.')
}

function parseArgs(raw: string[]): Args {
  const out: { slug?: string; name?: string; owner?: string; properties: Array<{ slug: string; name: string }> } = {
    properties: [],
  }

  for (const arg of raw) {
    const eq = arg.indexOf('=')
    if (eq === -1) usageError(`Unrecognized argument: ${arg}`)
    const key = arg.slice(0, eq).replace(/^--/, '')
    const value = arg.slice(eq + 1)

    switch (key) {
      case 'slug':
        out.slug = value
        break
      case 'name':
        out.name = value
        break
      case 'owner':
        out.owner = value || undefined
        break
      case 'property': {
        const colon = value.indexOf(':')
        if (colon === -1) {
          usageError(`--property must be slug:name, got "${value}"`)
        }
        out.properties.push({
          slug: value.slice(0, colon),
          name: value.slice(colon + 1),
        })
        break
      }
      default:
        usageError(`Unrecognized argument: --${key}`)
    }
  }

  if (!out.slug) usageError('Missing required --slug')
  if (!out.name) usageError('Missing required --name')
  if (out.properties.length === 0) {
    usageError('Provide at least one --property=slug:name')
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(out.slug)) {
    usageError(`--slug "${out.slug}" must be kebab-case (a-z, 0-9, hyphens)`)
  }
  for (const p of out.properties) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) {
      usageError(`--property slug "${p.slug}" must be kebab-case`)
    }
  }

  return out as Args
}

async function assertSchemaApplied(client: SupabaseClient) {
  const { error } = await client.from('organizations').select('id').limit(1)
  if (error) {
    console.error(
      '\nSchema not found. Apply migrations first via the Database workflow ' +
        '(or `supabase db push` locally), then re-run.\n\n' +
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

async function upsertProperty(
  orgId: string,
  orgSlug: string,
  name: string,
  slug: string,
) {
  const r2_prefix = `${orgSlug}/${slug}/`
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

function usageError(message: string): never {
  console.error(`\n${message}\n`)
  console.error('Usage:')
  console.error(
    '  npx tsx scripts/onboard-tenant.ts \\\n' +
      '    --slug=<org-slug> \\\n' +
      '    --name="<Org Name>" \\\n' +
      '    [--owner=<email>] \\\n' +
      '    --property=<slug>:<Name> [--property=...]\n',
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
