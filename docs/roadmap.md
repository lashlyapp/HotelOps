# Roadmap — deferred items

Things we've intentionally decided NOT to ship right now, with the
reasoning written down so we don't re-litigate it every time someone
asks. Add to this file when a "should we do X?" conversation lands on
"yes, eventually, but not now" — pin the date and the trigger that
would make us revisit.

Format: one section per item. Status, the reason it's deferred, the
trigger that would flip it to "do now", and the rough sketch of what
"do now" would look like.

---

## EU data residency

**Status:** deferred — May 2026
**Trigger to revisit:** a European prospect asks where their data is
hosted, OR we sign three European customers, whichever comes first.

**Context.** Supabase supports region selection at project creation
(EU-West Frankfurt, EU-North Stockholm). R2 + the Cloudflare CDN are
already global. Stripe accepts EU customers from any account. So the
technical lift to offer EU data residency is real but tractable —
spin up a second Supabase project in an EU region, mirror schema,
route EU-onboarded tenants to it, and add a "data residency" picker
on signup.

**Why deferred.**
- Zero European customers today. We'd be building for an objection
  nobody is raising yet.
- Adds dual-region operations cost (migrations × 2, monitoring × 2,
  backup verification × 2) that's hard to justify against a single
  prospect's preference.
- Localized prices, language coverage, and case studies move the
  needle on European acquisition far more than residency does at
  current scale. The handful of European boutique owners who
  actually care about residency are the ones we'd lose anyway to a
  PMS-native incumbent.

**What "do now" looks like.**
1. Provision a second Supabase project in eu-west-2 (Frankfurt).
2. Migration runner that targets the new project — same SQL, same
   versions.
3. A `data_region` column on organizations + a tenant-router so
   server actions hit the right project. The auth flow picks the
   region at signup (default: closest by IP).
4. Stripe customer metadata gets a region tag so EU customers don't
   accidentally land on the US Customer.
5. A privacy-policy update + DPA template with the new sub-processor
   list.

Probably 2-3 weeks of work for one engineer; we'll know it's time
when EU revenue justifies it.

---
