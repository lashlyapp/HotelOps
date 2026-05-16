# Landmark photography

This folder will hold the city-specific hero images for the
destinations cards on the marketing landing page (`/` → "Markets
we're built for" band).

## Current state — placeholders

The destinations band ships **publicly with placeholder imagery**:
the four cards reuse the existing licensed Adobe Stock hospitality
photos already in `/public` (hotel exterior / lobby / reception /
guest room). They're polished, commercially licensed (the operator
already pays for them), and they guarantee no broken-image
placeholders go to production. But they are not city-specific — a
visitor in Lisbon sees the same hotel-exterior photo on the Lisbon
card that a visitor in Mexico City sees on theirs.

## Target — city-specific photos

When the operator has time to source from their Adobe Stock
subscription, drop the photos here and update the `imageSrc` entries
in `src/components/marketing/destinations-band.tsx`:

| Card name   | Target path                     | Suggested subject                            |
| ----------- | ------------------------------- | -------------------------------------------- |
| Lisbon      | `/landmarks/lisbon.jpg`         | Alfama rooftops / Tram 28 / Praça do Comércio |
| Barcelona   | `/landmarks/barcelona.jpg`      | Gòtic / Born / Eixample street life          |
| Paris       | `/landmarks/paris.jpg`          | Marais / Saint-Germain / non-touristy quiet  |
| Mexico City | `/landmarks/mexico-city.jpg`    | Roma / Condesa / Polanco facades             |

Specs:
- 16:10 or 4:5 aspect ratio (cards use object-cover so the source
  can be either; 4:5 fits the card frame natively)
- ~2400px on the long edge for retina
- Boutique-hotel *neighborhood* textures (quiet plazas, tiled
  facades, leafy streets) rather than generic tourist landmarks
  (Eiffel Tower, Sagrada Família). The pitch is "we get your
  market," not "we run tours."
- Stick with Adobe Stock for license-bundle consistency.

When the photos land, replace this README with a brief
license-attribution file pointing at the Adobe Stock IDs for the
legal trail.
