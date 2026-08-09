# Cleanup and hardening backlog

Verified against the dirty worktree on 2026-08-09. This review excludes Admin and mobile.
No `.env` file was read.

The active web/API stack is well tested, but it still has important risks around browser
privacy, photo integrity, notification delivery, application expiry, agreement records,
refresh-token rotation, search growth, and production configuration.

## Owner decisions — 2026-08-09

- Private server data, identity profile/email, home location, and unfinished private drafts will
  live in memory only, not `localStorage` or `sessionStorage`. A reload may discard an unfinished
  draft. Non-sensitive presentation preferences may still use durable browser storage.
- Delete `Steeple.Web.v1`; keep only a short migration/history note and Git history.
- Atlas is the canonical village presentation. Retire the diorama style and its selection flag;
  keep the flat/world-off path as the performance, accessibility, and deep-link fallback.
- Keep the payment system behind the existing `payments.enabled` feature flag. It stays off in
  Production while the only gateway is mock; retain the mock adapter and UI for Development.
- Retention defaults are accepted: refresh tokens 30 days after expiry/revocation, notifications
  12 months, idempotency records 30 days, correspondence 2 years after closure, and legal
  acceptances indefinitely after account anonymization. Delivered or terminally failed
  notification-outbox rows are retained for 30 days.
- Production should require email, real geocoding, object storage, the SEO base URL, strong
  database credentials, and at least one SSO provider. Turnstile may remain explicitly disabled
  during pre-release and becomes a general-release launch gate.
- Sign in with Apple is a required production provider, not an optional future experiment.

## Priority findings

### High — Remove private correspondence from `localStorage`

The web client serializes applications, intent text, messages, bookings, occurrences,
availability, and host state into a permanent key for each user. Signing out switches to the
anonymous namespace and clears the in-memory copy, but leaves the previous user's key on disk.
There is no TTL or retention sweep.

In plain language: logging out closes the private notebook but leaves it in an unlocked drawer.
A later browser user or malicious same-origin script can still read it.

Evidence:

- [`store.js`](../../src/Steeple.Web.v2/src/data/store.js) describes and implements the
  `steeple-village-store:{userId}` mirror.
- `load()` and `save()` persist the whole store with `localStorage`.
- The session-change handler drops only the in-memory reference and deliberately leaves other
  users' keys untouched.
- [`session.js`](../../src/Steeple.Web.v2/src/data/session.js) signs out without deleting the
  user's store namespace.

Action:

- Keep all server-derived records, identity profile/email, home location, and unfinished private
  drafts in module memory only.
- Do not move correspondence or drafts to `sessionStorage`: it remains readable by page scripts and
  is unnecessary when reload recovery is not a product requirement.
- Permit `localStorage` only for non-sensitive presentation preferences, never identity/profile
  data, location, correspondence, booking data, or free text.
- Keep the refresh credential in its HTTP-only cookie and the access token in memory. Replace the
  stored user profile used for cross-tab coordination with `BroadcastChannel` or an opaque event;
  after reload, let the refresh cookie ask the API who is signed in.
- Delete every existing `steeple-village-store:*` key during migration and on sign-out.
- Add browser tests proving reload/sign-out cannot recover private data from browser storage.

### High — Give every photo independent storage objects

Object keys contain only the room ID and content hash. Uploading identical content twice creates
two database rows pointing at the same variants. Deleting either row commits the database deletion
and then removes those shared objects, breaking the remaining row.

In plain language: Steeple issues two library cards for one book. Throwing away either card also
throws away the shared book.

Other integrity gaps:

- A database failure after object upload leaves orphaned objects.
- A partially failed multi-variant upload can leave the variants that finished first.
- Concurrent first uploads can both choose `IsPrimary = true` and `SortOrder = 0`.
- The database has no unique storage-key or sort-order constraint and no partial constraint limiting
  a room to one primary photo.

Evidence:

- [`MediaService.cs`](../../src/Steeple.Api/Services/Media/MediaService.cs) builds keys as
  `rooms/{roomId}/{contentHash}`, uploads before saving, and deletes every variant for a row's key.
- [`RoomPhotoConfiguration.cs`](../../src/Steeple.Persistence/Configurations/RoomPhotoConfiguration.cs)
  defines only a non-unique `(RoomId, SortOrder)` index.

Action:

- Include the photo UUID in every object key. Do not rely on accidental content deduplication.
- Delete successfully written objects when later upload or database work fails.
- Serialize or retry photo ordering under concurrency.
- Add database constraints for unique room sort order and one primary photo per room.
- Add concurrent duplicate-upload, partial-upload-failure, and database-failure tests.

### Medium — Make email and push delivery durable

The dispatcher commits inbox rows, starts email and push tasks, and discards the tasks without
awaiting them. The email gateway is transient/scoped through dependency injection even though the
dispatcher comment says it is safe to outlive the request. Scope disposal, process termination, or
provider failure can lose delivery without retry.

In plain language: Steeple asks someone to deliver a letter, does not wait for confirmation, and
may turn the building off while they are still leaving.

Evidence:

- [`NotificationDispatcher.cs`](../../src/Steeple.Api/Services/Notifications/NotificationDispatcher.cs)
  assigns both channel sends to `_ = ...` after writing inbox rows.
- [`ServiceCollectionExtensions.cs`](../../src/Steeple.Api/Extensions/ServiceCollectionExtensions.cs)
  registers the email gateway as a transient typed client.

Action:

- Write an outbox record in the same transaction as the domain event or notification row.
- Deliver from a background worker with bounded retries, backoff, and observable terminal failure.
- Await channel delivery after the inbox commit only as an interim fix.
- Test process loss and provider failure.

### Medium — Apply expiry consistently

Application inbox reads understand effective status and lazily persist expiry. Venue calendars and
competing-demand calculations instead select stored `Pending` and `NeedsInfo` rows without checking
`ExpiresAtUtc`. An expired application can therefore stay on a calendar or influence a conflict
warning until another read path happens to sweep it.

In plain language: an expired reservation remains written on the whiteboard, so people still plan
around it.

Evidence:

- [`ApplicationService.cs`](../../src/Steeple.Api/Services/Applications/ApplicationService.cs)
  contains the lazy expiry sweep.
- [`EfAvailabilityRepository.cs`](../../src/Steeple.Api/Proxies/Availability/EfAvailabilityRepository.cs)
  loads calendar applications without an expiry predicate.
- [`EfApplicationRepository.cs`](../../src/Steeple.Api/Proxies/Applications/EfApplicationRepository.cs)
  does the same for competing demand.

Action:

- Pass `now` into both repository methods and filter on effective status, or replace distributed
  lazy expiry with a background transition.
- Add calendar and conflict tests with stored-pending rows whose deadline has passed.

### Medium — Never report an unsaved agreement as accepted

Agreement versions are limited to 50 characters in PostgreSQL, but the request/service checks only
that the version is non-empty. The repository catches every `DbUpdateException` and assumes it was
the harmless race where another request inserted the same agreement first. Oversized versions and
unrelated database failures can therefore return success without preserving the legal record.

In plain language: the filing cabinet rejects a form, but Steeple throws away the error and tells
the person it was filed.

Evidence:

- [`AcceptAgreementRequest.cs`](../../src/Steeple.Api/Contracts/Identity/AcceptAgreementRequest.cs)
  has no length validation.
- [`IdentityService.cs`](../../src/Steeple.Api/Services/Identity/IdentityService.cs) trims the version
  but does not enforce its maximum length.
- [`EfIdentityRepository.cs`](../../src/Steeple.Api/Proxies/Identity/EfIdentityRepository.cs) catches
  every `DbUpdateException`.
- [`UserAgreementConfiguration.cs`](../../src/Steeple.Persistence/Configurations/UserAgreementConfiguration.cs)
  limits versions to 50 characters.

Action:

- Validate the 50-character limit at the contract/service boundary.
- Suppress only PostgreSQL `23505` for
  `IX_user_agreements_UserId_DocType_Version`; let every other failure surface.
- Add oversized-version and unrelated-database-failure tests.

### Medium — Return refresh successors only after commit

When two tabs refresh simultaneously, the first caller publishes its candidate access/refresh pair
to the grace cache before the database rotation begins. A second caller can receive that pair
immediately. If the database write later loses or throws, credentials have escaped without a live
successor row. Releasing the cache entry cannot retract a response already returned.

Anyone possessing the predecessor during the 30-second grace window can also obtain the successor.
The server cannot tell an honest second tab from a thief holding the same credential.

In plain language: the ticket office gives out a replacement ticket before recording it. If the
recording fails, the customer holds a ticket the system does not recognize.

Evidence:

- [`IdentityService.cs`](../../src/Steeple.Api/Services/Identity/IdentityService.cs) calls
  `Claim(...)` before `TryReplaceRefreshTokenAsync(...)` and lets non-owning callers return early.
- [`MemoryRefreshRotationGrace.cs`](../../src/Steeple.Api/Proxies/Identity/MemoryRefreshRotationGrace.cs)
  stores the raw successor response for the grace period.

Action:

- Cache one in-flight rotation task per predecessor and make concurrent callers await its committed
  result.
- Ensure failure completes every waiter with failure and removes the entry.
- Document and monitor the remaining theft-detection window.
- Add conditional-write-failure and exception-during-rotation tests.

### Medium — Bound time-filtered discovery

Ordinary search paginates in SQL. Time-filtered search loads every SQL-prefiltered candidate with
its venue and photos, loads availability data for the entire candidate set, evaluates it in memory,
and paginates only afterwards. This is manageable at beachhead scale but grows without a hard limit.

In plain language: instead of asking the library for ten relevant books, Steeple carries every
possible book to the desk and then chooses ten.

Evidence:

- [`ListingService.cs`](../../src/Steeple.Api/Services/ListingService.cs) uses `SearchAllAsync` for
  `when` searches and applies `Skip`/`Take` after availability filtering.
- [`RoomRepository.cs`](../../src/Steeple.Api/Proxies/RoomRepository.cs) materializes the full
  prefiltered room/venue/photo graph.
- [`AvailabilityService.cs`](../../src/Steeple.Api/Services/Availability/AvailabilityService.cs)
  batches availability reads and calculations across the complete candidate set.

Related defects:

- `(page - 1) * pageSize` is unchecked. A sufficiently large page can wrap negative and cause a
  server error.
- Slug lookup applies `LOWER()` to indexed database columns instead of comparing canonical lowercase
  slugs directly, reducing index usefulness.
- Published suburbs omit the discovery geofence. Normal venue writes already enforce the boundary,
  so this is mainly a defense-in-depth inconsistency if data drifts or is imported directly.

Action:

- Put a hard bound on candidates evaluated per anonymous request.
- Move availability into queryable/materialized data before inventory outgrows the beachhead.
- Cap page values or calculate offsets with checked wider arithmetic.
- Compare canonical slugs directly and apply geofence bounds to suburbs.
- Add scale, extreme-page, query-plan, and out-of-geofence-data tests.

### Medium — Validate Production configuration centrally

Compose starts the applications in Production while retaining `steeple_dev_pw` as the database
fallback. Missing Turnstile configuration permits every verification, missing email configuration
silently becomes no-send, and incomplete geocoding or media credentials select development
adapters. JWT signing keys and mock payments already have targeted fail-closed checks; absent SSO
client IDs disable login rather than weakening token verification.

In plain language: the shop can open while some alarms, suppliers, and storage systems silently
remain in practice mode.

Other configuration hygiene gaps:

- `.gitignore` ignores `.env` but not every `.env.*` file.
- `.dockerignore` misses `.env.*`, `.secrets.env`, local media, captured mail, and test runs.
- Base images use moving tags such as `postgres:18-alpine`, `node:24-alpine`, and `nginx:alpine`
  instead of tested patches or digests.

Evidence:

- [`docker-compose.yml`](../../docker-compose.yml)
- [`.gitignore`](../../.gitignore)
- [`.dockerignore`](../../.dockerignore)
- [`Program.cs`](../../src/Steeple.Api/Program.cs)
- [`ServiceCollectionExtensions.cs`](../../src/Steeple.Api/Extensions/ServiceCollectionExtensions.cs)

Action:

- Add one Production startup validator with explicit enabled/disabled modes for each external
  capability.
- Require a deployment database password and complete credentials for enabled services.
- Expand ignore rules and pin container patches or digests.
- Add startup tests for every supported Production configuration.

#### What Turnstile is

Cloudflare Turnstile is a bot check similar to CAPTCHA, usually without asking the person to solve a
puzzle. The browser gets a short-lived proof from Cloudflare and sends it with sign-in or an
application; the API verifies that proof before doing the expensive or abuse-sensitive work. It
complements rate limits and SSO because attackers can create many accounts or spread requests over
many IP addresses.

Owner decision: Turnstile may remain disabled while Steeple is pre-release. Treat that as an
explicit mode rather than silently inferring it from a missing secret. Before general release,
enable both the browser site key and API secret and verify sign-in/application flows fail closed
when Cloudflare rejects or cannot verify a token. Local Development remains exempt.

### Medium — Activate and require Sign in with Apple

The Apple implementation already exists end to end: the browser loads Apple's SDK and returns an ID
token, while the API validates that token against Apple's keys and configured audience. The button
is deliberately hidden unless the web build receives both `VITE_APPLE_CLIENT_ID` and
`VITE_APPLE_REDIRECT_URI`. Compose supplies those from `APPLE_SERVICES_ID` and
`APPLE_REDIRECT_URI`, and supplies the same Services ID to the API audience allowlist.

Only Google being visible therefore means the deployed web build did not receive one or both Apple
values, or the Apple Developer configuration does not match them. The exact missing deployment
value was not inspected because `.env` files must not be read without owner approval.

Evidence:

- [`providers.js`](../../src/Steeple.Web.v2/src/data/providers.js) hides Apple unless both build-time
  values exist and implements the popup flow.
- [`sso.js`](../../src/Steeple.Web.v2/src/ui/guest/sso.js) renders the Apple button when configured.
- [`AppleIdTokenVerifier.cs`](../../src/Steeple.Api/Proxies/Identity/AppleIdTokenVerifier.cs) verifies
  Apple tokens server-side.
- [`docker-compose.yml`](../../docker-compose.yml) maps the Apple Services ID and redirect URI into
  both sides.
- [`nginx.conf`](../../src/Steeple.Web.v2/nginx.conf) already permits the required Apple script,
  popup, and form origins.

Action:

- Create or verify the Apple Services ID, website domain, and exact HTTPS return URL in Apple
  Developer.
- Supply `APPLE_SERVICES_ID` and `APPLE_REDIRECT_URI` to the production build and redeploy the web
  image; ensure the API receives the same Services ID as an accepted audience.
- Make Production startup/build validation fail when Apple is required but either side is missing.
- Add a production-smoke assertion that both Google and Apple buttons are visible.
- Complete a real first-time Apple sign-in test, including Apple's once-only name response, private
  relay email, agreement gate, refresh, sign-out, and repeat sign-in.

### Low/medium — Limit bulk notification updates

`POST /me/notifications/read` accepts an unrestricted UUID list and forwards it to EF. Npgsql is
likely to send the values as an array parameter rather than expand a giant SQL text `IN` list, but
deserialization, allocation, transfer, and database work remain controlled by the caller.

In plain language: a form intended for one page of notification IDs allows someone to submit a
truckload.

Evidence:

- [`NotificationsController.cs`](../../src/Steeple.Api/Controllers/Notifications/NotificationsController.cs)
- [`NotificationDto.cs`](../../src/Steeple.Api/Contracts/Notifications/NotificationDto.cs)
- [`EfNotificationRepository.cs`](../../src/Steeple.Api/Proxies/Notifications/EfNotificationRepository.cs)

Action:

- Cap the collection at 100 IDs, matching the maximum inbox page.
- Apply a small request-body limit and return a clear validation error.
- Add maximum-size and oversized-input tests.

### Low — Clear the npm advisory

`npm audit --omit=dev` reports one high advisory in transitive `nanoid@3.3.16` through
Vite/PostCSS. Vite runs in the container build stage, and the final nginx image contains only static
output. The application does not call the affected generator directly, so practical runtime
exposure is low.

In plain language: a workshop tool has been recalled, but the tool is not shipped inside the
finished product.

Evidence:

- [`package-lock.json`](../../src/Steeple.Web.v2/package-lock.json) resolves `nanoid@3.3.16`.
- [`Dockerfile`](../../src/Steeple.Web.v2/Dockerfile) copies only built assets into the final image.

Action:

- Update the lockfile to a fixed dependency version.
- Add a production audit command to the normal quality gate.

## Simplification and deletion opportunities

### Delete `Steeple.Web.v1`

The deprecated application contains about 14,360 lines of obsolete web, authentication, CSS, and
deployment code. It is excluded from the solution and Compose, but still pollutes searches and can
encourage reuse of retired patterns.

Owner decision: delete the implementation. Keep a short migration/history note, update canonical
instructions and live documentation, and rely on Git history for the retired source.

### Split the web data store

`store.js` is about 1,461 lines combining durable correspondence caching, domain mapping, schedule
calculations, drafts, host state, and development fixtures. Removing private durable caching should
shrink it first; then separate drafts, mapping, schedules, host state, and fixture data.

In plain language: it is a junk drawer containing letters, calendars, tools, and spare keys.

### Split the host listing interface

`host/listing.js` is about 2,108 lines, while guest and host CSS total about 5,451 lines. Markup,
state, and global CSS are coupled across a large surface. Split the interface by workflow/panel and
give styles explicit ownership through cascade layers or local scoping.

In plain language: the whole house is wired through one poorly labelled switchboard.

### Reduce `ApplicationService`

`ApplicationService` is about 1,447 lines spanning authorization, validation, expiry, transitions,
conflicts, notifications, analytics, persistence coordination, and DTO mapping. Extract pure
transition rules, schedule validation, effective-expiry policy, notification composition, and
presentation mapping within the same deployable module.

In plain language: one employee is doing reception, accounting, security, and deliveries.

### Centralize wire contracts

Status, frequency, activity, amenity, accessibility, notification, day, and feature-flag tokens are
manually repeated across C#, JavaScript, Dart, and fixtures. Generate client models/types from
OpenAPI where practical, or maintain one authoritative token schema with golden contract tests.

In plain language: three people keep copying the same answer sheet by hand, so eventually the
copies will disagree.

### Make Atlas canonical and retire visual experiments

Owner decision: Atlas is the canonical village presentation. Remove the diorama staging module,
style-specific branches, `?style=diorama`, and tests/docs whose only purpose is comparing the two.
Keep world-off/flat boot because it is a functional performance, accessibility, and deep-link path,
not a competing art direction. Review other alternate map, desk, and correspondence renderers
separately rather than treating “Atlas” as a decision about unrelated product surfaces.

### Keep payments behind `payments.enabled`

Owner decision: retain the payment domain and Development mock flow behind the existing public
`payments.enabled` flag. Base/Production configuration keeps the flag off, Development keeps it on,
and startup continues to reject `payments.enabled=true` in Production while the gateway is mock.

Audit every payment entry point so the flag consistently hides UI and disables new payment setup,
gating, price snapshots, charging, and sweeping. Bookings created while payments are off remain
offline and uncharged as the current contract specifies. Add flag-on/flag-off contract tests so the
mock flow cannot leak into Production.

### Define data-retention policies

Refresh tokens, notifications, messages, and idempotency records have no cleanup worker or shared
retention policy. The idempotency changelog explicitly makes its rows permanent pending a future
sweep.

Owner-approved defaults:

- Delete refresh-token rows 30 days after expiry or revocation.
- Delete notifications after 12 months.
- Delete idempotency records after 30 days.
- Delete private correspondence 2 years after the application or booking closes.
- Keep legal agreement acceptances indefinitely after account anonymization.

Implement scheduled deletion in bounded batches, document how financial records interact with the
correspondence rule, and add tests for each disposable class.

In plain language: decide when each filing cabinet should be emptied instead of keeping everything
forever.

### Add web static-quality gates

The web package has five tests but no standard lint, static type check, coverage threshold,
accessibility regression gate, or audit script. Add ESLint, JSDoc-backed TypeScript checking, an
explicit audit command, and focused accessibility checks without requiring an immediate TypeScript
rewrite.

In plain language: tests are useful, but the project also needs spellcheck, grammar checking, and a
safety inspection for code.

### Separate current documentation from history

Superseded decisions and v1 references remain easy to confuse with current contracts. Mark replaced
decisions mechanically, remove retired endpoint references where they no longer teach anything,
and keep historical rationale distinct from current requirements.

In plain language: label the old maps so nobody follows a road that has closed.

## Verification baseline

- API unit tests: 495 passed.
- Integration tests: 115 passed.
- Web `npm test`: passed.
- NuGet vulnerability scan: no known vulnerable packages.
- npm production audit: one high advisory with low apparent runtime exposure.

The green suite does not currently exercise browser-data retention, duplicate/concurrent photo
operations, notification process loss, expiry on calendar/conflict paths, agreement persistence
failure, refresh-rotation failure, Production configuration combinations, or oversized bulk input.
