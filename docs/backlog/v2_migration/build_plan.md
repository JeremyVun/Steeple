# Web v2 production migration — build plan (COMPLETE; phase-history stub)

> Executed 2026-08-05 → 2026-08-07 and closed by the P6 sweep. The rationale of record is
> `design.md` (decisions D1–D9 — kept intact); the as-built truth is `ARCHITECTURE.md`
> and CLAUDE.md's v2 section; the full phase briefs and landing notes live in this file's
> git history. Open items the sweep recorded (media base URL, mobile card UI, Stripe,
> list-vs-detail) are in `docs/backlog/README.md` → "Open decisions & recorded gaps".

| Phase | Was | Landed |
|---|---|---|
| P1 | Signed-out truth & the account surface (D6) — per-person store, session-gated inbox/chips, server-side sign-out | 2026-08-05 |
| P2 | Correspondence onto the wire (D4, D5) — inbox = `GET /me/applications`, honest offline, availability truth; found the per-IP-rate-limiter-before-auth defect | 2026-08-05 |
| P2.5 | The payments surface — desk IA Bookings·Requests·Spaces, rescind + refund, failure ladder, card panel, payout stub, ambient notifications | 2026-08-05 |
| P3 | Single-gate moderation + Admin gutting (D2, D3) — trusted-host rule in ManageService, Admin reduced to four screens + Unlist | 2026-08-05 |
| P3.5 | Product-first boot — printed arrival / flat boot / village boot; intent beats scenery | 2026-08-07 |
| P3.6 | Harness consolidation — shared `tools/fixtures.mjs`, wire-era rebaselines, pipe+finally hygiene | 2026-08-07 |
| P4 | Production SSO, Turnstile, agreements (D1, D7) — env-gated; keyed runs await owner IDs (`docs/runbooks/sso-and-turnstile.md`) | 2026-08-07 |
| P5 | Hardening (D8, D9) — idempotent manage creates (016), write timeouts, nginx CSP + provider origins, SEO floor, analytics batcher | 2026-08-07 |
| P6 | Closing sweep — owner's five-step E2E driven as three humans, full suite pass, docs closeout | 2026-08-07 |

Verification state at close: `dotnet test` 403 unit + 96 integration green; every
`tools/*.mjs` suite green under its documented flags except the two documented known-stale
sets (guest-test 31/42 map-first drift; world-test exactly 12, symmetric per style).
