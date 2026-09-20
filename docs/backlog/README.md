# Backlog index

This directory separates current work from dated rationale. Current requirements live in
`docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/contracts/`; completed plans do not override
those sources.

Use these status markers consistently:

- `Status: active backlog` — work remains available to schedule.
- `Status: historical rationale` — the design or plan has landed; use it to understand why,
  not what exists now.
- `Superseded YYYY-MM-DD → <pointer>` — the named statement no longer governs. The pointer
  must lead to the replacement decision or current contract.

## Active backlog

| Document | Remaining work |
|---|---|
| [MVP release](../runbooks/mvp-release.md) | Current release gates, local fixes and verification. The previously indexed `reputation-and-launch.md` is absent from this checkout. |
| Growth (no current plan file) | Trigger-gated expansion remains deferred; `phase-7-growth-seams.md` is absent from this checkout. |
| `payments.md` | Real guest payment setup, charging/refunds, payment webhooks, and live legal/policy work; sandbox host Connect onboarding is built. |
| Booking modes | Current behavior is owned by `../contracts/applications.md` and `../contracts/payments.md`; the previously indexed plan is absent. |

## Historical rationale and completion records

| Area | Record |
|---|---|
| Ratings on web v2 (core completed 2026-08-08; follow-ups completed 2026-09-05) | `ratings/design.md`, `ratings/build_plan.md` |
| Host Stripe sandbox onboarding (completed 2026-09-06) | `host-onboarding/design.md`, `host-onboarding/build_plan.md`; operator setup in `../runbooks/stripe.md` |
