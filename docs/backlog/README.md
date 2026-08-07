# Backlog — what to build next

> Replaces `ROADMAP.md` (retired 2026-07-04; full text in git history). Each doc here is
> an implementation plan detailed enough that picking it up is execution, not design.
> When a slice lands: update the owning docs per the CLAUDE.md doc map (ARCHITECTURE.md
> as-built, CONTRACTS.md shapes, SYSTEM_DESIGN §17 deviations) and prune the plan.

| Doc | Owns |
|---|---|
| `v2_migration/` | **COMPLETE 2026-08-05 → 2026-08-07.** Web v2 prototype → production: `design.md` holds the adopted decisions **D1–D9** (keep — they are still the rationale of record); `build_plan.md` is pruned to a phase-history stub. Shipped: signed-out truth + per-person store, correspondence and payments on the wire, single-gate moderation + Admin reduction, product-first boot, harness consolidation, env-gated Google/Apple/Turnstile + agreements, idempotent manage creates, SPA hardening + the SEO floor, and the closing sweep (owner's five-step E2E driven, full suite pass green). Keyed provider runs await the owner's client IDs (`docs/runbooks/sso-and-turnstile.md`) |
| `phase-6-reputation-and-launch.md` | Ratings & reviews, provider responsiveness, one-tap rebook, expiry tuning, SEO completion, beachhead swap + the full launch/ops checklist. **Exit = public launch.** Still the launch gate — but its *web* items (production SSO, moving web v2 off its demo store, SEO on a client-rendered surface) are **superseded in mechanism** by `v2_migration/`, which owns them; phase 6 just checks they're done |
| `phase-7-growth-seams.md` | Trigger-gated growth items: verified badges (delegated identity verification), vouching, Area #2, phone OTP step-up, insurance/safeguarding research — plus the small-deferred-items index |
| `seo-crawlable-listings.md` | The half of `docs/SEO.md` the v2 migration's floor left undone: per-listing metadata, OG cards, `Place` JSON-LD, canonicals, 301s and real 404s — all of which need HTML that differs per URL. Carries D9's recommended shape (render `/space/{venue}/{room}` from the API) and the alternatives it beat |
| `payments.md` | The standalone payments design: Stripe Connect (inbound + outbound), per-occurrence charging for recurring bookings, refund & cancellation policy. **Rails built 2026-08-05 on a mock gateway** (`docs/contracts/payments.md` = as-built truth); the Stripe adapter + webhooks + legal/policy work stay gated on the Phase 7 paid-bookings trigger |
| `booking-modes.md` | Instant book (default) vs manual approval per venue, rescind semantics, charge timing — **implemented 2026-08-05** (behind `payments.enabled`); **deferred:** chronic-rescinder nudge to manual, per-user booking caps (adopted 2026-08-05, partially supersedes `payments.md` §5) |

## Open decisions & recorded gaps (from the v2 migration's closing sweep, 2026-08-07)

Recorded, deliberately not built — each needs an owner decision or a gated trigger first:

- **Media base URL is load-bearing and final-before-photos.** Room photo URLs are stored
  **absolute** from `Media:PublicBaseUrl` at upload time (dev `http://localhost:5200`;
  compose default `http://localhost:8081`; production = `MEDIA_PUBLIC_BASE_URL`). Renaming
  the media host orphans every photo already written. Decide the permanent origin (Spaces/
  CDN name) **before** real hosts upload photos, and add it to web nginx CSP `img-src`
  *and* `Admin:MediaImageOrigins` in the same change. (Local compose corollary: uploaded
  photos live on `:8081` while web CSP is `:8080`-relative and Admin's default CSP is
  https-only, so locally-uploaded photos render blocked in both — seeded Unsplash rows are
  unaffected. Cosmetic locally; the reason the decision matters in production.)
- **Mobile has no card UI.** `payments.enabled` stays **off** in production configuration
  until it exists — that flag is the guard, not an oversight.
- **`GET /me/applications` list-vs-detail contract:** list rows omit `counterOffer` and
  thread messages by design; clients must merge, never replace, detail state from list
  reads (web's mirror does — `docs/contracts/applications.md` is the wire truth).
- **Stripe adapter + webhooks + legal review** — phase-7 gated (`payments.md` rollout);
  the mock gateway refuses to run in Production with `payments.enabled=true`.
- **Counter-offers stay behind `booking.counter_offers`** (off ⇒ endpoints 404 and the
  desk says "not available here yet" — verified in the closing sweep).
- **Three small web warts carried from the 2026-08-06 quality round:** `getRoomAvailability`
  swallows failures to `null`, so a 429 is invisible to the apply week card; an email
  `?goto=` deep link reads its booking twice (judgment call left open); map/search paging
  is unbuilt — one page of 100, a venue beyond it has no pin or row (its sheet works by
  slug). Fix when touching the owning surface.
- **Going beyond the beachhead is a product decision; the interfaces are now in place
  (2026-08-07).** Owner intent on record: the single NoVA beachhead is a release strategy
  for product-market fit, not the product's shape. The seams are ready — `IGeofencePolicy`
  is the area-neutral served-area port (every clamp/rejection flows through it; swap the
  implementation to serve more areas), the search wire already speaks center+radius /
  viewport and echoes `appliedBounds` (= the client's "not served here" detector), venues
  carry lat/lng + host-set IANA timezones, and geocoding country scope is
  `Geocoding:LimitToCountries` (empty = worldwide; `Geocoding:Region` empty = no state
  token). What the *decision* still buys before any new area opens: per-user/area
  geocoding bias (IP country or client hint instead of one configured centre), currency
  beyond the wire's existing `currency` field (pricing/payout are single-currency in
  practice), search paging past one page of 100, out-of-area honesty copy in the clients
  (today: silently empty), Where-box locality autocomplete (needs distance-ordered geo
  search to be worth offering), Apple Maps quota if suggestions ever go on a public
  surface, and Admin review capacity per new area.
- **The booking race can deadlock instead of losing cleanly** (found by the sweep, once,
  under full-suite parallel load; `CounterOfferRaceTests` reproduces it rarely). Two
  simultaneous booking transactions each insert an occurrence and each GiST
  exclusion-constraint check waits on the other's uncommitted row — Postgres aborts one
  with `40P01`. **Integrity holds** (exactly one booking, ever), but `EfBookingRepository`
  translates only `23P01`, so the aborted caller gets a 500 instead of the graceful
  `slot_taken` decline; their retry resolves correctly. Fix when touched: a deadlock-retry
  of the whole booking use-case (the victim's rerun deterministically hits `23P01`), not a
  blind `40P01 → slot_taken` mapping.

## Phase history (decoder for "Phase N" stamps in code and docs)

The retired ROADMAP phased the build 0–7; phase numbers remain in code comments and doc
stamps as historical attribution:

| Phase | Was | Status |
|---|---|---|
| 0 | Repo/platform health — `/api/v1` normalization, tests, analytics sink, SEO pass | ✅ 2026-07-04 |
| 1 | Identity & trust core — SSO, token rotation, Turnstile, ToS/`/account` | ✅ |
| 2 | Apply → approve loop (web) — applications, threads, notifications, inboxes | ✅ |
| 3 | Booking integrity — exclusion constraint, DST materialization, cancel/no-show | ✅ |
| 4 | Mobile app v1 — code ✅; release/ops carried into the Phase 6 launch checklist | ✅ code |
| 5 | Provider self-service — Manage + Media modules, moderation | ✅ code |
| 6 | Reputation & launch hardening | this backlog |
| 7+ | Growth seams (trigger-gated) | this backlog |

As-built truth for 0–5 lives in `ARCHITECTURE.md`; the launch-blocking ops leftovers from
0–5 all live in `phase-6-reputation-and-launch.md` Slice 6 (they gate launch, so the
launch phase owns them).

## Standing workstreams (every slice, no phase)

- **Contracts discipline:** any wire change follows the CONTRACTS.md §1 checklist.
- **Analytics:** every new surface ships with its taxonomy events; nothing user-visible
  goes un-instrumented (PRD commitment).
- **Flags:** every risky surface behind a flag; flags cleaned up once stable.
- **Docs:** ARCHITECTURE.md updated as slices land; SYSTEM_DESIGN §17 for deviations;
  SEO.md ticked as built.
- **Cost watch:** stay under the ~$100 AUD/mo ceiling; new vendors need a line-item
  justification. Current adds: Resend free tier, Apple $99/yr, DO Spaces base tier
  (photos/CDN), Google Geocoding (metered, rate-limited to provider address entry only).
