# Contracts — governance & conventions (was CONTRACTS §1–§2)

> **Scope:** how a wire contract may change, and the conventions every `/api/v1` endpoint
> obeys (casing, times, IDs, enums, pagination, errors, auth, idempotency, rate limits),
> plus the canonical wire enum token registry. Endpoint-by-endpoint shapes live in the
> sibling seam files (`discovery.md`, `identity.md`, `applications.md`, `manage.md`).
> Legend (all seam files): ✅ built & live · 🔲 planned (shape agreed, not yet implemented).
> Planned shapes may still evolve; **built shapes may not change except by the §1 rules.**

**The API owns the contract.** `Steeple.Api/Contracts/` plus its enum-backed projections are the
reference implementation. The client mirrors remain hand-kept **by convention, not by shared
assembly**; one shared golden table and three platform tests keep them honest.

## 1. Governance — how contracts change

`Steeple.Api/Contracts/` is the reference implementation. The active web mirror is
`src/Steeple.Web.v2/src/data/api.js` (wire) plus `catalog.js` (product vocabulary over it),
and `mobile/lib/**/models/` is the hand-kept mobile mirror.

**Change rules:**
1. **Additive is free.** New optional fields, new endpoints, new enum *values* — allowed
   any time. Clients must tolerate unknown JSON fields (Web: default; Flutter: don't use
   `checked: true` deserialization against unknown keys).
2. **Breaking requires a version bump** (`/api/v1` → `/api/v2`): removing/renaming fields,
   changing types/semantics, changing an enum's wire representation. With no external
   consumers yet, a break inside `/api/v1` is acceptable **only** if API + Web + mobile
   land in the same commit.
3. **Every contract change is one commit** touching: `Api/Contracts` → the web mirror
   (v2 `src/data/api.js` + its consumer) → mobile models (`mobile/lib/core/models/` + the
   matching `test/fixtures/*.json`) → **the owning file in `docs/contracts/`**. If a
   contracts file disagrees with the code, the code is wrong or the file must be fixed in
   the same PR — never leave them diverged.
4. Deprecations: mark the field/endpoint in the owning file with the date + replacement;
   remove after all shipped clients (incl. the oldest supported mobile build) stop reading
   it. Mobile makes deprecation real: **assume any wire shape a released app build reads
   lives for ≥6 months.**

## 2. Conventions (all `/api/v1` endpoints)

| Concern | Convention |
|---|---|
| Base path | `/api/v1` ✅ (normalized 2026-07-03; the old unversioned `/api` paths were removed — no external consumers existed) |
| Casing | `camelCase` JSON (System.Text.Json defaults) |
| Timestamps | ISO 8601 UTC with `Z` suffix (`2026-07-03T14:00:00Z`) |
| Local times | Schedule fields (booking times) are **venue-local** wall-clock (`HH:mm`) + dates (`yyyy-MM-dd`); the venue's IANA `timezone` travels with them |
| IDs | GUID strings |
| Enums | Stable camelCase strings on the wire (`"children"`, `"stepFreeAccess"`, `"church"`); flags enums = string arrays. Clients humanize for display. ✅ (normalized 2026-07-03; decision log SYSTEM_DESIGN §17) |
| Pagination | Request `page` (1-based) + `pageSize` (≤100, default 24); response `{ items, totalCount, page, pageSize }` |
| Errors | RFC 9457 ProblemDetails + `code` extension: `{ type, title, status, detail?, code }`. Stable `code` values documented per endpoint (e.g. `slot_taken`, `geofence_rejected`, `turnstile_failed`, `rate_limited`) |
| Auth | `Authorization: Bearer <accessToken>` (mobile and the web SPA; web keeps it in module memory). Anonymous allowed on all Discovery reads |
| Idempotency | `Idempotency-Key` header (client GUID) honored on `POST /listings/{id}/applications` ✅, `POST /manage/venues` ✅, `POST /manage/venues/{id}/rooms` ✅ (2026-08-05, D8). Replays return the original result as `200` (first create is `201`); keys are scoped to the authenticated user and remain replayable for 30 days, after which the retention sweep may remove the guard without touching the created resource. A non-GUID value is treated as absent (unguarded create, never a `400`). Not yet honored on `POST /auth/sessions` — see `identity.md` |
| Rate limits | `429` + `Retry-After`. Public writable endpoints additionally require a Turnstile token field where noted |
| Unknown fields | Clients must ignore them (see §1.1) |

### 2.1 Wire enum token registry ✅

[`tests/fixtures/wire-tokens.json`](../../tests/fixtures/wire-tokens.json) is the sole
authoritative table for every API enum token and feature-flag name. The C# golden test derives
the API side from every enum member through `FlagEnumExtensions`; web and mobile compare their
complete hand-kept registries and typed maps with the same file. A token change therefore lands
in the API, shared table, both client mirrors, and all three tests together.

Clients must still tolerate values newer than their build (additive rule §1.1) and humanize or
fall back safely. `Weekdays` retain table order on the wire (Sunday first); other sets are exact
memberships. Token lists repeated in endpoint descriptions are explanatory snapshots, not
independent registries.
