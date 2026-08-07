# Steeple — contracts index

> Every core contract and interface in the system, **one file per seam**, so an agent can
> load only the seam it is working on. Each file stands alone (no cross-file reading
> required to understand its seam) and states its own scope in its header.
> Legend used throughout: ✅ built & live · 🔲 planned (shape agreed, not built).

**The pattern rule:** every core contract/interface lives here, one file per seam; update
the owning file in the same commit as the change it describes; wire changes additionally
follow the governance checklist in `conventions.md`.

## The seams

| File | Answers |
|---|---|
| `conventions.md` | How does a contract change, and what conventions hold for **every** `/api/v1` endpoint (casing, times, IDs, enums, pagination, errors, auth, idempotency, rate limits)? Includes the wire enum token registry. |
| `discovery.md` | Public read surface: search (incl. the When filter), listing detail by id/slug, venue ratings, suburbs, sitemap, geofence. |
| `identity.md` | SSO sessions, token pair + rotation, `/me`, agreements, account deletion, device registration. |
| `applications.md` | Apply → message → counter-offer → decision, bookings & occurrences, ratings writes, the notification inbox. |
| `manage.md` | Provider self-service: venue/room CRUD, the moderation model, availability rules (open hours + blackouts), guest availability reads, host review & calendar, photos. |
| `payments.md` | Method-on-file, the apply payment gate, per-occurrence charging and failure handling, refunds, and payout onboarding. |
| `analytics.md` | The event ingest endpoint and the full event taxonomy (name → source → props). |
| `infra.md` | Deployed-infra contracts: feature-flags service + client flags proxy; edge auth, sub-path hosting, deep links, push payload. |
| `api-ports.md` | `Steeple.Api`'s internal architecture contract: module map, port → adapter table, module rules. |
| `persistence.md` | Domain model, DB-enforced invariants, geofence, and the Liquibase-owns-schema / database-first EF recipe. |
| `web.md` | `Steeple.Web.v2` seams: `api.js` (the wire), `session.js`, `catalog.js`, `store.js`, harness truths, environment-gated integrations. |
| `mobile.md` | `/mobile` in-app seams: Dart interfaces, error model, wire models, router registry, repositories/providers, shared widgets, fixtures. Was `docs/MOBILE_CONTRACTS.md`. |

## Citation compatibility

Code comments across the repo cite `CONTRACTS §n` and `MOBILE_CONTRACTS §n`. The section
numbering is preserved: `docs/CONTRACTS.md` is now a thin index mapping §1–§10 onto the files
above, and `docs/MOBILE_CONTRACTS.md` points at `mobile.md` (which keeps its own §1–§12).

## Completed migration notes

The v2 production migration completed on 2026-08-07. Its decisions are represented here as
as-built behavior; there are no pending `superseded-by-adopted-decision` markers.
