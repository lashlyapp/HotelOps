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

### Rollout strategy (do this, not a one-shot deploy)

The Worker enters every tenant's request path the moment its route is
live, so a bad first deploy = global media outage. Roll it out
incrementally:

1.  **Deploy without a route first.** In `wrangler.toml`, comment out
    the `routes = [...]` block, then `wrangler deploy`. The Worker
    exists but receives no traffic. Verify it's healthy in the
    dashboard.

2.  **Canary on one tenant** before flipping the catch-all. Add a
    narrow route for one internal/test tenant first:
    ```toml
    routes = [
      { pattern = "cdn.myhotelops.com/canary-tenant/*", zone_name = "myhotelops.com" },
    ]
    ```
    Deploy, then exercise the canary tenant's media (in-app, locked
    state, unlock, cache purge) for ~24hr. Watch `wrangler tail` and
    the Workers Analytics error rate.

3.  **Gradual rollout to 100%.** Once the canary is clean, switch to
    the catch-all route and use `wrangler versions` instead of a
    direct `deploy` so traffic shifts gradually:
    ```sh
    npx wrangler versions upload          # uploads, doesn't activate
    npx wrangler versions deploy --percentage 1    # 1% of traffic
    # observe error rate for ~30min
    npx wrangler versions deploy --percentage 10   # then 10
    npx wrangler versions deploy --percentage 100  # then full
    ```
    Roll back instantly with `wrangler rollback` if error rate spikes.

4.  **Health alert before going to 100%.** In the Cloudflare dashboard,
    add a Notification on the Worker:
    - Trigger: `hotelops-cdn-gate` request error rate > 1% over 5min,
      OR p95 CPU time > 50ms over 5min.
    - Channel: PagerDuty / Slack / email — whichever the on-call uses.
    Without this, a regression after deploy is noticed via support
    tickets, not metrics.

5.  **Subsequent code changes** (Worker logic, not just KV writes) go
    through the same `wrangler versions` flow. KV/cache state changes
    from the app side don't need this; they're per-tenant and
    reversible.

### First-time setup

1.  **Create the KV namespace** (one-time, in the Cloudflare dashboard or
    CLI) and copy its id into `wrangler.toml` next to
    `REPLACE_WITH_KV_NAMESPACE_ID`. Also set
    `CLOUDFLARE_KV_GATE_NAMESPACE_ID` in the app's env so the app-side
    updater knows which namespace to write to.

    ```sh
    npx wrangler kv namespace create hotelops-gate
    ```

2.  **Wire the R2 binding**: replace `REPLACE_WITH_R2_BUCKET_NAME` with
    the same bucket name the app writes to (matches `R2_BUCKET` in
    `.env.local`).

3.  **Deploy**:
    ```sh
    cd workers/cdn-gate
    npm install
    npx wrangler deploy
    ```

4.  **Disable the R2 public access path** — once the Worker route is up,
    the bucket should NOT also be reachable via its raw `*.r2.dev`
    address or via a second custom domain. Otherwise customers can
    bypass the gate by guessing the public URL.

5.  **Backfill KV** from current subscription state so locked orgs are
    immediately gated:
    ```sh
    npm run sync:cdn-gate
    ```
    Re-run after enabling the Worker, or any time KV gets out of sync.

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
