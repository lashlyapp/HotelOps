# HotelOps Signage

Public signage player. Separate Next.js app so it has its own Vercel
deploy lifecycle — operator app deploys can't break running screens,
and a runaway playlist can't take down the operator dashboard.

## Production

Domain: **tv.myhotelops.com**

## Routes

- `GET /` — pair entry. Operator generates a 6-digit code in the
  HotelOps operator app (`/signage` → Add screen). TV enters it,
  client navigates to the player URL.
- `GET /[token]` — player. Renders fullscreen, polls
  `/api/manifest/[token]` every 60s, posts `/api/heartbeat` every 60s.
- `POST /api/pair` — `{ code }` → `{ ok: true, token }` on success.
- `GET /api/manifest/[token]` — returns the active playlist for the
  screen with R2 keys resolved to public CDN URLs.
- `POST /api/heartbeat` — `{ token, current_item_id? }` updates
  `last_heartbeat_at`, `last_user_agent`, `current_item_id`.

## Env

| Var                              | Notes                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Same as the operator app.                                   |
| `SUPABASE_SERVICE_ROLE_KEY`      | Service role. The signage app never has a user session.     |
| `NEXT_PUBLIC_R2_PUBLIC_URL`      | CDN origin (e.g. `https://cdn.myhotelops.com`).             |

No R2 write credentials needed — the signage app only reads media URLs
out of the database; the operator app handles uploads.

## Local dev

```bash
cd signage
npm install
npm run dev   # http://localhost:3001
```

The operator app and signage app share the same Supabase project, so
just point both at the same dev URL/keys.

## Hardware playbook

| Tier            | Device                       | Notes                                           |
| --------------- | ---------------------------- | ----------------------------------------------- |
| Default         | Fire TV Stick 4K (gen 2)     | Silk browser → tv.myhotelops.com → enter code   |
| Higher-end      | Onn. Google TV 4K            | Chrome browser, snappier video                  |
| Existing TV     | Any smart TV with browser    | Tizen/webOS browsers vary; not blessed          |

No proprietary player. No firmware to maintain. No hardware SKU.
