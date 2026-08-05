# Backlog — what to build next

> Replaces `ROADMAP.md` (retired 2026-07-04; full text in git history). Each doc here is
> an implementation plan detailed enough that picking it up is execution, not design.
> When a slice lands: update the owning docs per the CLAUDE.md doc map (ARCHITECTURE.md
> as-built, CONTRACTS.md shapes, SYSTEM_DESIGN §17 deviations) and prune the plan.

| Doc | Owns |
|---|---|
| `v2_migration/` | **ACTIVE — this is the current build priority.** Web v2 prototype → production: `design.md` holds the adopted decisions **D1–D9** (2026-08-05), `build_plan.md` the six execution phases. Covers production SSO/Turnstile/agreements, correspondence onto the real API, the single-gate moderation model + Admin reduction, manage-create idempotency, and SPA hardening/SEO honesty |
| `phase-6-reputation-and-launch.md` | Ratings & reviews, provider responsiveness, one-tap rebook, expiry tuning, SEO completion, beachhead swap + the full launch/ops checklist. **Exit = public launch.** Still the launch gate — but its *web* items (production SSO, moving web v2 off its demo store, SEO on a client-rendered surface) are **superseded in mechanism** by `v2_migration/`, which owns them; phase 6 just checks they're done |
| `phase-7-growth-seams.md` | Trigger-gated growth items: verified badges (delegated identity verification), vouching, Area #2, phone OTP step-up, insurance/safeguarding research — plus the small-deferred-items index |
| `payments.md` | The standalone payments design: Stripe Connect (inbound + outbound), per-occurrence charging for recurring bookings, refund & cancellation policy. **Rails built 2026-08-05 on a mock gateway** (`docs/contracts/payments.md` = as-built truth); the Stripe adapter + webhooks + legal/policy work stay gated on the Phase 7 paid-bookings trigger |
| `booking-modes.md` | Instant book (default) vs manual approval per venue, rescind semantics, charge timing — **implemented 2026-08-05** (behind `payments.enabled`); **deferred:** chronic-rescinder nudge to manual, per-user booking caps (adopted 2026-08-05, partially supersedes `payments.md` §5) |

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
