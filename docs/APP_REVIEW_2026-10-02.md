# Steeple app review 2 October 2026

Initial review completed against `ef2650993745fad74bed092c3f8995797c3c65c6`; remediation and repeated review are in progress in `codex/app-review-fixes`. The findings below preserve the original evidence. Remediation checkpoints at the end record subsequent code changes and verification. No deployment is included.

## Jeremy's brief verbatim

> Review the steeple app for bugs, gaps, issues, inconsistencies, usability issues, performance problems etc.

Follow-up on 2 October 2026:

> fix everything you find and keep reviewing until you don't find anymore issues. If an issue needs a clarification from me with re to product, let me know

## Fix and review work

Status: implementation in progress. Preserve the findings below as the original evidence; record fixes and review results here.

Plan: fix availability and notification transaction correctness; repair web session, HTTP and catalogue recovery; repair native session/paging behavior and review-query scaling; preserve quoted commitments; implement the approved visual fixes with Astra; run regression and adversarial review passes until the exercised scope produces no new actionable findings. Passing a finite review is not proof of an issue-free application.

Owner decisions on 2 October 2026: “Yes, assign Astra these fixes”; “Keep instant booking preselected”; support address “jvun@steepleapp.co”; “Require review and resubmission” for legacy unquoted requests; “Start with contextual support email”. No product decision is currently pending. No production deployment is included in this fix pass.

## Review plan

1. Read the current contracts, release gates, and previous UX findings.
2. Run existing checks and inspect discovery, identity, booking, host management, and mobile integration paths.
3. Reproduce suspected defects with focused probes or real interactions against isolated fixtures.
4. Report prioritized findings with code evidence, reproduction steps, and verification limits. Separate known launch gates from newly confirmed bugs.

## Priority and evidence

P1 means fix before widening the pilot. P2 means a reproducible defect or material usability gap to address next. Source-only risks are identified explicitly; they are not measured production incidents. This is an expert review with isolated fixtures, not a user study or a complete security audit.

## Confirmed correctness and reliability findings

### 1 P1 A saved request can permanently lose its host notification

The application is committed before the notification dispatcher saves the inbox/outbox. If that second operation fails, the caller gets an error although the request exists. Retrying with the same idempotency key returns the saved application immediately, without repairing the missing notification. A host who relies on email or the notification inbox can miss the request entirely. Approval and cancellation have similar post-commit notification boundaries.

**Reproduced:** inject a dispatcher failure into a manual submission. The application remains stored. Restore the dispatcher and replay the same key: success returns, but there are still zero notification calls that succeeded. This was a service-level fault-injection test; the real repository's separate `SaveChangesAsync` confirms the persistence boundary.

**Change:** commit the business transition and a durable notification intent atomically, or persist recoverable pending delivery work with the transition. Provider delivery can still occur later through the existing worker. Catching the error alone would conceal the loss.

Source: [application persistence and notification](../src/Steeple.Api/Services/Applications/ApplicationService.cs), lines 163–183; [idempotency replay](../src/Steeple.Api/Services/Applications/ApplicationService.cs), lines 75–80; [repository commit](../src/Steeple.Api/Proxies/Applications/EfApplicationRepository.cs), lines 33–38.

### 2 P1 Closing every day makes the availability check say any time is available

Saving an empty weekly schedule and no blackouts removes all rule rows. The availability service then treats the room as a legacy room without declared rules and skips classification. The calendar correctly contains no free windows, but checking a proposed time returns `available: true`. The same exemption feeds submission validation. It also skips existing-booking checks for rooms without rules; the database exclusion constraint still prevents overlapping confirmations.

**Reproduced:** start with a published room open Sunday 09:00–17:00, save empty rules, then read its calendar and check Sunday 10:00–12:00. The calendar is empty while the check succeeds. A second probe confirmed that a no-rules room with an existing occurrence also reports that occurrence's time available.

The API allows this update; mobile's hours save passes the rule set through. The web listing wizard separately requires some hours, so this is not a claim that its normal publish flow permits an empty schedule. The contract's legacy exemption and its “omitted weekday = closed” rule need a consistent representation.

**Change:** distinguish explicitly closed schedules from unconfigured legacy availability. Always account for reserved occurrences. Add a round-trip test that closing all days actually prevents booking.

Source: [classification early return](../src/Steeple.Api/Services/Availability/AvailabilityService.cs), lines 190–204; [replace-all rules](../src/Steeple.Api/Proxies/Availability/EfAvailabilityRepository.cs), lines 111–144; [mobile save](../mobile/lib/features/manage/application/manage_hours_providers.dart), lines 23–26.

### 3 P1 A late guest cancellation advertises a slot that remains reserved

Guest cancellation within 48 hours changes the booking to `Cancelled` while leaving its imminent occurrence `Scheduled`, as required by the cancellation policy. Availability queries require both a scheduled occurrence and a confirmed parent booking. They consequently discard the still-reserved slot. Date search, the public calendar/check, and the host calendar can disagree with the reservation constraint.

**Reproduced against PostgreSQL:** cancel a guest's booking 27 hours before its start. The occurrence remains scheduled, yet the public calendar expands to the full 09:00–17:00 window and checking the held 10:00–12:00 slot returns available. This is false availability; the database overlap constraint remains intact.

**Change:** derive occupancy from the occurrence's effective reservation state, including occurrences retained by the cancellation notice policy. Test the public and host calendar paths after late cancellation.

Source: [cancellation policy](../src/Steeple.Api/Services/Bookings/BookingService.cs), lines 260–278; [availability filters](../src/Steeple.Api/Proxies/Availability/EfAvailabilityRepository.cs), lines 40–47, 68–75 and 86–95.

### 4 P2 Temporary refresh errors sign the person out

The web session code treats every HTTP error from token refresh as a refused cookie. A 429, 502 or 503 therefore has the same effect as invalid credentials. On an active session this also broadcasts expiry to sibling tabs. Recovery in that tab is suppressed until a new sign-in or reload.

**Reproduced:** sign in, expire the access token, return each of 429/502/503 during refresh. Every case clears signed-in state; restoring healthy responses and calling `fetchCurrentUser()` makes no new refresh request.

**Change:** expire identity only for definitive authentication rejection. Preserve the session for transient HTTP errors and honor rate-limit backoff. The existing outage handling only protects errors with no HTTP status.

Source: [refresh error handling](../src/Steeple.Web.v2/src/data/session.js), lines 200–205.

### 5 P2 Catalogue invalidation keeps removed rooms and stale sitemap entries

`forgetVenues()` clears room-detail and assembly caches, but keeps both the venue roster and the cached sitemap. Venue assembly merges rooms into the old roster and never removes a room that now answers 404. Editing/unpublishing can therefore leave an old room displayed as published. Newly published room discovery through the sitemap also remains stale for that page session.

**Reproduced:** read a venue containing one published hall, change the fixture to an empty sitemap and a 404 listing, call `forgetVenues()`, and read the venue again. The sitemap was fetched only once, and the held venue still contains the hall with status `published`.

**Change:** invalidate all dependent caches and reconcile the venue's room membership against authoritative results. Prevent an older in-flight read from restoring invalidated data.

Source: [invalidation](../src/Steeple.Web.v2/src/data/catalog.js), lines 481–486; [sitemap cache](../src/Steeple.Web.v2/src/data/catalog.js), lines 638–647. The edit event invokes this invalidation in [map integration](../src/Steeple.Web.v2/src/ui/map/index.js), lines 237–244.

### 6 P2 Read and write timeouts stop protecting the request once headers arrive

Both ordinary HTTP helpers clear their abort timer immediately after `fetch()` returns response headers. Body decoding happens afterwards. If a proxy/server delivers headers and then stalls the JSON body, a read or booking write can stay pending indefinitely despite the documented four/fifteen-second limits. Caller cancellation is also detached before read-body consumption finishes.

**Reproduced:** return HTTP 200 with a stalled response stream. With the deadlines accelerated to 10 ms, both helpers remain pending after 50 ms and their signals are not aborted. Releasing the body completes them. This isolates timer ownership rather than measuring network performance.

**Change:** retain the deadline and caller cancellation through body consumption, and preserve the distinction between a timed-out write and a write known not to have reached the server.

Source: [read cleanup](../src/Steeple.Web.v2/src/data/api.js), lines 137–149; [write cleanup](../src/Steeple.Web.v2/src/data/api.js), lines 185–195.

### 7 P2 Adjacent open windows are advertised as one interval but rejected when booked across

Hosts may save touching windows such as 09:00–12:00 and 12:00–17:00. The public calendar merges them into 09:00–17:00. The schedule checker instead requires the request to fit within one original window, rejecting 11:00–13:00 as outside open hours. Availability search uses the merged intervals too, so a guest can discover a seemingly valid space before being blocked.

**Reproduced:** the calendar returned one 09:00–17:00 interval; a check for 11:00–13:00 returned `outsideOpenHours`.

**Change:** either normalize touching windows consistently or preserve their boundary everywhere and explain the restriction. The calendar and submission must agree.

Source: [free-window merging and classification](../src/Steeple.Api/Services/Availability/AvailabilityCalculator.cs), lines 58–59 and 80–84.

### 8 P2 A request can be submitted for a time that has already finished today

Submission validation compares calendar dates but not the proposed instants with the current venue time. The availability check likewise validates the date only. This permits requests for an already elapsed event and allows the instant-confirmation path to reach the same schedule without a future-time guard.

**Reproduced:** at 16:00 in the venue's New York timezone, a manual request for 09:00–10:00 that same day was accepted. The probe established submission acceptance; it did not assert an actual charge or completed-booking reputation change.

**Change:** validate the relevant materialized start instant at commitment, including approvals delayed past the requested start. Decide explicitly how a recurring request whose first date has passed should be handled.

Source: [date-only submission guard](../src/Steeple.Api/Services/Applications/ApplicationService.cs), lines 98–106; [schedule checker validation](../src/Steeple.Api/Services/Availability/AvailabilityService.cs), `ValidateSchedule`.

### 9 P2 The discovery Retry button cannot retry during the catalogue cooldown

One unavailable catalogue read starts a shared 30-second quiet window. The visible Retry action calls the same cached-failure path, so it cannot detect a recovered API until that window expires. Because the cooldown is shared, a failed auxiliary catalogue call can also suppress unrelated reads.

**Reproduced:** fail search with 503, restore a healthy response, and retry immediately. The second call rejects without a network request.

**Change:** allow explicit user retries to bypass outage suppression, while respecting a real server `Retry-After` for rate limits. Alternatively show when retry becomes available and make that state truthful.

Source: [catalogue cooldown](../src/Steeple.Web.v2/src/data/catalog.js), lines 70–93; [Retry wiring](../src/Steeple.Web.v2/src/ui/map/index.js), lines 31–34.

## Source-confirmed capacity and mobile gaps

### 10 P2 Discovery silently stops at the first page

The web catalogue requests at most 100 rooms, and the search UI discards `totalCount`, forwarding only the returned items to the map and list. There is no next-page path. Beyond 100 matching rooms, spaces disappear unless a narrower query happens to include them; panning filters the held page rather than fetching missing rooms. This is already documented as unbuilt in the harness guidance, but remains a real product limit. Mobile similarly constructs its default page-1 query with page size 24 and has no paging method on `SearchResultsNotifier`.

**Change:** add viewport queries or explicit paging and show an honest partial-result count. This is code-confirmed; a >100-room real-browser dataset was not exercised here.

Source: [web page size](../src/Steeple.Web.v2/src/data/catalog.js), lines 573–578; [total discarded](../src/Steeple.Web.v2/src/ui/map/search.js), lines 168–174; [mobile query](../mobile/lib/features/discovery/application/search_providers.dart), `toQuery` and `SearchResultsNotifier`.

### 11 P2 Review pagination still loads the entire review history and booking graphs

The public reviews repository materializes every matching review plus each booking's occurrences and ratings. Only afterwards does `RatingService` filter visibility and apply `Skip/Take`. Rating summaries used in ordinary discovery also load full booking graphs. A ten-review response therefore does not bound database work or application memory; recurring bookings multiply the rows involved.

**Change:** move visibility predicates, counts and pagination into SQL/projections, and aggregate summaries without hydrating full booking graphs. This is a confirmed scaling characteristic, not a measured production latency incident. Prioritize it as real history grows.

Source: [review repository](../src/Steeple.Api/Proxies/Ratings/EfRatingRepository.cs), lines 82–102 and `GetVisibleAggregateCandidatesAsync`; [in-memory pagination](../src/Steeple.Api/Services/Ratings/RatingService.cs), lines 259–279.

### 12 P2 Mobile refresh does not protect against an account change while the request is in flight

The mobile session manager writes a refresh response directly into memory and secure storage without checking whether sign-out or another sign-in happened since the request began. A delayed response for account A can overwrite the token pair after account B signs in; a delayed 401 can call `forceSignOut()` against the replacement session. The web session already uses a generation check for this class of race.

**Change:** capture and verify an identity generation on refresh/sign-in/restore, and invalidate outstanding work on sign-out. Add controlled delayed-response tests. This is source analysis; no Flutter runtime was available on PATH or the checked common install paths, so it remains unverified on device.

Source: [mobile refresh and persistence](../mobile/lib/core/auth/api_session_manager.dart), lines 145–165 and 175–188.

## Existing issues that remain open

These were already identified in the [1 October UX review](UX_REVIEW_2026-10-01.md). They should not disappear behind the new composer work.

- **P1 Quote preservation:** a manual request does not snapshot the price the guest accepted. Confirmation multiplies the room's current hourly rate by the requested duration. A host price edit while a request is pending can change the confirmed amount without renewed guest acceptance. See [BookingService](../src/Steeple.Api/Services/Bookings/BookingService.cs), lines 91–95. The new form's accurate estimate does not fix this later change.
- **Host booking mode:** new venues default to instant booking without a choice in the listing wizard. The existing desk control comes later. Expose the consequence before publication; changing the default itself is a product decision.
- **Support and disputed outcomes:** there is no complete booking issue-resolution flow or exposed correction path for unilateral no-show reports. A monitored support route is the immediate pilot requirement.
- **Commitment records and practical information:** house rules remain mutable listing text, and real pilot listings need complete access, setup/cleanup, rules and direct-payment instructions. Offline confirmation emails still omit essential payment arrangements.
- **Release gates:** real provider authentication, delivered email, real inventory, approved legal/support details, recovery drills and deployment remain governed by [the MVP release runbook](runbooks/mvp-release.md). Native Turnstile/provider/push/deep-link/store gates and live guest payment collection remain separate.

Current production could not be reverified: the web reader could not access the public origin, and direct read-only requests for flags, listings and readiness returned HTTP 403. This does not establish an app outage. The previous review's deployed-state observations are historical, not fresh evidence for this review.

## Visual review by Astra

The approved guest composer is working well in the reviewed states. Astra ran the unchanged complete composer suite: **56 checks passed, all 22 geometry captures passed, and zero axe violations**. It inspected representative initial, recurring, completed, sign-in, calendar, long-rules and error states. The old tiny-calendar and missing-date-control findings should not be repeated as current defects.

### 13 P2 Accessibility filters become unreachable on a small phone

At **320×568**, open Browse and press Filters. The popover extends from y=132 to y=606; “Lift access” falls below the usable viewport. A real wheel scroll does not move either the panel or the document. The popover has no viewport height limit or internal scrolling, while the app prevents document scrolling. Selecting a filter also pushes “Clear all” farther down.

**Change:** constrain the panel to available height and make its contents scrollable. Verify small phones, landscape and a reduced viewport with the keyboard open.

Source: [popover styles](../src/Steeple.Web.v2/src/styles/map.css), line 547; [root scrolling](../src/Steeple.Web.v2/src/styles/main.css), line 48. [Evidence](/private/tmp/steeple-app-review-captures-web-rIrSFC/filters-320x568.png).

### 14 P2 Mobile hosts must scroll past plans and messages to assess the schedule and approve

At **390×844**, Desk → Requests → a pending playgroup request initially shows plans, organiser and message composer, but no authoritative schedule or decision controls. Even with zero messages, actions start at **y=1185.58**. The desktop columns stack with the full prose/thread column preceding the decision column; longer plans and conversations worsen the distance. This persists from the previous review.

**Change:** place a compact event, schedule and commitment summary near the top, with decisions reachable after reviewing it. Retain the full plans and correspondence below.

Source: [host letter structure](../src/Steeple.Web.v2/src/ui/host/letter.js), lines 62–74; [mobile host layout](../src/Steeple.Web.v2/src/styles/host.css), lines 3083 and 3113. [Initial evidence](/private/tmp/steeple-app-review-captures-web-rIrSFC/host-letter-390.png), [scrolled evidence](/private/tmp/steeple-app-review-captures-web-rIrSFC/host-letter-deep-390.png).

### 15 P2 Host schedule labels overlap on mobile

The host request's eight 8am–10pm axis labels run together across roughly 180px of usable chart width at **390×844**; Astra measured four overlapping neighbouring pairs. The exact requested interval is readable above the chart, but comparing it with open hours is harder than it should be. Tick spacing is chosen from time span without considering rendered width.

**Change:** adapt tick density to available width while keeping exact selected times in text.

Source: [tick generation](../src/Steeple.Web.v2/src/ui/host/ribbon.js), lines 66–77; [axis labels](../src/Steeple.Web.v2/src/styles/host.css), lines 1046–1060. [Evidence](/private/tmp/steeple-app-review-captures-web-rIrSFC/host-letter-deep-390.png).

### 16 P2 Shared mobile controls fall below the product's touch-target standard

At **390×844**, interactive filter chips are 29px high, header actions 27px, map buttons 30×30, sheet handles 20–22px, room Back 25px and the primary room CTA 41px. The project standard is 44×44 and the revised composer meets it, leaving an inconsistency across one booking journey. This is a product-standard finding, not a blanket claim that every sub-44px control violates WCAG.

**Change:** enlarge the actual hit areas and spacing in shared navigation, filters, map controls and property sheets.

Sources: [shared controls](../src/Steeple.Web.v2/src/styles/main.css), lines 363, 1589 and 1723; [map controls](../src/Steeple.Web.v2/src/styles/map.css), lines 128 and 1209; [property sheets](../src/Steeple.Web.v2/src/styles/panels.css), line 1001 onward. [Measurements](/private/tmp/steeple-app-review-captures-web-dR8c8z/measurements.json).

### 17 P3 Host entry gives no host-specific explanation before sign-in

Cold `/desk` or Host a space opens generic account sign-in over browsing. A new host gets no explanation of booking control, payment arrangement or support before the identity request, then goes directly to venue entry after signing in. This persists from the previous review.

**Change:** provide concise host-specific context using current supported facts. Production provider availability was not assessed using Development-only identity controls.

Source: [host entry](../src/Steeple.Web.v2/src/ui/host/index.js), lines 401–418. [Evidence](/private/tmp/steeple-app-review-captures-web-dR8c8z/host-signin-390.png).

Full [Astra report](/private/tmp/steeple-app-review-web-YfVNHH/visual-review.md) includes reproduction details and capture limitations. Four representative images were opened in Preview. All visual API responses were fixtures; external photos and map tiles were deliberately blocked and their absence is not a finding. This was headless Chromium in light mode with reduced motion, not real-device or screen-reader validation. All owned servers and browsers stopped on completion.

## Verification record and limits

- `dotnet test Steeple.slnx --verbosity minimal --nologo`: **610 unit tests and 166 PostgreSQL integration tests passed**, including booking integrity and the long-running notification stream tests.
- `npm test`, `npm run lint`, and `npm run typecheck` in the web project: **passed**.
- Isolated real-keyboard/pointer composer run: **32 behavior checks passed**, covering recurrence totals, validation, availability failure/retry, stale responses, sign-in draft retention, manual/instant outcomes, same-key retry, mock payment continuation and keyboard calendar selection. API responses were deterministic intercepted fixtures. Visual assertions and screenshot capture were removed from the lead's copy; Astra owns visual verification.
- Focused reproductions: **5 service probes, 1 real-PostgreSQL cancellation probe, and 7 web module probes confirmed the observed defects**. These assertions deliberately record the defective behavior; their passing is not a product health claim.
- Production web build passed with environment-file loading disabled. Gzip outputs: UI JS **131.69 kB**, entry JS **23.54 kB**, CSS **31.73 kB** combined. Deferred world/journey/engine/Three chunks are separate. These are artifact sizes, not mobile network or frame-rate measurements.
- Rerunnable web probes: `node tools/app-review-data-probes.mjs`. They use synthetic fetch responses and do not call production or read environment files.
- Astra's full composer run: `/private/tmp/steeple-composer-a-visual-web-W794go/` contains checks, geometry, axe results and screenshots. Additional visual evidence is in `/private/tmp/steeple-app-review-captures-web-dR8c8z/` and `/private/tmp/steeple-app-review-captures-web-rIrSFC/`.
- API probe sources and the behavioral harness were isolated in `/private/tmp/steeple-app-review-web-YfVNHH` at the reviewed commit. Behavior results: `/private/tmp/steeple-review-behavior-web-bqlGFp/checks.json`.
- Mobile received a targeted code/contract review; Flutter analysis, native device interaction, real SSO, live email/payment delivery, production recovery and load testing were not performed.

At the initial review checkpoint only review documentation and reproduction tooling had changed. The authorized remediation below changes product code in an isolated worktree; production settings and deployment remain untouched.

Owner clarification: "Require review and resubmission" for pending requests with no saved quote; "Start with contextual support email" using jvun@steepleapp.co.

Remediation checkpoint: availability configuration persists explicit closure (migration025); all availability reads honor scheduled occurrences after late cancellation; touching windows are contiguous; submission/counter/confirmation reject elapsed sessions and invalid DST durations. Focused checks passed195 service tests and13 PostgreSQL tests before the final DST regression additions. Temporary Flutter SDK checkout: /private/tmp/steeple-review-flutter-sdk-a5lIke/flutter (official3.41.1 tag).

Remediation checkpoint2: Astra committed visual fixes13–17 and explicit instant/manual setup
(instant preselected), plus a one-off counter-offer date input defect: commits4446609/5753fba.
59 real-input checks and56 composer checks passed;36 visual captures and22 composer geometry
captures, zero axe issues. Evidence /private/tmp/steeple-review-visual-fixes-web-qMSTy2 and
/private/tmp/steeple-composer-a-visual-web-q3sBwx. Lead has not inspected pixels.

Terra web recovery commit8f180b0 covers4,5,6,9,10web; independent Sol review found remaining
Retry wiring, stale profile failure and transport normalization bugs. Lead fixed those, expanded
recovery coverage to12 data checks and3 production-behavior browser flows; all passed. The old
Playtest suites are archived webv1 (playtest/README.md) and are not current validation.

Atomic transaction checkpoint:619 unit tests passed;33 focused database tests and the added
renewal/first-charge recovery cases passed. Mutation+notification faults roll back together;
charges/refunds/analytics defer until commit. Further full regression is pending.

Owner approved additional Astra assignment verbatim: "Yes, assign Astra this remaining UI work"
for saved price/rules display, legacy request resubmission guidance, contextual support email,
and web/mobile visual verification. Dispatch once a build-agent slot is free and wire contracts
are concrete. Flutter runtime ready at /private/tmp/steeple-review-flutter-sdk-a5lIke/flutter,
official3.41.5/Dart3.11.3. Mobile recovery and rating scalability parcels are currently independent.

Remediation checkpoint3: mobile recovery and paging completed with122 Flutter tests and clean
analysis. Rating reveal filtering, summaries and review pagination now execute in SQL;14 unit
and2 PostgreSQL rating tests passed. Astra's approved remaining UI assignment is dispatched,
alongside Terra's quote contract implementation. Both consume `quote:{pricePerHour,currency,
houseRules}` on submissions, applications and bookings. Old unquoted requests remain unquoted
and must be withdrawn and reviewed again; no inferred historical prices or rules.

### Follow-up failure and concurrency review

New `BookingPaymentRecoveryTests` reproduce five unresolved failures against real PostgreSQL:

- A stale host cancellation overwrites the guest's already committed cancellation attribution.
- Concurrent stale booking reads both send the supposedly once-only renewal nudge.
- The recovery query includes a missed first charge, but `ChargePlanner` still skips it outside
  the normal48-hour window; an actual service sweep creates no charge.
- A failed-charge notification persistence error leaves the payment Failed, so its first-failure
  notice is permanently lost rather than retried from the Pending claim.
- A refund notification persistence error leaves Refunded committed, so the notice is lost.

The next fix parcel must serialize booking/occurrence transitions, recover cleanly on stale
reads, and commit payment outcomes with their notices after the external gateway returns.
Provider calls must remain outside database transactions. Reminder claim and recipient fan-out
also need an atomic-failure check because the current exception path can leave partial notices.

All eight new PostgreSQL recovery tests failed as expected at the isolated7ea20ed snapshot in
/private/tmp/steeple-review-races-api-7l5e6q. The additional confirmed cases are stale no-show
reports reversing who was reported, late guest cancellation skipping collection for a session
that still stands, and reminder failures leaving partial inbox notices.

Independent Sol review found three further identity races: a native write acquired its identity
generation after asynchronous token lookup and could replay an old draft as a new account;
automatic web refresh recovery retained a definitively refused profile; delayed web sign-in
could overwrite sign-out or a newer sign-in. Lead fixed the generation/refusal boundaries and
expanded the web recovery suite to16 passing checks. Native targeted verification is pending.
No additional actionable findings were returned for the reviewed availability/time, paging,
or SQL rating projection/reveal changes.

Companion deployment migration worktree: /private/tmp/steeple-review-infra-web-Pxttwv,
branch codex/steeple-review-migrations, base ec180b3. Only the Steeple migration bundle is in
scope; no deployment or production connection. Migration025 prepared;026 will follow the
completed contract parcel. Infrastructure main was clean at fork.

### Final remediation verification

All 17 original findings are implemented. The follow-up passes also fixed saved quote/rules
commitments, legacy resubmission, contextual support, stale cancellation/no-show attribution,
missed first-charge recovery, payment/refund notification rollback, reminder fan-out rollback,
and browser/native identity races. Jeremy's product choices are preserved: instant booking is
preselected, legacy unquoted requests require review/resubmission, and booking support uses
jvun@steepleapp.co. No product clarification remains open.

Astra completed approved web/mobile terms/support work in458d24b. The independent quote
review's mobile null-quote and fixture omissions were resolved by that parcel. Final Astra
checks:61 composer assertions,24 composer captures with zero axe/runtime errors;26 terms
assertions and15 captures across320/390/1440 widths; iPhone integration with five reviewed
captures. Evidence remains under /private/tmp/steeple-booking-terms-web-mszKaI,
/private/tmp/steeple-composer-a-visual-web-cyo5fs and
/private/tmp/steeple-quote-native-ios-66aWfJ. The lead did not inspect pixels.

The second concurrency review found four further reproducible cases: a failed replacement
sign-in could leave a superseded cookie; superseded native storage writes could survive a
replacement failure; one payment concurrency rollback detached later batch rows; and a stale
Pending retry repeated the first-failure notice. Fixes revoke rejected sign-in cookies while
holding the mutation lock, publish native credentials/state in the storage queue, repair stale
storage writes to the last published identity, reacquire each payment after tracker rollback,
and account for prior failures during recovery. These are now regression cases.

Backend gates: **634 API unit tests and 191 integration tests passed** after the final payment
fixes, including booking integrity, migration readiness and the five-minute SSE test.
Native storage was then moved to one atomic secure record, with a separate nonsecret logout
marker; forced logout survives keychain failure and restart. Legacy token/profile identity
checks, error-response fences and failed browser login fan-out now have regressions.
Final native validation is in progress. Web npm tests,
lint, typecheck and production build pass;17 data recovery,3 browser recovery and 34 real-cookie
checks pass. Real Development API session tests passed39 checks, including concurrent two-tab
and four-request refreshes. The exact-cookie suite exercises Web Locks and same-tab fallback;
cross-tab ordering requires Web Locks. No identity is written to browser storage.

Deployment migration parity passes for23 SQL files. Liquibase4.31 applied all26 production
changesets to a fresh disposable PostgreSQL18 database; a second update applied zero changes.
Required schema readiness now rejects missing025/026 columns. Companion infra commit1992f86
contains025/026; no deployment or production connection occurred.

Remaining release validation is external: actual Google/Apple/Turnstile, delivered email,
live payment collection, Android device testing, production recovery/load and pilot operations.
Contextual mail links and fallback addresses were verified; actual email-app delivery was not.
Payments remain mock machinery until the separate release gates are met. Archived Playtest
webv1 journeys were not treated as current regression coverage.

Real API quote smoke passed: a new request sent its reviewed terms, the host edited the room,
and approval still returned the original saved rate/rules and duration-adjusted amount.
Infra migration commit1992f86 is fast-forwarded to its clean local main; nothing was deployed.
