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
