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
| `reputation-and-launch.md` | Response-rate signals, renewal, expiry tuning, area SEO, and launch operations. Ratings and clean-route SEO are already complete. |
| `phase-7-growth-seams.md` | Trigger-gated expansion: verification, vouching, area two, trust step-ups, insurance, and safeguarding. |
| `payments.md` | Stripe adapter, webhooks, and launch-time legal/policy work; the mock-gateway rails are built. |
| `sse/design.md` | Unscheduled live-inbox refresh over SSE. |
| `booking-modes.md` | Adopted rationale plus the still-deferred chronic-rescinder signal. |

## Historical rationale and completion records

| Area | Record |
|---|---|
| Cleanup and hardening (completed 2026-08-09) | `cleanup/design.md`, `cleanup/build_plan.md` |
| Ratings on web v2 (completed 2026-08-08) | `ratings/design.md`, `ratings/build_plan.md` |
| Crawlable listings and clean routes (completed 2026-08-08) | `seo/design.md`, `seo/build_plan.md` |
| Original SEO brief | `seo-crawlable-listings.md` (move notice only) |

