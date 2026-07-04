# Steeple Mobile — Flutter Technical Design

> **Status:** Adopted 2026-07-03; app not yet started (lands in `/mobile`, ROADMAP Phase 4).
> Companion to `docs/SYSTEM_DESIGN.md` (backend/auth/notifications), `CONTRACTS.md`
> (every wire shape the app consumes), `docs/MOBILE_CONTRACTS.md` (in-app interfaces,
> routes, providers — the scaffolding), and `docs/DESIGN_SYSTEM.md` (canonical tokens &
> component specs). PRD constraints that bind this doc: Flutter
> (decided), iOS first + Android close behind, maps ≈ $0, SSO-only auth at the apply step,
> anonymous browsing, lean cost ceiling.

## 1. Product role & scope

The app is the **recurring user's home** — organizers who applied once and now live in the
inbox/rebook loop, and (later phases) providers approving from their pocket. Discovery is
anonymous; sign-in happens only at apply. v1 app scope (organizer-first):

- Map + list browse, filters, listing detail (parity with web discovery).
- Apply flow (intent form + Google/Apple SSO gate).
- Inbox: notifications + application threads + booking status; pull-to-refresh; push taps deep-link into it.
- My bookings (occurrences, cancel, renewal nudge); profile (agreements, sign-out, account deletion — Apple 5.1.1(v)).
- Provider approve/decline: **fast-follow** after organizer flow proves out (same API, small surface).

## 2. Stack decisions

| Concern | Choice | Why (and what was rejected) |
|---|---|---|
| Framework | Flutter stable, Dart 3 | PRD-decided; Impeller default kills shader jank |
| State | **Riverpod 3** (plain `Notifier`/`AsyncNotifier`, **no codegen**) | Compile-safe DI + async caching primitives (`AsyncNotifier`) suit read-heavy screens; far less ceremony than Bloc for a solo dev; testable overrides. *Deviation (2026-07-04): `riverpod_generator` was dropped — its analyzer pin conflicts with the current Flutter SDK + `json_serializable`; the plain Riverpod 3 API is fully supported and one less codegen chain. Family notifiers take their arg via constructor (see any `providers.dart`).* |
| Navigation | **go_router** (+ typed routes) | Deep links are load-bearing (universal links, push taps); official-adjacent, declarative redirects for the auth gate |
| HTTP | **dio** | Interceptors for auth refresh, retry/backoff, logging |
| Models | **freezed + json_serializable** | Immutable DTOs mirroring `CONTRACTS.md`; unions for sealed states (e.g. `ApplicationStatus`) |
| Maps | **google_maps_flutter on both platforms** | The official, stable plugin — the very reason Flutter was chosen. Google's native mobile map SDKs are unbilled on iOS *and* Android, so cost parity with the PRD's MapKit note; one code path. Recorded deviation (SYSTEM_DESIGN §17) |
| Auth SDKs | `google_sign_in`, `sign_in_with_apple` | Native flows → provider ID token → `POST /api/v1/auth/sessions` |
| Token storage | `flutter_secure_storage` | Keychain / Keystore |
| Push | `firebase_messaging` (+ `firebase_core` only) | FCM per PRD. **No** Firebase Analytics/Crashlytics/RemoteConfig — we own analytics + flags |
| Images | `cached_network_image` | Disk+memory cache for listing photos |
| Deep links | `app_links` + go_router | Universal links / App Links / `steeple://` |
| Crash reporting | `sentry_flutter` (free tier) | Solo operator needs stack traces; behind a wrapper, swappable |
| Local persistence | None in v1 (secure storage + `shared_preferences` only) | Inbox is server-truth by design; listings are cheap to refetch. Add drift/sqlite only if offline browse becomes a real ask |

**Environments:** `--dart-define=STEEPLE_ENV=dev|prod` → `EnvConfig` (API base URL, Sentry
DSN on/off). Dev points at `http://localhost:5200` (Android emulator: `10.0.2.2:5200`).
No secrets in the binary — the app holds nothing but public config.

## 3. Architecture

Feature-first, three thin layers per feature; dependencies point inward
(`presentation → application → data`); no feature imports another feature's internals —
cross-feature access goes through providers exposed in the feature's public `providers.dart`.

```
mobile/
  lib/
    app/                    — bootstrap, router, theme, EnvConfig, ProviderScope overrides
    core/
      api/                  — dio client, auth interceptor, ProblemDetails → AppError mapping
      auth/                 — SessionManager (tokens, refresh, sign-in/out state stream)
      analytics/            — event batcher (queue → POST /api/v1/events)
      flags/                — snapshot of GET /api/v1/flags, refresh on foreground
      push/                 — FCM registration, token upsert, tap → deep link dispatch
      models/               — shared wire models (mirrors CONTRACTS.md §3–5)
      widgets/ theme/ utils/
    features/
      discovery/            — map + list search        (data/ application/ presentation/)
      listing/              — detail screen
      apply/                — intent form + SSO gate
      inbox/                — notifications + application threads
      bookings/             — my bookings, cancel, renewal
      profile/              — account, agreements, deletion
      manage/               — provider surface (fast-follow)
    l10n/
  test/                     — unit + widget tests (mirrors lib/)
  integration_test/         — happy-path E2E (browse → apply)
```

- **data/**: repository classes over the dio client returning wire models. Repos are the
  contract mirror — when `CONTRACTS.md` changes, the diff lands here.
- **application/**: Riverpod notifiers holding screen state; all async via
  `AsyncValue` (loading/error/data handled uniformly).
- **presentation/**: widgets only; no dio, no JSON.

**Error model:** every repo call surfaces `AppError{kind: network|timeout|server|auth|
validation|rateLimited, code?, retryAfter?, message}` mapped from ProblemDetails `code`s
(`slot_taken`, `rate_limited`…). One `ErrorView` widget renders them consistently with
retry affordances; `token_reuse`/401 → SessionManager forces sign-out.

**Auth flow:** router redirect guards authenticated routes. Apply screen: draft the intent
form anonymously → SSO sheet at submit (per PRD — friction only at commitment) → dio
interceptor thereafter attaches/refreshes tokens (single-flight refresh; queued requests
retry once). Tokens in secure storage; nothing else PII-bearing persists on device.

## 4. Performance playbook (the "performant" contract)

Budgets — enforced in review, measured in CI where possible:

| Metric | Budget | How |
|---|---|---|
| Cold start → first frame | < 2.0 s mid-range Android | Defer non-critical init (Sentry, FCM ask, flags) until after first frame; no plugin work on main before `runApp` |
| Scroll (list + map) | 60 fps, zero dropped-frame bursts | `ListView.builder` + `prototypeItem`; `const` everywhere; DevTools timeline check per feature PR |
| Map ready (warm) | < 2.5 s | Search-as-region-settles (debounced `onCameraIdle`), skeleton pins from cached last result |
| Listing detail open | < 400 ms perceived | Hero from card thumb (already cached); photos progressive via CDN variants |
| App size | < 40 MB per-ABI Android / < 50 MB iOS | `--split-per-abi`, tree-shaken icons, no bundled fonts beyond brand |

Rules that keep the budgets:

1. **Rebuild discipline.** Riverpod `select()` for narrow watches; screen-level providers
   over god-providers; `const` constructors enforced by lint (`prefer_const_*` in
   `analysis_options.yaml`).
2. **Images are the biggest lever.** Always request the right CDN variant (thumb 400w in
   cards, full 1600w only in the gallery) and set `cacheWidth/cacheHeight` to the layout
   size so decode cost matches pixels on screen. `cached_network_image` everywhere.
3. **Map marker hygiene.** Diff markers on new results instead of clearing/re-adding;
   use the plugin's built-in **ClusterManager** past ~50 pins; one pre-rasterized
   `BitmapDescriptor` per pin state (free/paid/selected), never per-marker widget renders.
4. **Parse off the UI thread.** Search/inbox payloads decode via `compute()` once they
   exceed ~50 KB; keep DTOs flat (they already are).
5. **Network discipline.** Debounce filter changes (350 ms); cancel in-flight search on
   new input (dio `CancelToken`); stale-while-revalidate in-memory cache for the last
   search + viewed listings so back-navigation is instant.
6. **Impeller is default** on both platforms — don't opt out; test on a low-end Android
   (Impeller/Vulkan fallback) before each release.
7. **Measure, don't vibe.** `flutter run --profile` + DevTools before merging anything
   touching lists/maps; `integration_test` with `traceAction` timeline summaries for the
   browse→detail path; check average/worst frame times in CI output.

## 5. Push, deep links, offline behavior

- **Push:** FCM data messages `{notificationId, type, deepLink}` (CONTRACTS §9). Tap →
  `app_links`/go_router route. Foreground push → refresh inbox provider + subtle banner.
  Registration only after first sign-in (`POST /me/devices`); token rotation handled;
  deletion on sign-out. iOS: request permission **in context** (after first application
  submitted — "want to know when the church replies?"), not at launch.
- **Deep links:** universal links for `https://<host>/space/{venue}/{room}` (web serves
  the `.well-known` files — Web change, tracked in ROADMAP Phase 4); unknown/out-of-area
  links fall back to in-app browse. `steeple://` only for auth callbacks.
- **Offline:** honest-but-thin — banner on connectivity loss, cached last search/photos
  still render, mutations (apply, cancel) require connectivity and fail with retry
  affordance. No mutation queueing in v1 (a queued apply against a taken slot is worse UX
  than a clear error).

## 6. Analytics & flags in the app

- **Analytics:** same taxonomy as web (CONTRACTS §7). `core/analytics` batcher: in-memory
  queue, flush every 15 s / 20 events / on `AppLifecycleState.paused` via one
  `POST /api/v1/events`. Client emits interaction events (`map_interacted`,
  `application_started`, `sso_started`, `notification_opened`); server-authoritative
  events are never client-emitted. Session id = UUID per cold start.
- **Flags:** `GET /api/v1/flags` snapshot at startup (non-blocking, cached last-known) +
  refresh on foreground. Gate risky surfaces (`mobile.apply_enabled`,
  `mobile.manage_enabled`) so a bad release can be neutered server-side without an app
  store cycle.

## 7. Testing & CI

- **Unit:** repositories against canned JSON fixtures **generated from CONTRACTS.md
  examples** (drift between doc and fixtures is the alarm bell); schedule/timezone
  helpers; error mapping.
- **Widget:** apply form validation, inbox rendering states (loading/empty/error/data),
  auth-gate redirects — Riverpod overrides make these cheap.
- **Integration (`integration_test`):** one happy path — launch → browse → open detail →
  start apply (mock SSO) — run on iOS simulator + Android emulator before release.
- **Golden tests:** listing card + detail header only (high-churn visuals); don't
  golden-test everything.
- **CI (later):** `flutter analyze` + `flutter test` on every PR
  touching `/mobile`; store builds stay manual/laptop (`flutter build ipa/appbundle`)
  until release cadence justifies Fastlane.

## 8. Release & store compliance

- **Sequencing:** iOS first (TestFlight → App Store), Android closed testing right behind
  (founder sources the 12+ testers per PRD).
- **Store checklists:** Sign in with Apple present ✅ (guideline 4.8); **in-app account
  deletion** ✅ (5.1.1(v)); privacy nutrition labels / Play Data Safety declare: identity
  (name/email via SSO), user content (application text), coarse analytics — no tracking,
  no ads, no third-party data sale; camera/photos permission only when provider photo
  upload ships.
- **Versioning:** `major.minor.patch+build`; the API is additive within `/api/v1`, so old
  app builds keep working — enum-string tolerance (§3 CONTRACTS: unknown enum values must
  render gracefully, not crash) is what makes that true.
- **Kill switch:** `mobile.force_upgrade` flag (a server-side rule over the client's
  `?build=` context — CONTRACTS §8) → forced-upgrade screen, so a truly broken old build
  can be retired without waiting on store review.

## 9. Accessibility & polish

Semantics labels on pins/cards/actions; dynamic type respected (no fixed-height text
containers); WCAG-AA contrast on both themes; 44 pt touch targets; reduced-motion respect
for hero/map animations. Accessibility is a product differentiator here (accessibility
filters are first-class), so the app itself must not be the irony.
