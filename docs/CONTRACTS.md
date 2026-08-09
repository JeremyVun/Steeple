# Steeple — CONTRACTS.md (index)

> **Moved 2026-08-05.** Every wire contract now lives in `docs/contracts/`, one file per
> seam, so an agent can load only the seam it needs. **`docs/contracts/` is the owning
> location** — update the owning file in the same commit as the change it describes; this
> page is only a map. The § numbering below is preserved because code comments across the
> repo cite "CONTRACTS §n".
>
> Legend used throughout: ✅ built & live · 🔲 planned (shape agreed, not yet implemented).

The authoritative wire-token table is [`tests/fixtures/wire-tokens.json`](../tests/fixtures/wire-tokens.json).
It is the one place an enum token or feature-flag name changes: API, web, and mobile golden tests
all read that file and fail when a platform mirror drifts. Endpoint prose may repeat tokens to
explain a shape, but those lists are not separate registries.

| Old section | Now in | Covers |
|---|---|---|
| §1 Governance, §1.1 additive rule | `contracts/conventions.md` | How contracts change (the binding checklist) |
| §2 Conventions, §2.1 enum token registry | `contracts/conventions.md` + `../tests/fixtures/wire-tokens.json` | Casing, times, IDs, enums, pagination, errors, auth, idempotency, rate limits |
| §3 Discovery | `contracts/discovery.md` | Search + When filter, listing detail, ratings, suburbs, sitemap, geofence |
| §4 Identity | `contracts/identity.md` | Sessions, refresh/rotation, `/me`, agreements, deletion, devices |
| §5 Applications, notifications, bookings | `contracts/applications.md` | Apply → decide, counter-offers, bookings/occurrences, ratings writes, inbox |
| §6 Manage (incl. §6a availability) | `contracts/manage.md` | Venue/room CRUD, moderation model, availability rules & reads, photos |
| §7 Analytics events | `contracts/analytics.md` | Ingest endpoint + the full event taxonomy |
| §8 Feature flags service | `contracts/infra.md` | Flags service + the client flags proxy |
| §9 Non-API integration contracts | `contracts/infra.md` | Edge auth, sub-path hosting, deep links, push payload |
| §10 Payments (new 2026-08-05) | `contracts/payments.md` | Method-on-file, 402 apply gate, charge timing + failure ladder, refunds, payout onboarding |

Contracts that were never in this file but belong to the same index:
`contracts/api-ports.md` (API module map + port→adapter table), `contracts/persistence.md`
(domain model, DB-enforced invariants, geofence), `contracts/web.md` (Steeple.Web.v2 seams),
`contracts/seo.md` (the crawler surface — robots, sitemap policy, metadata, index rules; was
`docs/SEO.md` until 2026-08-08), `contracts/mobile.md` (the former `MOBILE_CONTRACTS.md`).

Start at `docs/contracts/README.md`.
