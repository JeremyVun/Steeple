# Phase 7+ — Growth seams (implementation plans, trigger-gated)

> **Status:** Backlog, adopted 2026-07-04 (supersedes the retired `ROADMAP.md`'s Phase 7+
> entry). **Unordered — each item opens when its trigger fires, not before.** Every item
> already has a designed seam (SYSTEM_DESIGN §16); this doc holds the per-item
> implementation plan so opening a seam is execution, not design. Building any of these
> ahead of its trigger is scope invention — the PRD deferred them deliberately.

## Trigger table (what opens what)

| Item | Trigger | Plan |
|---|---|---|
| Paid bookings (inbound + outbound money) | Churches/organizers actually transacting money offline through the platform | **`payments.md`** (own design doc) |
| Verified badges — verification delegated to the payment provider | Providers ask for stronger organizer signals; willingness to pay | §1 below |
| Community vouching / org-affiliation | New-organizer approval rate materially below rated-organizer approval rate (cold-start friction visible in the funnel) | §2 below |
| Area #2 (multi-area) | Beachhead liquidity achieved; founder has relationships in the next area | §3 below |
| Phone OTP step-up | Abuse metrics demand it (spam applications surviving SSO + Turnstile + rate limits) | §4 below |
| Insurance / bonds (Option B) + safeguarding program | Volume + explicit demand; **legal research first** (PRD) | §5 below |

## 1. Verified badges — identity verification, delegated

The monetizable top tier of the trust stack (PRD: "trust-as-a-service is the primary
seam"). The rule that governs everything here: **delegate trust, don't custody it** —
Steeple never sees, stores, or transmits a government ID.

### Provider choice

- **Stripe Identity** once payments (Stripe Connect, `payments.md`) is live — one vendor,
  one webhook surface, one SDK already integrated. Per-verification pricing (~$1.50–$2
  range historically; confirm current pricing at build time).
- **Persona** if badges are demanded *before* payments ships (it has a workable free/dev
  tier) — same port, different adapter; decide on the day by which trigger fired first.

### Who gets verified, and what it means

- **Organizers** — the hard side of trust (PRD: supplier trust is largely solved). Badge
  surfaces in `organizer.ratingSummary`/application view: the provider sees
  "Identity verified" next to the stated intent.
- **Venues** — today `venue.isIdentityVerified` means *concierge/SSO-grade* verification.
  That field's meaning **must not silently change**: keep its existing semantics and add
  a distinct `verifiedBadge` (additive) for provider-side badges.
- **Wording discipline (PRD Option A):** the badge says *identity verified* — never
  "vetted", "safe", or anything safeguarding-adjacent. The no-vetting disclaimer stays.

### Flow

1. User taps "Get verified" (account/profile screen) → API creates a verification
   session at the provider → returns the hosted-flow URL (web) / native SDK token
   (mobile).
2. User completes document + selfie checks entirely on the provider's surface.
3. Webhook (`identity.verification_session.verified` or Persona equivalent) → stamp the
   user's verification row. **Request post-verification redaction of the collected
   document data at the provider** — Steeple keeps only: status, provider session id,
   timestamps.
4. Badge renders wherever the trust summary renders.

### Build sketch

- Schema: `user_verifications (Id, UserId FK, Provider, ProviderSessionId unique,
  Status int, VerifiedAtUtc?, CreatedAtUtc)` — history-preserving (re-verification,
  expiry policy later).
- Module: lives in **Identity** (it's an identity attribute, not a payment) — port
  `IIdentityVerificationGateway`, adapter per provider; webhook handling reuses the
  payments webhook plumbing when Stripe, else its own endpoint.
- Charging for the badge: a plain one-time PaymentIntent on the platform account (not
  Connect) via the Payments module rails. **Pricing is a launch-time founder decision**
  (PRD deferred decision); shipping verification free-of-charge first to seed supply-side
  trust is a valid opening move — mechanics are identical.
- Contracts: `POST /api/v1/me/verification` → `{url|clientSecret}`, `GET` status;
  additive `verifiedBadge` fields; taxonomy `verification_started` / `verification_completed`.
- Flag: `trust.verified_badges`.

## 2. Community vouching / org-affiliation

PRD fast-follow that was never scheduled; it solves Maria's cold start *without* money or
documents — on-brand for community-first, stores nothing sensitive.

- **Org-affiliation** (build first — cheaper): an organizer attaches their organization
  (name + role + org type: school / nonprofit / club / congregation) to their profile;
  shown on applications alongside intent. Self-declared, labeled as such — it raises
  troll cost the same way the written application does.
- **Vouching** (build second — needs liquidity): a user in good standing (≥N completed
  bookings, no no-show marks) can vouch for a newcomer; the vouch (voucher's first name +
  standing) surfaces in the newcomer's trust summary. Cap outstanding vouches per user;
  a voucher's own no-show/regression marks their vouches stale. No transitivity — one hop
  only, or it becomes meaningless.
- Schema: `organizer_profiles` extension columns + `vouches (VoucherId, VouchedId,
  CreatedAtUtc, RevokedAtUtc?)`; all additive DTO fields on `organizer`.
- Explicitly **not** identity verification — never rendered with the badge treatment.

## 3. Area #2 — multi-area

The tech is deliberately small; **GTM is the hard part** (a new metro's density is
re-earned, per the PRD's own moat analysis). Do not open this seam for tech reasons.

1. Changeset: `areas (Id, Slug unique, Name, MinLat/MaxLat/MinLng/MaxLng, CenterLat/Lng,
   IsActive)`; seed row 1 = the current `Geofence` config values. `venues.AreaId` FK
   stamped at geocode time.
2. `GeofencePolicy` reads active areas (union of bounds) instead of the config section;
   config section retired. Out-of-all-areas behavior unchanged (clamp/404 — silent by
   design).
3. `GET /api/v1/areas` + `GET /api/v1/areas/{slug}` go from single-area (Phase 6 landing
   page) to table-backed; one landing page per area (the SEO §13 page-per-area lever);
   sitemap grows area URLs.
4. Search stays bounding-box + haversine per area. **PostGIS only if geo actually
   strains** (SYSTEM_DESIGN §16 keeps it a one-adapter swap behind `IRoomRepository`).
5. Concierge onboarding for the new cluster; per-area launch checklist is Phase 6's
   Slice 6, re-run.

## 4. Phone OTP step-up (trust escalation)

Reserved escalation — **a paid real-world-identity signal, only where stakes or abuse
demand it** (recurring bookings, children-flagged activities, or measured spam surviving
the v1 gates). The PRD's cost research stands: managed Verify products (A2P-10DLC-exempt);
**Plivo Verify** (~$0.008/verification) preferred, Twilio Verify the fallback.

- Port `ISmsOtpSender` (already reserved) + adapter; flag `trust.phone_otp_stepup`
  scoping *which* applications require it (rule-driven: activity type / recurrence /
  abuse heuristics).
- Phone number: collected at step-up only, verify-then-discard or store verified-boolean +
  last-4 — never the full number beyond what contact requires (PII minimization, §14).
- SMS-pumping defense from day one: per-phone + per-IP rate limits, backoff, Turnstile on
  the request endpoint (the PRD flags toll fraud as a real budget threat).

## 5. Insurance / bonds (Option B) + safeguarding program

Both are **research-first workstreams, not builds**. Nothing here has a code seam worth
cutting yet, and both change Steeple's liability posture (v1 is neutral-platform
Option A) — that's a founder/legal decision, not an engineering one.

- **Insurance/bonds:** the SpaceToCo-style premium Gates layer — brokered insurance,
  damage bonds (the payments SetupIntent/hold machinery in `payments.md` §10 is the
  eventual mechanical seam). Prerequisites: legal research on brokering exposure,
  volume that justifies it, and paid bookings already live.
- **Safeguarding:** background-check facilitation for children's activities. The PRD is
  explicit: jurisdiction-specific obligations are researched **before** any child-focused
  vetting feature; churches remain the duty-bearers meanwhile (their own stated
  requirements render on listings). Outcome of the research becomes
  `docs/vetting-program.md` — a separate program, not a feature slice.

## Smaller deferred items (tracked in their owning docs; listed so nothing hides)

| Item | Owning doc / note |
|---|---|
| WebP variants + `<picture>` negotiation | SYSTEM_DESIGN §17 (2026-07-04) — deferred until serving side can negotiate |
| Search day/time availability filters | CONTRACTS §3 planned addition |
| Web client-side analytics migration (BFF events → `POST /events`) | CONTRACTS §7 footnote ¹ |
| Mobile client-side Turnstile | ARCHITECTURE "not built yet" — only enforced where a secret is configured |
| `Idempotency-Key` on `auth/sessions` | CONTRACTS §4 deviation note — harmless replay today |
| Admin defense-in-depth auth (local Identity + TOTP behind authelia) | SYSTEM_DESIGN §6 |
| Cross-provider account linking | SYSTEM_DESIGN §6 — `409 use_original_provider` stands |
| Reciprocity / free-supply credits | PRD hypothesis — untested "prosumer" population; needs founder appetite + data |
| Infra scaling seams (API edge split/BFFs, outbox worker, managed Postgres, PostGIS) | SYSTEM_DESIGN §16 owns the full trigger table — open only when the specific force appears |
