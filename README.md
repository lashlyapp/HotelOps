# HotelOps

Operations platform for hotels.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) (auth + Postgres) via `@supabase/ssr`

## Getting started

1. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project.

2. Install and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project layout

```
src/
  app/                 Next.js App Router routes
  lib/supabase/
    client.ts          Browser Supabase client
    server.ts          Server Components / Route Handlers client
    proxy.ts           Session refresh helper
  proxy.ts             Edge proxy that refreshes Supabase sessions
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint the project
