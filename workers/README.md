# Workers

## cdn-gate

Cloudflare Worker that fronts the R2 media bucket and 403s requests for
orgs whose subscription has been restricted by the billing gate
(`past_due ≥ 15 days`, `paused`, or `canceled`). Without this, a
delinquent customer's website can keep hot-linking `cdn.myhotelops.com/...`
indefinitely — there's no leverage on them to pay because nothing
visibly breaks.

### Architecture

```
  Request: cdn.myhotelops.com/<org-slug>/<property-slug>/file.jpg
                  │
                  ▼
        ┌──────────────────┐
        │  cdn-gate Worker │──── KV.get("gate:<org-slug>")
        └──────────────────┘
                  │
        locked? ──┴── no ──► R2 bucket (MEDIA binding) ── 200 + Cache-Tag
        │
        yes ──► 403 "account suspended"
```

The app keeps KV in sync via `lib/billing/cdn-gate.ts:syncGateToCdn(orgId)`,
which is called from `syncSubscriptionToDb` on every Stripe webhook. KV
propagates globally in <60s; cache TTL on hits is 1hr so worst-case
lock-application time after KV write is ~1hr unless we also purge the
zone's cache for that prefix (Enterprise tag-purge or per-URL purges via
the CF API).

### Multi-tenant impact

The bucket is shared across all tenants, so once the Worker route is on
**every** media request flows through the Worker — paying or not. The
gate's *decision* is per-tenant (KV key includes the org slug, cache is
tagged per org), so a lock on tenant A can never accidentally affect
tenant B. The shared-fate concern is the request path itself:

- **Latency tax**: ~2–5ms per request (Worker exec + edge KV read,
  warm-path sub-ms after first hit per colo). All tenants pay this.
- **Worker bug / Cloudflare incident**: a bad deploy or a Workers
  outage takes down media for all tenants, not just locked ones. The
  Worker is intentionally tiny (no third-party deps) to minimize this.
- **KV unreachable**: handled — Worker fails OPEN, paying tenants keep
  getting served while we lose enforcement on locked ones for the
  duration of the incident.
- **No data crossover**: Worker only reads the request path, looks up
  its own KV key, proxies to R2. Can't serve A's content to B because
  R2 keys are deterministic from the request URL.

### Deploying

Deploys go through `.github/workflows/deploy-cdn-gate.yml` — never run
`wrangler deploy` from a laptop. CI keeps Cloudflare credentials off
developer machines, makes every deploy auditable (who pressed the
button, when, why), and forces the rollout to walk through phases
because each one is a separate manual workflow_dispatch.

The workflow exposes one input — **target** — with these phases:

| target                 | what it does                                                       | when |
|------------------------|--------------------------------------------------------------------|------|
| `upload-only`          | `wrangler deploy --dry-run` — validates build + bindings           | first run, or after any non-trivial code change |
| `canary`               | deploys with route limited to one tenant (`canary_slug` input)     | after upload-only is green |
| `production`           | deploys with the catch-all route on `cdn.myhotelops.com/*`         | after canary has been clean for ~24hr |
| `rollback-canary`      | `wrangler rollback --env canary` — reverts to previous version     | canary regression |
| `rollback-production`  | `wrangler rollback --env production` — reverts to previous version | production regression |

Required repo secrets (Settings → Secrets and variables → Actions):

| secret                          | what                                                                                   |
|---------------------------------|----------------------------------------------------------------------------------------|
| `CLOUDFLARE_API_TOKEN`          | scoped: Workers Scripts:Edit, Workers KV Storage:Edit, Workers Routes:Edit, Cache Purge |
| `CLOUDFLARE_ACCOUNT_ID`         | the account that owns the R2 bucket                                                     |
| `R2_BUCKET`                     | the bucket name (matches `R2_BUCKET` in app `.env`)                                     |
| `CDN_GATE_KV_NAMESPACE_ID`      | the KV namespace id (created once via `wrangler kv namespace create`)                   |

The repo's `wrangler.toml` keeps these out of source — CI substitutes
them at deploy time so a wrong-account checkout can't accidentally
publish to production.

Recommended GitHub Environment protection: configure the
`cdn-gate-production` environment with required reviewers. That turns
every workflow_dispatch into a two-person approval gate, which is the
cheapest enforcement of "no solo deploys to a thing that touches every
tenant".

### Rollout discipline

The phases above exist because the Worker enters every tenant's
request path the moment its route is live — a bad first deploy = global
media outage. The CI workflow forces serialization (concurrency group),
forces audit trail (deploy `--message` includes actor + reason), and
forces human-in-the-loop between phases (no auto-promotion).

Between `canary` and `production`, do these by hand once:

- **Watch the canary for ~24hr.** Cloudflare → Workers → `hotelops-cdn-gate`
  → Logs (live) and Metrics. Exercise the canary tenant: load media,
  trigger a lock via the billing webhook, verify 403 starts firing,
  unlock, verify 200 returns.
- **Wire a Cloudflare Notification** before pressing `production`:
  - Trigger: Worker request error rate > 1% over 5min, OR p95 CPU
    time > 50ms over 5min.
  - Channel: whatever the on-call uses (PagerDuty / Slack / email).
  - Without this, a post-deploy regression surfaces via support
    tickets instead of an alert.

For finer-grained gradual rollout (1% → 10% → 100% within `production`),
use `wrangler versions deploy <version-id>@<percent>` from a local
checkout with operator credentials — that flow is too version-id-dependent
to script cleanly in `workflow_dispatch`. The `production` target above
does an atomic 100% deploy, which is fine for a Worker this small after
24hr of canary baking.

### First-time setup (one-off, before the first CI deploy)

These are the bootstrap steps that have to happen once before CI can
deploy. They're done by hand, not in CI, because they create the
resources that CI then references via secrets.

1.  **Create the KV namespace** locally, then store its id as the
    `CDN_GATE_KV_NAMESPACE_ID` repo secret AND in the app env as
    `CLOUDFLARE_KV_GATE_NAMESPACE_ID` (Vercel / `.env.local`):
    ```sh
    npx wrangler kv namespace create hotelops-gate
    ```

2.  **Set repo secrets** (Settings → Secrets and variables → Actions):
    `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`,
    `CDN_GATE_KV_NAMESPACE_ID`. See the table above for token scopes.

3.  **Run the workflow** with `target=upload-only` to validate that
    secrets + bindings + the Worker code all line up. No traffic is
    affected.

4.  **Run again with `target=canary`** and a real test-tenant slug.
    Watch for ~24hr (see "Rollout discipline").

5.  **Run again with `target=production`** once canary is clean and the
    Cloudflare Notification is wired up.

6.  **Disable the R2 public access path** in the Cloudflare dashboard —
    the bucket should NOT also be reachable via its raw `*.r2.dev`
    address or a second custom domain. Otherwise customers can bypass
    the gate by guessing the public URL.

7.  **Backfill KV** from current subscription state so already-locked
    orgs are immediately gated:
    ```sh
    npm run sync:cdn-gate -- --apply
    ```
    Re-run any time KV drifts from the DB (manual edits, namespace
    rotation, etc.).

### Required env in Vercel / `.env.local`

```
CLOUDFLARE_API_TOKEN              # already used by analytics; needs KV:Edit + Cache Purge
CLOUDFLARE_ACCOUNT_ID             # already set
CLOUDFLARE_ZONE_ID                # already set
CLOUDFLARE_KV_GATE_NAMESPACE_ID   # NEW — the namespace id from step 1
```

### Failure modes

- **KV unreachable**: Worker fails OPEN (serves the file). Billing
  leverage is briefly weakened; no paying customer sees an outage.
- **App can't write to KV** (wrong token, namespace deleted): logged,
  silently no-op. Lock state in DB still reflects reality; KV is a
  derived view that can be rebuilt with `npm run sync:cdn-gate`.
- **Stale CDN cache**: capped at 1hr by `CACHE_TTL_SECONDS`. For
  immediate enforcement, app calls `purge_cache` after KV write — that
  drops cached responses globally in seconds.
