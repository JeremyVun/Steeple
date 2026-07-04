# Steeple — Implementation Roadmap

> **Status:** Adopted 2026-07-03. Phased, prioritized plan from the current state
> (read-only discovery slice live) to public beachhead launch and beyond. POC-paced —
> phases are ordered by dependency and risk, not dated. Each phase ends with something
> demonstrable in real hands ("exit"), because the build itself is the validation (PRD).
>
> Ordering rationale: **get the two-sided loop live on web first** (fastest path to a real
> church approving a real organizer — no app store in the critical path), make booking
> integrity real, then ship mobile as the recurring-user home, then open provider
> self-service. Trust/legal plumbing rides with the phase that first needs it.

## Current state (done)

Read-only discovery vertical slice: geo-fenced search/filter + map, listing detail with
shareable URLs, Postgres + Liquibase, analytics events (placeholder Postgres sink), admin
dashboard reading live listings/analytics (auth = authelia at the edge), deployed infra:
flags service, Loki/Grafana, edge proxy. See `ARCHITECTURE.md`.

---

## Phase 0 — Repo & platform health ✅ *(completed 2026-07-03, except flags wiring)*

Unblocks everything; no product change.

- ✅ **Fix the broken solution:** the phantom `Steeple.FlagsSdk`/`Steeple.FlagsService`
  entries were removed from `Steeple.slnx`; `dotnet build` is green.
- ✅ **Contract normalization to `/api/v1`** (CONTRACTS §2): versioned base path; enums →
  stable camelCase tokens (clients humanize); wire DTOs self-contained
  (`GeoPointDto`/`BoundingBoxDto` — no Persistence types); 404s return ProblemDetails;
  Web migrated in the same change.
- ✅ **Test scaffolding:** `tests/Steeple.Api.Tests` (unit: GeofencePolicy, GeoMath,
  listing visibility) + `tests/Steeple.Integration.Tests` (Testcontainers Postgres,
  Liquibase SQL applied raw, repository behavior) — the rig Bookings' concurrency test
  will build on.
- ✅ **Listing visibility fix** (found during test scaffolding): direct id/slug detail
  lookups no longer leak Draft/Unlisted rooms — service-level gate + covering tests.
- ✅ **SEO:** checklist synced to reality; JSON-LD completed (Offer/UnitPriceSpecification,
  PlaceOfWorship, BreadcrumbList), dynamic preconnect hints added; image dimensions
  verified already present. Open in SEO.md: area landing pages, Search Console (operational).
- ✅ **Analytics sink swap** (ANALYTICS.md): `StdoutLogAnalyticsSink` behind the same port,
  JSON console logging in Production; request-path DB write retired (deployed Promtail
  tails container stdout — no compose change needed in this repo).
- ✅ README rewritten (Liquibase-owned schema, real layout).
- 🔲 **Flags wiring** — still pending: the flags SDK source lives outside this repo; wire
  `Steeple.Api`/Web/Admin to it once the SDK has a home here (or a package feed).

**Exit met:** green `dotnet build` + `dotnet test` (34 tests); app-side event emission
matches the decided pipeline (verify end-to-end in Grafana on next deploy); SEO checklist
current.

## Phase 1 — Identity & trust core

The auth substrate every later phase needs (CONTRACTS §4, SYSTEM_DESIGN §6).

- `users`/`user_logins`/`refresh_tokens`/`user_agreements` changesets; Identity module
  (Google + Apple ID-token verification, find-or-create, access+refresh issuance,
  rotation/revocation).
- Web BFF sign-in: Google redirect + Apple form_post flows, encrypted auth cookie,
  persisted DataProtection keys (compose volume), antiforgery on authenticated POSTs.
- Turnstile + ASP.NET rate limiting on `auth/sessions` (and ready for apply/events).
- ToS + Privacy pages (versioned docs) + acceptance recording; account page with sign-out
  everywhere + `DELETE /me` (anonymize).
- Flags: `web.sign_in_enabled` gate for safe rollout.

**Exit:** sign in with Google *and* Apple on the web funnel end-to-end in production;
sessions survive deploys; acceptance rows recorded; abuse controls verified by hitting
the rate limit deliberately.

## Phase 2 — Apply → approve loop (web) ⭐ *the* milestone

Two-sided value exists for the first time: a real organizer applies, a real church decides.

- Schema: `applications`, `application_messages`, `venue_managers`, `notifications`, `devices`.
- Applications module: submit (intent + venue-local schedule), state machine
  (`pending → needsInfo ⇄ / approved / declined / withdrawn / expired`), thread messages,
  per-account + per-IP + Turnstile on submit, idempotency keys.
- Notifications module: inbox rows + email fan-out (SES/Postmark/Resend adapter behind
  `IEmailGateway`) for received/message/approved/declined. (FCM adapter lands with mobile.)
- Web: apply form on listing detail (SSO gate at submit — PRD friction rule), organizer
  inbox (`/inbox`), **provider inbox** (`/manage/applications`: approve / ask / decline).
  Providers are `venue_managers` — founder links the concierge churches' Google accounts
  via Admin.
- Admin: applications visibility (read + manual state repair), venue-manager linking.
- Analytics: `application_started/submitted/decided`, `sso_started/completed` wired
  (funnel drop-off measurable from day one). Flag: `web.apply_from_browser`.

**Exit:** end-to-end demo with a real church + organizer in real hands: apply on web →
church emailed → approves on web → organizer notified. Time-to-decision visible in Grafana.

## Phase 3 — Booking integrity

The PRD's headline DB requirement; approval now produces real, protected commitments.

- Schema: `bookings`, `booking_occurrences` + **`btree_gist` `EXCLUDE (RoomId WITH =,
  During WITH &&)`**; `venues.Timezone`; `rooms/venues.UpdatedAtUtc` (SEO lastmod rides along).
- Bookings module: approval transaction materializes venue-local → UTC occurrences
  (DST-correct); `409 slot_taken` path auto-declines + notifies; cancellation with notice
  window (both sides, slots freed); no-show marking; listing lifecycle guard
  (`has_active_bookings`); renewal-due detection (nudge notification — the renewal seam).
- Web: bookings on both inboxes (organizer "my bookings", provider calendar-ish list),
  cancel flows.
- **Integration test that proves it:** N concurrent approvals for overlapping slots via
  Testcontainers → exactly one booking exists. This test is the phase.

**Exit:** double-booking demonstrably impossible; a recurring booking survives a listing
edit; cancellation notifies and frees slots; renewal nudge fires for an expiring term.

## Phase 4 — Mobile app v1 (organizer home)

Per `docs/MOBILE_DESIGN.md`. The loop already works on web, so the app ships **into a
working marketplace** and adds stickiness (push, inbox in pocket).

- `/mobile` scaffold (env config, dio+auth, router, theme, analytics batcher, flags snapshot).
- Discovery (map+list+filters) → detail → apply (native SSO) → inbox + my bookings + profile.
- Push: FCM adapter server-side (`IPushGateway`), `POST /me/devices`, data-message deep
  links; contextual iOS permission ask. Deep links: Web serves the two `.well-known`
  files; universal/app links open listing screens.
- `GET /api/v1/flags` proxy endpoint + `mobile.*` kill-switch flags +
  `mobile.force_upgrade` forced-upgrade screen.
- Release: TestFlight (founder + first organizers) → App Store; Android closed testing
  begins (founder's testers).

**Exit:** organizer completes browse→apply→approved entirely on the app, with push;
TestFlight cohort active; performance budgets (MOBILE_DESIGN §4) measured and met.

## Phase 5 — Provider self-service

The product brief's MVP goal: churches list and manage themselves; concierge becomes
optional rather than structural.

- Media module: photo upload → EXIF strip → variants → Spaces CDN (admin concierge uses
  the same path — retires seeded picsum URLs).
- Manage module: venue/room CRUD + geocoded address entry (real `IGeocodingGateway`
  adapter, geofenced + rate-limited), status transitions honoring bookings.
- Web `/manage` area: listings editor, photos, application/booking inboxes (Phase 2/3
  screens grow up); provider onboarding flow (create venue → founder/Admin approves for
  publish — moderation gate keeps listing quality concierge-grade).
- Admin: moderation queue (approve new/edited listings), DMCA groundwork (register agent;
  takedown path documented).
- Mobile `manage` feature fast-follow (approve/decline + basic listing edit).

**Exit:** a church signs up, lists a room with photos, and approves an application with
zero founder involvement (founder only clicks "publish approve" in Admin).

## Phase 6 — Reputation & launch hardening

- Ratings both ways post-completion; no-show feeds profiles; provider response-rate/time
  surfaced (PRD's unresponsive-admin failure mode); stale-application auto-expiry tuned.
- Renewal nudges → one-tap rebook (new bounded term re-checking availability).
- SEO completion: area landing page for the beachhead, JSON-LD validated, Search Console
  submitted; CWV pass.
- Ops: Grafana funnel dashboards (the PRD metric set), uptime alerts to phone, restore
  drill executed and runbook timed against RTO target.
- Beachhead swap: founder picks the launch suburb; geofence config updated; concierge
  supply onboarded (target per PRD: a dense cluster before demand push).

**Exit:** public launch in the chosen NoVA suburb — everything before this was staging.

## Phase 7+ — Growth seams (open when the data demands, not before)

Unordered; each has a designed seam (SYSTEM_DESIGN §16) and a trigger:

| Item | Trigger |
|---|---|
| Paid bookings — Stripe Connect, invisible commission, ToS bump | Churches/organizers actually transacting money offline through the platform |
| Verified badges (Stripe Identity/Persona) | Providers ask for stronger organizer signals; willingness to pay |
| Phone OTP step-up (`ISmsOtpSender` → Plivo/Twilio Verify) | Abuse/no-show metrics show SSO+application isn't enough |
| Community vouching / org-affiliation | Maria-cold-start friction visible in funnel data |
| Area #2 (areas table, landing pages; PostGIS if geo strains) | Beachhead liquidity achieved; founder has relationships in the next area |
| Insurance/bonds (Option B), safeguarding program | Volume + explicit demand; legal research first (PRD) |
| API edge split / BFFs, outbox worker, managed Postgres | The specific scaling force appears (SYSTEM_DESIGN §16) |

## Standing workstreams (every phase)

- **Contracts discipline:** any wire change follows the CONTRACTS.md §1 checklist.
- **Analytics:** every new surface ships with its taxonomy events; nothing important
  un-instrumented (PRD commitment).
- **Flags:** every risky surface behind a flag; flags cleaned up once stable.
- **Docs:** ARCHITECTURE.md updated as slices land; SYSTEM_DESIGN decision log for
  deviations; SEO.md/ANALYTICS.md checklists ticked as built.
- **Cost watch:** stay under the ~$100 AUD/mo ceiling; new vendors need a line-item
  justification (current adds: transactional email free tier, Sentry free tier, Apple $99/yr).
