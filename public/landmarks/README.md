# Landmark photography

This folder will hold the city-specific hero images for the
destinations cards on the marketing landing page (`/` → "Markets
we're built for" band) **once licensed Adobe Stock photos are
sourced**. The folder is empty today.

## Current state — hotlinked Unsplash placeholders

The destinations band ships pointing at hotlinked Unsplash CDN
URLs (see `src/components/marketing/destinations-band.tsx`). They're
free for commercial use, no attribution required, and served fast
from `images.unsplash.com`. Specific photo IDs were picked per city
(Lisbon / Barcelona / Paris / Mexico City) — if any 404 in
production, swap the `id` portion of the URL in the component for
another from the same Unsplash search.

The `images.unsplash.com` host is whitelisted in `next.config.ts`
(`images.remotePatterns`) and the CSP `img-src` directive.

## Target — self-hosted licensed photos

When the operator has time to source from their Adobe Stock
subscription, drop the photos here and update the `imageSrc` entries
in `src/components/marketing/destinations-band.tsx` to point at the
local paths:

| Card name   | Target path                     | Suggested subject                            |
| ----------- | ------------------------------- | -------------------------------------------- |
| Lisbon      | `/landmarks/lisbon.jpg`         | Alfama rooftops / Tram 28 / Praça do Comércio |
| Barcelona   | `/landmarks/barcelona.jpg`      | Gòtic / Born / Eixample street life          |
| Paris       | `/landmarks/paris.jpg`          | Marais / Saint-Germain / non-touristy quiet  |
| Mexico City | `/landmarks/mexico-city.jpg`    | Roma / Condesa / Polanco facades             |

Specs:
- 4:5 aspect ratio (cards use object-cover so anything close works,
  but 4:5 fits the card frame natively)
- ~2400px on the long edge for retina
- Boutique-hotel *neighborhood* textures (quiet plazas, tiled
  facades, leafy streets) rather than generic tourist landmarks
  (Eiffel Tower, Sagrada Família). The pitch is "we get your
  market," not "we run tours."
- Stick with Adobe Stock for license-bundle consistency.

When the photos land, replace this README with a brief
license-attribution file pointing at the Adobe Stock IDs for the
legal trail. The hotlinked Unsplash URLs can also be removed from
`next.config.ts` at the same time if you don't want them to remain
as a fallback.
