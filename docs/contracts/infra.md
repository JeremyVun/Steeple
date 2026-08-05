# Contracts — infra integrations (was CONTRACTS §8–§9)

> **Scope:** the contracts with things Steeple does not own — the deployed feature-flags
> service and the client flags proxy; and the non-API integration contracts (Admin edge auth,
> sub-path hosting, deep links, push payload).
> Conventions/governance: see `conventions.md`. Legend: ✅ built & live · 🔲 planned.

## 8. Feature flags service (deployed infra)

- `GET /flags` → snapshot `[{key, enabled/rule-set …}]`; `GET /flags/stream` → SSE updates.
  Steeple services consume via `Steeple.FlagsSdk` (in-memory cache, local evaluation,
  Perchd rule semantics: ordered condition rules, AND groups, default rule, deterministic
  percentage rollouts). Never block a request on the flags service.
- **Mobile/web-client flags** are proxied: `GET /api/v1/flags?platform=ios|android|web&build=<int>` ✅
  *(built 2026-07-04 — ROADMAP Phase 4)* returns the **public** flags evaluated for the caller's
  context as `{key: bool}` — clients never talk to the flags service directly, and private/ops
  flags never leave the backend. The public set is an explicit hardcoded allowlist in
  `PublicFlagsService`: `mobile.apply_enabled`, `mobile.manage_enabled`, `mobile.force_upgrade`.
  The `platform`/`build` query params feed rule conditions server-side, so value-shaped concerns
  stay boolean on the wire — today only `mobile.force_upgrade` reads `build` (a config-backed
  `Flags:MobileMinSupportedBuild` threshold: enabled when `build` is present and below it). Like
  Web's flags (CLAUDE.md carry-over), the Api's `IFeatureFlags` is config-backed
  (`Flags:<key>` section) until the flags SDK has a home in this repo — evaluation is local
  config reads only, never a network call either way.
- Naming: `<surface|domain>.<feature>` — e.g. `web.apply_from_browser`,
  `booking.recurring_materialization`, `trust.phone_otp_stepup`.

Flags read by the API today (as-built, `Flags:` config section): server-side gates
`listing.availability`, `manage.open_hours_required`, `booking.counter_offers` plus the three
public `mobile.*` rows. All default **off** in `appsettings.json` and are **on** in
`appsettings.Development.json` so the dev loop exercises them.

## 9. Non-API integration contracts

- **Admin edge auth (authelia):** Admin is only reachable through the authelia-gated
  hostname; it trusts the forwarded identity header (`Remote-User`) for audit
  attribution. Containers must not be reachable except via the edge proxy.
- **Sub-path hosting:** web v2 uses document-relative build assets and API URLs behind a
  stripped proxy prefix. Admin maps `X-Forwarded-Prefix` to `PathBase` and derives emitted
  URLs from `~/`-relative helpers — see CLAUDE.md.
- **Deep links** 🔲 *(implemented only in deprecated web v1; replacement required in v2)*:
  v1 can serve
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, config-driven
  (`DeepLinks:AppleAppId`, `DeepLinks:AndroidPackage`, `DeepLinks:AndroidSha256Fingerprints`) —
  absent config 404s both rather than serving a bogus association (dev default, until the mobile
  app is registered). AASA covers `applinks.details[].paths: ["/space/*"]`. The canonical listing
  URL `https://<host>/space/{venueSlug}/{roomSlug}` must open the app's listing screen when
  installed (fallback: web page). Custom scheme `steeple://` for auth callbacks only.
- **Push payload** ✅ *(built 2026-07-04 — ROADMAP Phase 4, `IPushGateway`)*: FCM data messages
  `{notificationId, type, deepLink}`; render from the inbox, never trust push content as the
  record. `deepLink` is a **path-only canonical path** from the client deep-link registry
  (`mobile.md` §7): `/inbox/applications/{id}`, `/bookings/{id}`, `/inbox`,
  `/space/{venueSlug}/{roomSlug}`. Clients route unknown values to browse, never an error.
