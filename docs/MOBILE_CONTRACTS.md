# Steeple Mobile — Internal Contracts (the scaffolding)

> **Status:** Adopted 2026-07-04. `CONTRACTS.md` owns every **wire** shape; this doc owns
> the **in-app seams of `/mobile`** — the Dart interfaces, providers, routes, and shared
> widgets that let independent agents build features against stable contracts without
> reading each other's code. The vertical-skeleton prototype (ROADMAP Phase 4 kickoff)
> implements everything in §3–§10 first; feature work then fills in behind these seams.
>
> **Change rule:** changing any interface/route/provider named here = update this doc +
> every implementation **in the same PR**. Additive members are free. If code and this doc
> disagree, one of them is fixed in the same PR — never left diverged. Wire changes still
> follow `CONTRACTS.md` §1.

## 1. Non-negotiables (inherited)

- Feature-first layout, `presentation → application → data`, cross-feature access only
  via a feature's public `providers.dart` (MOBILE_DESIGN §3).
- All styling via design-system tokens (`docs/DESIGN_SYSTEM.md` §11) — no raw values.
- All wire models mirror `CONTRACTS.md`; unknown JSON fields ignored; unknown enum values
  never crash (§5 below is the mechanism).
- Performance budgets (MOBILE_DESIGN §4) are acceptance criteria, not aspirations.

## 2. Dependency contract

```
features/X/presentation  → may import: features/X/{application,providers}, core/widgets, app/theme
features/X/application   → may import: features/X/data, core/* (services), other features' providers.dart ONLY
features/X/data          → may import: core/api, core/models
core/*                   → may import: core/*, app/ (config only) — never features/
```

Review rule (enforced in PR): grep for `import '../../features/` from another feature —
anything not ending in `/providers.dart` is a defect.

## 3. Environment & bootstrap

```dart
// app/env_config.dart
enum SteepleEnv { dev, prod }

class EnvConfig {
  final SteepleEnv env;            // --dart-define=STEEPLE_ENV
  final Uri apiBaseUrl;            // dev: http://localhost:5200 (Android emu: 10.0.2.2)
  final String? sentryDsn;         // null in dev → Sentry off
  final bool useFakes;             // --dart-define=STEEPLE_FAKES=true → fake repos (§10)
  final String canonicalWebHost;   // for universal-link parsing, e.g. steeple.example
}
```

Bootstrap order (budgeted — MOBILE_DESIGN §4): parse env → `runApp` inside
`ProviderScope(overrides: [envProvider, if (useFakes) ...fakeRepositoryOverrides])` →
**after first frame:** session restore, flags snapshot, Sentry, analytics start, deep-link
initial-link handling. FCM permission is never requested at launch (contextual ask only).

## 4. HTTP & error model (`core/api/`)

**Interceptor order on the one shared `Dio`:** (1) base URL/headers from `EnvConfig` →
(2) auth: attach access token; on 401, single-flight refresh, queue and retry each queued
request once → (3) retry: idempotent GETs only, max 2, exponential backoff + jitter,
never on POST → (4) logging (dev builds only, bodies redacted).

Every repository method throws only `AppError` (dio exceptions never escape `core/api`):

```dart
// core/api/app_error.dart
enum AppErrorKind { network, timeout, server, auth, validation, notFound, conflict, rateLimited, cancelled }

class AppError implements Exception {
  final AppErrorKind kind;
  final String? code;        // ProblemDetails `code` verbatim (e.g. "slot_taken")
  final String? detail;      // ProblemDetails `detail` — for logs, NOT for display
  final Duration? retryAfter;
  final bool retryable;      // drives ErrorView's retry button
}
```

Mapping (exhaustive — anything unlisted → `server`, retryable):

| Condition | kind | retryable | Notes |
|---|---|---|---|
| Connect/socket failure | `network` | yes | Offline banner may also show |
| Send/receive timeout | `timeout` | yes | |
| Dio `cancel` (CancelToken) | `cancelled` | — | Swallowed by controllers, never rendered |
| 400/422 + ProblemDetails | `validation` | no | `code` kept (`turnstile_failed` → re-run Turnstile once, then surface) |
| 401 after refresh attempt | `auth` | no | `token_reuse` or refresh failure → `SessionManager.forceSignOut()` |
| 403 | `auth` | no | |
| 404 | `notFound` | no | Unpublished/out-of-geofence listings land here — render "no longer available", not an error |
| 409 | `conflict` | no | `slot_taken` gets a bespoke apply-flow screen, not generic ErrorView |
| 429 | `rateLimited` | after `retryAfter` | |
| 5xx | `server` | yes | |

## 5. Wire models (`core/models/` + feature `data/`)

- freezed + json_serializable, `fromJson` only for responses; field names/nullability
  exactly as CONTRACTS.md. One Dart class per named wire shape, same name
  (`RoomSummary`, `RoomDetail`, `ListingSearchResult`, `Application`, `Booking`, …).
- **Single-value wire enums** (statuses, `provider`, `venueType`, notification `type`):
  Dart enum with a trailing `unknown` member; parse via a shared
  `T parseWireEnum<T>(String raw, Map<String,T> tokens, T unknown)`. Models that display
  the value also keep the raw string (e.g. `statusRaw`) so `unknown` can render its
  humanized token (DESIGN_SYSTEM §8.4 last row).
- **Flags-style enum lists** (`activities`, `accessibility`, `amenities`): modeled as
  `List<String>` of raw wire tokens end-to-end; typed helpers
  (`bool acceptsChildren`) and a shared token→label humanizer live in `core/models/wire_tokens.dart`
  (token registry: CONTRACTS.md §2). Unknown tokens flow through and humanize
  (`camelCase` → "Camel case") — forward-compatible by construction.
- **Paged responses:** `Paged<T> { items, totalCount, page, pageSize }` generic;
  inbox uses `CursorPage<T> { items, nextCursor? }`.
- **Schedules:** `ProposedSchedule` keeps dates as `String` (`yyyy-MM-dd`) and times as
  `String` (`HH:mm`) — they are venue-local wall-clock, **never** parsed into `DateTime`
  (SYSTEM_DESIGN §5 timezone rule). Only `…Utc` fields become `DateTime` (UTC).

## 6. Session & auth (`core/auth/`)

```dart
sealed class SessionState {}
class SessionUnknown extends SessionState {}                 // restoring from storage
class SignedOut extends SessionState { final bool wasForced; }
class SignedIn extends SessionState { final UserProfile user; }

abstract class SessionManager {
  ValueListenable<SessionState> get state;      // exposed as sessionProvider
  Future<SignInResult> signIn(SsoProvider provider);   // native sheet → POST /auth/sessions
  Future<void> signOut();                       // revoke + unregister device + wipe storage
  Future<void> forceSignOut();                  // token_reuse/401 path — no network calls
  Future<String?> validAccessToken();           // used by the auth interceptor only
}
```

Rules: tokens only in `flutter_secure_storage`; refresh is single-flight (concurrent 401s
await one refresh); `forceSignOut` emits `SignedOut(wasForced: true)` → router redirects
+ one snackbar ("You've been signed out"). The apply draft **survives** sign-in (§8 —
draft lives in a provider keyed outside the auth state).

## 7. Router contract (`app/router.dart`)

`StatefulShellRoute` with 4 tabs. Route **names are the contract** — features navigate by
name (`context.goNamed(RouteNames.listing, pathParameters: …)`), never by literal path.

| Name | Path | Tab | Auth | Notes |
|---|---|---|---|---|
| `explore` | `/explore` | Explore | – | Map+list; filters open as bottom sheet (not a route) |
| `listing` | `/space/:venueSlug/:roomSlug` | Explore | – | Universal-link target; 404 → "no longer available" view |
| `apply` | `/space/:venueSlug/:roomSlug/apply` | Explore | – entry, **SSO gate at submit** | Gate = sign-in sheet over the form; draft preserved |
| `inbox` | `/inbox` | Inbox | ✔ | Notifications list |
| `applicationThread` | `/inbox/applications/:id` | Inbox | ✔ | Push deep-link target; thread + status + actions |
| `bookings` | `/bookings` | Bookings | ✔ | |
| `bookingDetail` | `/bookings/:id` | Bookings | ✔ | Occurrences, cancel, renewal nudge |
| `profile` | `/profile` | Profile | – | Signed-out: sign-in CTA + legal links; signed-in: account, agreements, delete |
| `signIn` | `/signin` | (modal) | – | Query `from` = post-auth redirect |
| `forceUpgrade` | `/upgrade` | (blocking) | – | Unskippable when `mobile.force_upgrade` is on |

Redirect logic (in order): `forceUpgrade` flag → `/upgrade`; guarded route while
`SignedOut` → `/signin?from=…`; while `SessionUnknown` → hold on splash (must resolve
under the cold-start budget). Unknown/out-of-area deep links → `/explore` (never an
error screen).

**Deep-link registry** (universal links and FCM `deepLink` values — CONTRACTS §9): the
path-only forms of `listing`, `applicationThread`, `bookingDetail`, `inbox`. Anything
else falls back to `/explore`. `steeple://` is auth-callback only, never navigation.

## 8. Repository & provider contracts (per feature)

Repositories are the **only** place HTTP happens; constructor-injected `ApiClient`;
methods take `CancelToken?` where the UI can abandon (search). All return wire models.

```dart
// features/discovery/data
abstract class DiscoveryRepository {
  Future<ListingSearchResult> search(SearchQuery query, {CancelToken? cancel}); // GET /listings/search
  Future<List<String>> suburbs();                                               // GET /suburbs
  Future<GeofenceContext> geofence();                                           // GET /geofence
}
// features/listing/data
abstract class ListingRepository {
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug);  // GET /listings/by-slug/…
  Future<RoomDetail> byId(String id);                            // GET /listings/{id}
}
// features/apply/data + features/inbox/data
abstract class ApplicationsRepository {
  Future<Application> submit(String roomId, ApplicationDraft draft,
      {required String idempotencyKey, required String turnstileToken}); // POST /listings/{roomId}/applications
  Future<Paged<Application>> mine({String? status, int page = 1});       // GET /me/applications
  Future<Application> byId(String id);                                   // GET /applications/{id}
  Future<ApplicationMessage> sendMessage(String id, String body);        // POST /applications/{id}/messages
  Future<Application> withdraw(String id);                               // POST /applications/{id}/withdraw
}
// features/inbox/data
abstract class InboxRepository {
  Future<CursorPage<AppNotification>> list({String? after});             // GET /me/notifications
  Future<void> markRead(List<String> ids);                               // POST /me/notifications/read
}
// features/bookings/data
abstract class BookingsRepository {
  Future<Paged<Booking>> mine({int page = 1});                           // GET /me/bookings
  Future<Booking> byId(String id);                                       // GET /bookings/{id}
  Future<Booking> cancel(String id, {String? reason});                   // POST /bookings/{id}/cancel
  Future<void> markNoShow(String occurrenceId);                          // POST /occurrences/{id}/no-show
  Future<void> rate(String bookingId, {required int stars, String? comment}); // POST /bookings/{id}/ratings
}
// features/profile/data
abstract class ProfileRepository {
  Future<UserProfile> me();                                              // GET /me
  Future<void> acceptAgreement(String docType, String version);          // POST /me/agreements
  Future<void> deleteAccount();                                          // DELETE /me
}
// core/push
abstract class DevicesRepository {
  Future<void> register(String fcmToken, String platform);               // POST /me/devices
  Future<void> unregister(String fcmToken);                              // DELETE /me/devices/{token}
}
```

**Public provider surface** (each feature's `providers.dart` — the complete list another
feature/agent may touch; everything else is private):

| Feature | Exposes | Type / semantics |
|---|---|---|
| core | `envProvider`, `dioProvider`, `sessionProvider`, `flagsProvider`, `analyticsProvider`, `connectivityProvider` | Session is `SessionState`; flags is snapshot map |
| discovery | `searchFiltersProvider` | `Notifier<SearchFilters>` — the one filter state |
| | `searchResultsProvider` | `AsyncNotifier<ListingSearchResult>`; debounces 350ms, cancels in-flight, caches last result (stale-while-revalidate) |
| listing | `listingDetailProvider(slugPair)` | family `AsyncNotifier<RoomDetail>`; in-memory cache for back-nav |
| apply | `applyDraftProvider(roomId)` | family `Notifier<ApplicationDraft>` — survives the SSO gate; cleared on submit success |
| inbox | `inboxProvider` | cursor-paged `AsyncNotifier`; `refresh()` on foreground/push |
| | `unreadCountProvider` | drives the tab badge |
| bookings | `myBookingsProvider`, `bookingDetailProvider(id)` | `AsyncNotifier` families |
| profile | `meProvider` | `AsyncNotifier<UserProfile>` |

Conventions: screen state is always `AsyncValue<T>` rendered through `AsyncValueView`
(§9); widgets watch with `select()` for sub-fields; no provider outside `core` may be
watched by another feature unless listed above.

## 9. Shared UI contracts (`core/widgets/`) 

Implemented once, by the skeleton; specs in DESIGN_SYSTEM §8. Signatures:

```dart
AsyncValueView<T>(value: AsyncValue<T>, data: (T) => Widget,
    {Widget Function()? skeleton, void Function()? onRetry})   // error→ErrorView, loading→skeleton
ErrorView(error: AppError, {VoidCallback? onRetry})
EmptyState({required IconData icon, required String title, String? body, Widget? action})
StatusChip(statusRaw: String, domain: StatusDomain)            // DESIGN_SYSTEM §8.4 mapping
FreeBadge() / PriceBadge(price, currency)
ListingCard(summary: RoomSummary, {VoidCallback? onTap})       // the one card, list + map popup
SkeletonListingCard() / SkeletonList(itemCount)
OfflineBanner()                                                // listens connectivityProvider
```

Any feature rendering a status, an error, an empty result, or a listing summary uses
these — a feature-local variant is a review defect.

## 10. Analytics, flags, push (`core/`)

```dart
abstract class AnalyticsService {                 // impl: batcher per MOBILE_DESIGN §6
  void track(String name, [Map<String, Object?> props = const {}]);
  Future<void> flush();                           // called on AppLifecycleState.paused
}
// Client-emitted names (CONTRACTS §7 — server-authoritative events are NEVER sent here):
abstract final class AnalyticsEvents {
  static const mapInteracted = 'map_interacted';            // props: kind pan|zoom|pin
  static const applicationStarted = 'application_started';  // props: roomId
  static const ssoStarted = 'sso_started';                  // props: provider, surface:'mobile'
  static const notificationOpened = 'notification_opened';  // props: type, channel:'push'
}

abstract class FlagsService {                     // GET /api/v1/flags?platform=&build=
  bool isEnabled(String key, {bool orElse = false});  // sync, in-memory snapshot
  Future<void> refresh();                              // startup (non-blocking) + foreground
}
abstract final class FlagKeys {                   // registry — add here when a flag ships
  static const applyEnabled = 'mobile.apply_enabled';
  static const manageEnabled = 'mobile.manage_enabled';
  static const forceUpgrade = 'mobile.force_upgrade';  // server evaluates against ?build=
}

abstract class PushService {
  Future<void> requestPermissionInContext();      // after first application submitted
  Future<void> registerIfPermitted();             // token upsert → DevicesRepository
  Stream<String> get deepLinkTaps;                // router consumes; registry §7 applies
}
```

Flag semantics: last-known snapshot cached; a missing/failed fetch means `orElse` — a
flag read is **never** a network call (SYSTEM_DESIGN §11).

## 11. Fixtures & fakes (how mobile builds against 🔲 endpoints)

- `test/fixtures/<name>.json` — copied **verbatim from CONTRACTS.md examples** (fixture
  names: `listing_search.json`, `room_detail.json`, `auth_session.json`,
  `application.json`, `booking.json`, `notifications_page.json`, `flags.json`).
  One test per fixture asserts `fromJson` round-trips — this is the drift alarm
  (MOBILE_DESIGN §7); when CONTRACTS.md changes, the failing fixture test is the to-do list.
- Every repository has a `Fake*Repository` (in `features/X/data/fake/`) that serves
  fixture JSON **through the real `fromJson`** (never hand-built objects), with ~300ms
  simulated latency and a settable `AppError? nextError` for error-state work.
- `EnvConfig.useFakes` swaps all repository providers via one
  `fakeRepositoryOverrides` list in `app/bootstrap.dart`. This is how discovery/apply UI
  work proceeds while Identity/Applications endpoints are still 🔲 server-side, and how
  widget tests get cheap deterministic data. Fakes also power the `integration_test`
  happy path (mock SSO per MOBILE_DESIGN §7).

## 12. Definition of done — every `/mobile` PR

1. `flutter analyze` clean; `flutter test` green (fixture tests included).
2. New screens: widget tests for loading/empty/error/data via provider overrides.
3. All styling token-derived (DESIGN_SYSTEM §11 lint rule); shared widgets from §9 used.
4. Semantics labels on new interactive elements; dynamic-type spot check at 2.0.
5. Anything touching lists/maps/startup: profile run against MOBILE_DESIGN §4 budgets.
6. New wire shape consumed → fixture added + CONTRACTS.md legend checked (✅ vs 🔲).
7. New seam (interface, route, provider, flag, event) → this doc updated in the same PR.
