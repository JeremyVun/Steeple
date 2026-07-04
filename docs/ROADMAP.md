# Steeple — Implementation Roadmap

> **Status:** Adopted 2026-07-03. Phased, prioritized plan to public beachhead launch and
> beyond. POC-paced — phases are ordered by dependency and risk, not dated; each ends with
> something demonstrable in real hands. Ordering rationale: get the two-sided loop live on
> web first (no app store in the critical path), make booking integrity real, then ship
> mobile as the recurring-user home, then open provider self-service.

## Done — Phases 0–3 ✅ (code complete 2026-07-04; details in `ARCHITECTURE.md`)

- **Phase 0 — repo & platform health:** `/api/v1` normalization (stable enum tokens,
  self-contained DTOs, ProblemDetails), listing-visibility gate fix, test scaffolding
  (unit + Testcontainers integration), analytics sink → stdout/Loki, SEO JSON-LD pass.
- **Phase 1 — identity & trust core:** Google/Apple SSO (server-side JWKS verification),
  API-issued access+refresh tokens with family-revoking rotation, Web BFF cookie sign-in,
  Turnstile + rate limiting, versioned ToS/Privacy acceptance, `/account` +
  delete/anonymize.
- **Phase 2 — apply → approve loop (web)** ⭐ *the* milestone: applications state machine
  + ask-thread, notifications inbox + Resend email fan-out, apply form with SSO-gate
  draft-stash, organizer/provider inboxes, Admin venue-manager linking.
- **Phase 3 — booking integrity:** `btree_gist` exclusion constraint, approval-as-one-
  transaction (`409 slot_taken` auto-decline), DST-correct venue-local materialization,
  48h-notice cancellation, no-show marking, lazy sweeps + renewal nudge, booking screens,
  and `BookingIntegrityTests` (6 concurrent approvals → exactly one booking).

### Outstanding carry-overs (ops/deployment, not code)

- **Flags SDK wiring (Phase 0):** the SDK source lives outside this repo; wire
  Api/Web/Admin to it once it has a home here. Config-backed `IFeatureFlags` meanwhile.
- **Production SSO setup (Phase 1):** create the Google OAuth client + Apple Services ID;
  set them plus Turnstile keys, a production `AUTH_JWT_SIGNING_KEY`, and
  `WEB_SIGN_IN_ENABLED=true` in the deployed env; verify both providers end-to-end in
  production and that sessions survive a deploy (DataProtection volume).
- **Real-hands demo (Phases 2–3):** set `Email__ApiKey`/`Email__From`, flip
  `web.apply_from_browser`, link the concierge venue managers in Admin; drive apply →
  church emailed → approve → organizer notified with a real church + organizer; confirm
  time-to-decision visible in Grafana (`application_decided.timeToDecisionHours`).
- **Production provider self-service (Phase 5):** set `GEOCODING_GOOGLE_API_KEY` (real
  geocoding replaces the stub), the `MEDIA_*` Spaces credentials (`MEDIA_SERVICE_URL`,
  `MEDIA_BUCKET`, `MEDIA_ACCESS_KEY`, `MEDIA_SECRET_KEY`, `MEDIA_PUBLIC_BASE_URL`) so uploads
  land on Spaces/CDN instead of the dev local-disk fallback, and flip `WEB_MANAGE_ENABLED=true`
  (+ `MOBILE_MANAGE_ENABLED=true` once the mobile build ships) in the deployed env; register
  the DMCA agent with the Copyright Office (the takedown path itself — Admin unlist + the
  moderation feed — already exists).

## Phase 4 — Mobile app v1 (organizer home) ← in progress (code slice ✅ 2026-07-04)

Per `MOBILE_DESIGN.md`. The loop already works on web, so the app ships **into a working
marketplace** and adds stickiness (push, inbox in pocket).

- ✅ `/mobile` scaffold (env config, dio+auth, router, theme, analytics batcher, flags
  snapshot) — every MOBILE_CONTRACTS §3–§11 seam implemented; fixture-backed fakes run
  the whole app with no backend (`--dart-define=STEEPLE_FAKES=true`).
- ✅ Discovery (map+list+filters) → detail → apply (native SSO gate at submit) → inbox +
  my bookings + profile, all against the shared widget kit and design-system theme.
- ✅ Push server-side: `IPushGateway` (FirebaseAdmin adapter, log-only unconfigured),
  `POST/DELETE /me/devices`, data-message deep links wired into the notification
  dispatcher; client FCM seam + contextual iOS permission ask (after first application).
  ✅ Web serves the two `.well-known` files.
- ✅ `GET /api/v1/flags` proxy + `mobile.*` kill-switch flags + `mobile.force_upgrade`
  forced-upgrade screen. ✅ `POST /api/v1/events` ingest (mobile batcher posts to it).
- 🔲 Release (the remaining slice — ops, not code): Firebase project + config files,
  Google Maps + SSO client ids, Xcode signing/entitlements hookup, official Google
  sign-in brand asset, TestFlight (founder + first organizers) → App Store; Android
  closed testing begins (founder's testers). Profile runs against MOBILE_DESIGN §4
  budgets on real devices.

**Exit:** organizer completes browse→apply→approved entirely on the app, with push;
TestFlight cohort active; performance budgets (MOBILE_DESIGN §4) measured and met.

## Phase 5 — Provider self-service ✅ (code complete 2026-07-04)

The product brief's MVP goal: churches list and manage themselves; concierge becomes
optional rather than structural.

- ✅ Media module: photo upload → EXIF strip → JPEG variants (thumb/card/full) → Spaces CDN
  or local disk in dev (admin concierge uses the same path — retires seeded picsum URLs for
  new photos; old rows keep their picsum `url`).
- ✅ Manage module: venue/room CRUD + geocoded address entry (`GoogleGeocodingGateway`,
  geofenced + rate-limited), status transitions honoring bookings (`409
  has_active_bookings`), immutable slugs.
- ✅ Web `/manage` area (flag `web.manage_enabled`): listings editor, photos, room create/edit;
  application/booking inboxes already shipped in Phases 2–3. Publish-request flow: a
  never-approved room asking `published` waits for Admin; after first publish, unlist/relist
  is provider-controlled.
- ✅ Admin: moderation panel (`/admin/moderation` — approve/decline publish requests +
  provider-edit review feed, `Remote-User`-attributed). DMCA groundwork: takedown path exists
  today (Admin unlist + the moderation feed); **registering the DMCA agent with the Copyright
  Office is an ops carry-over**, not code (see below).
- ✅ Mobile `manage` feature (approve/decline + listing edit) — done; built by a separate
  workstream in parallel with this slice (MOBILE_CONTRACTS.md's `ManageRepository` seam).

**Exit:** a church signs up, lists a room with photos, and approves an application with
zero founder involvement (founder only clicks "publish approve" in Admin). Met — remaining
work is the DMCA agent registration (ops) and mobile release polish, not code.

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
| Community vouching / org-affiliation | Cold-start friction visible in funnel data |
| Area #2 (areas table, landing pages; PostGIS if geo strains) | Beachhead liquidity achieved; founder has relationships in the next area |
| Insurance/bonds (Option B), safeguarding program | Volume + explicit demand; legal research first (PRD) |
| API edge split / BFFs, outbox worker, managed Postgres | The specific scaling force appears (SYSTEM_DESIGN §16) |

## Standing workstreams (every phase)

- **Contracts discipline:** any wire change follows the CONTRACTS.md §1 checklist.
- **Analytics:** every new surface ships with its taxonomy events; nothing important
  un-instrumented (PRD commitment).
- **Flags:** every risky surface behind a flag; flags cleaned up once stable.
- **Docs:** ARCHITECTURE.md updated as slices land; SYSTEM_DESIGN §17 for deviations;
  SEO.md ticked as built.
- **Cost watch:** stay under the ~$100 AUD/mo ceiling; new vendors need a line-item
  justification (current adds: Resend free tier, Apple $99/yr, DO Spaces base tier for photo
  storage/CDN, Google Geocoding metered/rate-limited to provider address entry only).
