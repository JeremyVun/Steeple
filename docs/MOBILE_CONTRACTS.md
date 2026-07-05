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
- **`RoomSummary.matchedWindow`** *(additive — availability plan commit 6)*:
  `MatchedWindow? {date?, startTime, endTime}`, present only when the search carried a
  When filter — the free window that satisfied it. `ListingCard` renders it as an accent
  line ("Free 6:00–9:00 PM", plus "· Sep 8" when `date` is set).

## 6. Session & auth (`core/auth/`)

```dart
sealed class SessionState {}
class SessionUnknown extends SessionState {}                 // restoring from storage
class SignedOut extends SessionState { final bool wasForced; }
class SignedIn extends SessionState { final UserProfile user; }

abstract class SessionManager {
  ValueListenable<SessionState> get state;      // exposed as sessionProvider
  Future<void> restore();                       // storage → state at bootstrap (resolves SessionUnknown)
  Future<SignInResult> signIn(SsoProvider provider);   // native sheet → POST /auth/sessions
  Future<void> signOut();                       // hooks (device unregister) → revoke → wipe storage
  Future<void> forceSignOut();                  // token_reuse/401 path — no network calls
  Future<String?> validAccessToken();           // used by the auth interceptor only
  Future<bool> refreshAfter401();               // single-flight; failure forces sign-out
  void addSignOutHandler(Future<void> Function() handler); // runs during signOut while still authed
}
```

Rules: tokens only in `flutter_secure_storage`; refresh is single-flight (concurrent 401s
await one refresh); `forceSignOut` emits `SignedOut(wasForced: true)` → router redirects
+ one snackbar ("You've been signed out"). The apply draft **survives** sign-in (§8 —
draft lives in a provider keyed outside the auth state).

## 7. Router contract (`app/router.dart`)

`StatefulShellRoute` with 4 tabs. Route **names are the contract** — features navigate by
name (`context.goNamed(RouteNames.listing, pathParameters: …)`), never by literal path.
`RouteNames` + the deep-link sanitizer live in `core/navigation/route_names.dart` so
features can import them without touching `app/router.dart` (§2 dependency contract).

| Name | Path | Tab | Auth | Notes |
|---|---|---|---|---|
| `explore` | `/explore` | Explore | – | Map+list; filters open as bottom sheet (not a route) |
| `listing` | `/space/:venueSlug/:roomSlug` | Explore | – | Universal-link target; 404 → "no longer available" view |
| `apply` | `/space/:venueSlug/:roomSlug/apply` | Explore | – entry, **SSO gate at submit** | Gate = sign-in sheet over the form; draft preserved |
| `inbox` | `/inbox` | Inbox | ✔ | Notifications list |
| `applicationThread` | `/inbox/applications/:id` | Inbox | ✔ | Push deep-link target; thread + status + actions |
| `bookings` | `/bookings` | Bookings | ✔ | |
| `bookingDetail` | `/bookings/:id` | Bookings | ✔ | Occurrences, cancel, renewal nudge, star rating |
| `profile` | `/profile` | Profile | – | Signed-out: sign-in CTA + legal links; signed-in: account, agreements, delete |
| `signIn` | `/signin` | (modal) | – | Query `from` = post-auth redirect |
| `forceUpgrade` | `/upgrade` | (blocking) | – | Unskippable when `mobile.force_upgrade` is on |
| `manage` | `/manage` | (pushed, root navigator) | ✔ | Provider dashboard (Phase 5); entry point is the "Your spaces" section on `profile`, behind `mobile.manage_enabled` |
| `manageRequest` | `/manage/requests/:id` | (pushed, root navigator) | ✔ | Approve/decline one application |
| `manageRoom` | `/manage/rooms/:id` | (pushed, root navigator) | ✔ | Basic room edit + publish-state actions; "Hours & blackouts" tile → `manageRoomHours` |
| `manageRoomHours` | `/manage/rooms/:id/hours` | (pushed, root navigator) | ✔ | Open-hours (7 days Sunday-first) + blackout editor; one replace-all `PUT` (`saveOpenHours`) with local pre-validation (≤6 windows/day, end>start, no intra-day overlap) |
| `manageCalendar` | `/manage/calendar` | (pushed, root navigator) | ✔ | Agenda-first venue calendar (CONTRACTS §6); venue selector when >1 managed venue, a 7-day week strip over a day-grouped agenda (confirmed = solid/sage, pending = dashed/warning → `manageRequest`), prev/next week nav. Entry point: calendar action on the `manage` home AppBar. Fetches exactly the visible week (`calendar` from..+6d) |

Redirect logic (in order): `forceUpgrade` flag → `/upgrade`; guarded route while
`SignedOut` → `/signin?from=…`; while `SessionUnknown` → hold on splash (must resolve
under the cold-start budget). Unknown/out-of-area deep links → `/explore` (never an
error screen). `manage*` routes are guarded the same way `inbox`/`bookings` are (path
prefix match in the redirect) — they're not a fifth tab, just a top-level route pushed
off `profile`.

`listing`/`apply` `extra` *(availability plan commit 6)*: an optional `WhenFilter?`
(`core/models/search_query.dart`) — the search's When filter, passed as router `extra`
from a `ListingCard` tap through `listing` and forwarded unchanged to `apply`, which
one-shot-seeds `ApplicationDraft.schedule` from it (never overwrites a draft already in
progress).

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
  // SearchQuery gained the When filter fields *(availability plan commit 6)*:
  // date, daysOfWeek, timeOfDay, startTime, endTime, durationMinutes — built from
  // SearchFilters.when (a WhenFilter; see search_query.dart). Fixture-backed
  // FakeDiscoveryRepository narrows to a deterministic subset and stamps
  // matchedWindow when a When filter is present, so the filter sheet and
  // result cards are exercisable offline.
  Future<List<String>> suburbs();                                               // GET /suburbs
  Future<GeofenceContext> geofence();                                           // GET /geofence
}
// features/listing/data
abstract class ListingRepository {
  Future<RoomDetail> bySlug(String venueSlug, String roomSlug);  // GET /listings/by-slug/…
  Future<RoomDetail> byId(String id);                            // GET /listings/{id}
  Future<VenueReviewPage> reviews(String venueId, {int page = 1, int pageSize = 10}); // GET /venues/{id}/ratings
  Future<RoomAvailability> availability(String roomId, {required String from, required String to}); // GET /listings/{id}/availability?from&to
  Future<ScheduleCheckResult> checkSchedule(String roomId, ProposedSchedule schedule); // POST /listings/{id}/availability/check
}
// RoomDetail additionally carries `openHours: List<DayOpenHours>?` (additive; null for
// legacy rooms). Guest availability shapes live in core/models/availability.dart:
// RoomAvailability{roomId,timezone,from,to,days:[AvailabilityDay{date,isBlackout,
// freeWindows:[OpenWindow]}]} and ScheduleCheckResult{available,totalOccurrences,
// conflicts:[ScheduleConflict{date,reason}]} — the latter is also the `409
// schedule_unavailable` problem body (surfaced via `AppError.problem`, the raw
// ProblemDetails map). Dates `yyyy-MM-dd`, times `HH:mm`, weekday tokens sunday..saturday.
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
  Future<MeResponse> me();                                               // GET /me (profile + agreements)
  Future<void> acceptAgreement(String docType, String version);          // POST /me/agreements
  Future<void> deleteAccount();                                          // DELETE /me
}
// features/manage/data (provider self-service, Phase 5)
abstract class ManageRepository {
  Future<List<ManagedVenue>> venues();                                   // GET /manage/venues
  Future<ManagedVenueDetail> venue(String id);                           // GET /manage/venues/{id}
  Future<ManagedRoom> room(String id);                                   // GET /manage/rooms/{id}
  Future<ManagedRoom> saveRoom(String id, ManagedRoomPatch patch);       // PATCH /manage/rooms/{id}
  Future<RoomAvailabilityRules> openHours(String roomId);                // GET /manage/rooms/{id}/availability
  Future<RoomAvailabilityRules> saveOpenHours(String roomId, RoomAvailabilityRules rules); // PUT (replace-all)
  Future<Paged<Application>> applications({String? status, int page = 1}); // GET /manage/applications
  Future<VenueCalendar> calendar(String venueId, {required String from, required String to}); // GET /manage/venues/{id}/calendar?from&to (≤92d)
  Future<Application> decide(String id, {required bool approve, String? message}); // POST /applications/{id}/decision
}
// Application (manager detail read only) additionally carries `conflicts:
// ApplicationConflicts?` (additive; null on lists/organizer reads/decided apps):
// {totalOccurrences, conflicts:[ScheduleConflict{date,reason}], pendingOverlaps:
// [PendingOverlap{applicationId,organizerName,overlappingDateCount}]}. `checkResult`
// adapts it to the shared ScheduleCheckResult the §8.13 verdict card renders.
// VenueCalendar (core/models/venue_calendar.dart) = {venueId, timezone, from, to,
// rooms:[CalendarRoomRef{id,name}], occurrences:[CalendarOccurrence{bookingId,roomId,
// organizerName,localDate,startTime,endTime,status}], pending:[CalendarPending{
// applicationId,roomId,organizerName,startTime,endTime,dates:[]}]} — venue-local
// wall-clock (dates yyyy-MM-dd, times HH:mm; never DateTime). Screen-local family
// notifier `manageCalendarProvider((venueId,from))` fetches the visible week only.
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
| core | `envProvider`, `dioProvider`, `apiClientProvider`, `sessionProvider`, `sessionManagerProvider`, `flagsProvider`, `analyticsProvider`, `connectivityProvider`/`isOnlineProvider`, `pushServiceProvider` | Session is `SessionState`; flags is snapshot map; repos inject `ApiClient` |
| discovery | `searchFiltersProvider` | `Notifier<SearchFilters>` — the one filter state; `SearchFilters.when` is a `WhenFilter` (date XOR daysOfWeek + timeOfDay band/custom range — additive, availability plan commit 6) |
| | `searchResultsProvider` | `AsyncNotifier<ListingSearchResult>`; debounces 350ms, cancels in-flight, caches last result (stale-while-revalidate) |
| listing | `listingDetailProvider(slugPair)` | family `AsyncNotifier<RoomDetail>`; in-memory cache for back-nav |
| | `roomAvailabilityProvider(roomId)` | family `AsyncNotifier<RoomAvailability>`; fetches today..+`availabilityWindowDays` (42) once, kept alive; feeds both the detail "When it's open" strip and the apply calendar |
| apply | `applyDraftProvider(roomId)` | family `Notifier<ApplicationDraft>` — survives the SSO gate; cleared on submit success |
| inbox | `inboxProvider` | cursor-paged `AsyncNotifier`; `refresh()` on foreground/push |
| | `unreadCountProvider` | drives the tab badge |
| bookings | `myBookingsProvider`, `bookingDetailProvider(id)` | `AsyncNotifier` families |
| profile | `meProvider` | `AsyncNotifier<UserProfile>` |
| manage | `manageRepositoryProvider`, `manageVenuesProvider` | `manageVenuesProvider` is `AsyncNotifier<List<ManagedVenue>>` — public because `profile`'s "Your spaces" section watches it (behind `mobile.manage_enabled`) to decide whether to show the entry point at all. Screen-local family notifiers (requests list, one request, one venue's rooms, one room, one room's hours, one venue's calendar week) live under `features/manage/application/` and aren't public |

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
// Availability primitives (DESIGN_SYSTEM §8.10/§8.13) — shared by the listing detail
// "When it's open" strip and the apply calendar:
AvailabilityLegend()                                           // mandatory 4-state legend
AvailabilityVerdictCard({required ScheduleCheckResult result, bool hardBlock,
    List<PendingOverlap> pendingOverlaps, void Function(String applicationId)? onTapOverlap})
    // §8.13 card; pendingOverlaps adds the host-review "K other pending requests overlap"
    // section (CONTRACTS §6) — each row taps through to that request via onTapOverlap
// + availability_day_state.dart: enum DayState; deriveDayState({date, day, openWindows, today});
//   dayStateVisual(DayState, SteepleColors) → {background, foreground, dot, cross};
//   openWindowsForDate(openHours, date); dayStateSemantics(state, freeWindows).
// The month grid itself is AvailabilityCalendar (apply-only, in
// features/apply/presentation/availability_calendar.dart — hand-rolled, no calendar pkg).
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

**Maps capability (`core/maps/maps_capability.dart`).** `mapsAvailableProvider`
(`FutureProvider<bool>`) answers "was the native Google Maps SDK given an API key?"
via the `app.steeple/maps` platform channel (method `hasApiKey`; handled in
`AppDelegate.swift` / `MainActivity.kt`). The iOS SDK **aborts the process** if a map
view is created key-less, so any widget that mounts a `GoogleMap` must gate on this
provider and render a placeholder when it is false; channel errors count as false.

## 11. Fixtures & fakes (how mobile builds against 🔲 endpoints)

- `test/fixtures/<name>.json` — copied **verbatim from CONTRACTS.md examples** (fixture
  names: `listing_search.json`, `room_detail.json`, `auth_session.json`,
  `application.json`, `booking.json`, `notifications_page.json`, `flags.json`,
  `managed_venues.json`, `managed_venue_detail.json`, `managed_room.json`,
  `manage_applications_page.json`, `room_open_hours.json`, `availability.json`,
  `conflict_check.json`, `host_calendar.json`). `manage_applications_page.json`'s pending
  item carries the additive host-review `conflicts` block (CONTRACTS §6); `host_calendar.json`
  (2 rooms, 6 confirmed occurrences + 2 pending overlays over a Sunday-anchored week) backs
  `FakeManageRepository.calendar`, which **re-dates** it so the fixture's first day lands on
  the requested `from` (same trick as `FakeListingRepository.availability`), so the agenda
  reads as "live" this week whatever the calendar date. `FixtureLoader.loadList` covers array-rooted
  fixtures (`managed_venues.json`'s `[{id, name, slug}]`). `FakeListingRepository.availability`
  re-dates `availability.json` to start at the requested `from` so the fake reads as "live"
  regardless of the calendar date (states/order preserved); `checkSchedule` serves
  `conflict_check.json`. `listing_search.json`'s first item carries a `matchedWindow`
  (additive — availability plan commit 6) so the round-trip test and `ListingCard`'s
  accent-line rendering are both exercised; `FakeDiscoveryRepository.search` stamps
  `matchedWindow` on a deterministic subset whenever the query carries a When filter.
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
