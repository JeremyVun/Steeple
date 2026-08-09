# Cleanup and hardening — build plan

> Executes `design.md` (same folder — **read it first**; its evidence links and the
> owner decisions of 2026-08-09 are binding). Scope spans web v2, API, Persistence,
> schema, infra, and docs. **Admin and mobile are out of scope** except P11 (wire-token
> golden tests touch mobile fixtures) and doc sweeps.
>
> **This is multiple sessions of work.** Each phase is sized for one focused session
> (or one wave of subagents); the app is shippable after every phase. Order within
> P1–P8 is the recommended order; hard dependencies are only: P9.1 needs P2,
> P7 needs P5, P10 is best after P4. Do not let any single agent approach the context
> ceiling — split build from verification agents on the heavy phases (P2, P3, P5, P9).
>
> ⚠ **Dirty worktree:** the checkout carries Jeremy's uncommitted rounds (inbox rework,
> ratings, instant-book, SEO). Never `git restore`/`checkout`/`stash`; re-read any
> shared file before editing; verify inherited test failures fail at your own baseline
> before claiming them pre-existing. **Committing is Jeremy's call** — default to
> leaving work uncommitted and reporting per phase unless he authorizes per-phase
> commits at session start.
>
> ⚠ **Never read `.env`** (cardinal rule; the design itself refused). Compose env
> questions are answered via `docker inspect` hash checks or by asking Jeremy.
>
> Schema discipline: new work = new changesets starting at **`019-*.sql`** (never edit
> an applied changeset), mirrored by hand into Persistence EF configs, column-for-column.

## Verification baseline (recorded in design.md, 2026-08-09)

API unit 495 · integration 115 · web `npm test` green · NuGet scan clean · one npm
production advisory (nanoid, P1 clears it). Web live-suite known-stale sets are
documented in each suite's header and CLAUDE.md — judge failures against those before
touching anything, and re-run a failing suite once with its header-documented flags
before diagnosing.

## [X] P0 — Orient (no edits)

1. Read `design.md` end to end, then the evidence files of whichever phase you are
   executing. Line references are 2026-08-09 hints; trust the file.
2. Record your own gate baseline (`dotnet test`, `npm test --prefix
   src/Steeple.Web.v2`) before any edit.
3. Confirm commit policy with Jeremy (see preamble).

**P0 findings (recorded 2026-08-09, orchestrator pass — trust these, spot-check cheap):**

- Solution file is `Steeple.slnx` (not `.sln`). Web.v1 is already absent from it and
  from `docker-compose.yml`.
- Background-worker idiom to copy: `src/Steeple.Api/Services/Reminders/BookingReminderWorker.cs`
  and `Services/Payments/PaymentSweeper.cs` (P5, P7 follow these).
- Next Liquibase changeset number: **019** (`db/changelog/` runs 001–018 + master yaml).
- Diorama surface: `src/world/stage-diorama.js` plus style branches in `world/index.js`
  (`state.style === 'diorama'`, line ~59), `world/backdrop.js`, `world/ambient.js`,
  `world/sky.js`, `journey/composition.js`; suites `world-test.mjs`, `guest-test.mjs`,
  `wave2-test.mjs`, `panel-input.mjs`; `?style=` documented in `core/intent.js` comments
  and CLAUDE.md's A/B list.
- The web's entire browser-storage surface is three files: `data/analytics.js`,
  `data/session.js`, `data/store.js` (P2 inventory starts and ends there).
- `payments.enabled` readers: `Configuration/PaymentsOptions.cs`,
  `Extensions/ServiceCollectionExtensions.cs`, `Services/ListingService.cs`,
  `Services/Payments/PaymentService.cs`, `Services/Flags/IPublicFlagsService.cs`,
  `Services/Applications/ApplicationService.cs`, web `ui/account.js` (P8.3 audit list;
  re-grep at execution time).

## [X] P1 — Shrink first: deletions and the npm advisory

Make the codebase smaller before fixing it; everything later searches and edits less.

1. **Delete `src/Steeple.Web.v1/` entirely.** Pre-check `grep -rn "Web.v1"` across
   `Steeple.slnx`, `docker-compose.yml`, `docker-bake.hcl`, `deploy.sh`, `.github`/CI if
   any — remove stragglers. Add a ~10-line history note to `docs/ARCHITECTURE.md`
   (what v1 was, when retired, "source lives in git history"), update CLAUDE.md's layout
   section, and fix any doc that presents v1 as extant (the full historical-docs sweep
   waits for P12).
2. **Retire the diorama** (owner decision — Atlas is canonical). Remove
   `stage-diorama.js`, every `style === 'diorama'` branch (P0 list), the `?style=`
   query plumbing and its mentions in `intent.js` comments, CLAUDE.md's A/B params, and
   web README/CONTRACT docs. Keep `?world=off`/flat boot untouched — it is a
   functional fallback, not an art direction. Rewrite `world-test.mjs` for atlas-only
   (its "exactly 12, symmetric per style" contract dies with the style axis — update
   its header's known-stale documentation too); sweep `guest-test`/`wave2-test`/
   `panel-input` for style loops. Other alternate renderers (`?map=`, `?desk=`,
   `?letter=`) are explicitly **not** in scope (design: review separately).
3. **Clear the npm advisory.** Update the lockfile so transitive `nanoid` resolves to a
   fixed version (override if Vite/PostCSS haven't caught up). Add
   `"audit:prod": "npm audit --omit=dev --audit-level=high"` to `package.json` and list
   it in the web README's quality gates.

**Verify:** `dotnet test` untouched-green; `npm test` + `npm run audit:prod` clean;
`npm run build` and `build:flat` produce working bundles (drive the roll into product on
`:5173`, open a room sheet); `grep -rin diorama src/ docs/ CLAUDE.md` returns only
history notes; same for `Web.v1`.

## [X] P2 — Browser storage privacy (High)

Owner decision: private server data, identity profile/email, home location, and
unfinished drafts live in **module memory only**. `localStorage` only for non-sensitive
presentation preferences. No `sessionStorage` anywhere for private data.

1. **Inventory and classify** every storage read/write in the three files (P0 finding).
   For each key: *presentation preference* (survives) or *private* (memory-only).
   `analytics.js`: verify what it persists — a queue of interaction events or client id
   is acceptable only if it contains no free text, identity, or location; otherwise it
   moves to memory too.
2. **`data/store.js`** — drop `load()`/`save()` persistence of the mirror; the store
   becomes a pure in-memory mirror (its "decides nothing" contract already tolerates
   loss — a reload now always costs re-reads, and an unfinished draft may be discarded;
   owner-accepted). Purge every `steeple-village-store:*` key at module init (migration)
   **and** on sign-out. If genuine presentation prefs live inside it, extract them to a
   small `data/prefs.js` with an explicit whitelist and a comment stating the rule.
   The dev-build demo fixture is village scenery, not private data — keep it, but it
   must never persist.
3. **`data/session.js`** — stop persisting `{user, reason, stamp}`. Cross-tab
   coordination moves to `BroadcastChannel` (opaque signed-in/out events; no profile
   payload beyond what a tab can re-fetch). On boot, identity comes from the refresh
   cookie: attempt the single-flight refresh, then ask the API who is signed in. Purge
   the legacy localStorage key on load. The httpOnly refresh cookie and in-memory access
   token are unchanged. (All target browsers have BroadcastChannel; no fallback.)
4. **Tests** — extend `session-tabs-test.mjs` and `store-test.mjs` (plus a new section
   if cleaner): after sign-out, no `steeple-village-store:*` key and no profile key
   exist in either storage; after reload while signed in, identity restores via cookie
   alone and the mirror is empty until real reads fill it; a second tab learns sign-out
   through the channel; a browser given a signed-out profile's old keys (planted
   manually) has them deleted at boot. Expect `account-test` and `hardening-test` §4 to
   need updating — re-baseline with reasons, don't silence.
5. **Docs, same change:** CLAUDE.md's "Web sign-in state" paragraph and the
   `store.js`/`session.js` seam descriptions, `docs/contracts/web.md`,
   `docs/contracts/identity.md` (cross-tab mechanism changed).

**Verify (real flow):** two real tabs — sign in, sign out, watch the other tab follow;
reload mid-draft and confirm the draft is gone but the session holds; inspect both
storages by hand and find nothing private.

## [X] P3 — Photo object integrity (High)

1. **Changeset `019-photo-integrity.sql`:** unique index on the photo storage key;
   `UNIQUE (RoomId, SortOrder)`; partial unique index enforcing one
   `IsPrimary` per room. ⚠ Existing rows may violate all three (the dedup bug creates
   shared keys; concurrency creates duplicate primaries) — the changeset must repair
   data first (re-sort, demote extra primaries, re-key duplicates). Pre-launch data is
   dev/seed, so repair is cheap — but write it defensively, not assuming emptiness.
   Mirror in `RoomPhotoConfiguration.cs` by hand.
2. **`Services/Media/MediaService.cs`:** include the photo row's UUID in every object
   key (`rooms/{roomId}/{photoId}/...`) — generate the id before upload; never rely on
   content-hash dedup again. On any failure after partial variant upload, or on database
   failure after upload, delete the objects already written (compensation in
   catch/finally). Assign `SortOrder`/`IsPrimary` under the new constraints with a
   bounded retry on unique-violation (re-read max order, try again).
3. **Deletion path:** with per-row keys, deleting a row's objects can no longer break a
   sibling — verify the delete flow end to end.
4. **Tests:** integration (Testcontainers) — concurrent duplicate uploads yield two rows
   with distinct keys and exactly one primary; partial-upload failure leaves zero
   orphaned objects (assert against the local media store); DB-failure compensation;
   upload-same-photo-twice-delete-one leaves the other renderable. Prove each new
   constraint bites (violate it deliberately, then fix).
5. **Docs:** media section of `docs/contracts/infra.md` (or the owning contract file) +
   ARCHITECTURE invariants.

**Verify (real flow):** on `:5173`, upload the same image twice to one room through the
host chain, delete one, confirm the survivor still renders (web + Admin).

## [ ] P4 — API correctness batch (four small fixes)

Independent work orders; one agent can take all four. Every new test proven to bite.

1. **Expiry consistency:** pass `now` into
   `Proxies/Availability/EfAvailabilityRepository.cs` (calendar) and
   `Proxies/Applications/EfApplicationRepository.cs` (competing demand); filter on
   effective status (`ExpiresAtUtc`), matching `ApplicationService`'s lazy sweep.
   Tests: a stored-`Pending` row past deadline appears on neither the venue calendar
   nor a conflict warning.
2. **Agreement honesty:** enforce the 50-char version limit in
   `Contracts/Identity/AcceptAgreementRequest.cs` validation and `IdentityService`;
   narrow `EfIdentityRepository`'s catch to `PostgresException` SqlState `23505` on
   `IX_user_agreements_UserId_DocType_Version` — everything else surfaces. Tests:
   oversized version → 400 with the record *not* reported accepted; an unrelated
   `DbUpdateException` propagates.
3. **Refresh rotation, commit-first:** rework `IdentityService` +
   `Proxies/Identity/MemoryRefreshRotationGrace.cs` so the grace cache holds one
   in-flight rotation **task** per predecessor; concurrent callers await its *committed*
   result; failure faults every waiter and evicts the entry — no credential escapes
   before the successor row exists. Document the remaining 30-second theft-detection
   window in `docs/contracts/identity.md` and add a log line worth monitoring. Tests:
   conditional-write failure, exception mid-rotation, two concurrent callers receive the
   identical committed pair.
4. **Notification bulk cap:** `POST /me/notifications/read` caps at 100 IDs (the max
   inbox page) with a small request-body limit and a clear validation problem. Update
   the notifications contract file in `docs/contracts/`. Tests: 100 passes, 101 and an
   oversized body fail cleanly.

**Verify:** `dotnet test` (unit + integration) green; `BookingIntegrityTests` green;
live: `session-tabs-test.mjs` still proves concurrent-tab refresh survives.

## [ ] P5 — Durable delivery (notification outbox)

The design's interim await option is skipped — go straight to the outbox.

1. **Changeset `020-notification-outbox.sql`:** outbox table (id, channel/kind, payload
   jsonb, created_at, attempts, next_attempt_at, last_error, delivered_at, failed_at)
   with an index serving the worker's poll (undelivered, next-attempt-due). EF entity +
   config by hand.
2. **`Services/Notifications/NotificationDispatcher.cs`:** write outbox rows for email
   and push **in the same transaction** as the inbox rows; delete the `_ = ...`
   fire-and-forget sends and the "safe to outlive the request" comment they falsified.
3. **`NotificationOutboxWorker`** modeled on `BookingReminderWorker.cs`: poll, bounded
   batch, a fresh DI scope per batch (this retires the transient-email-gateway lifetime
   hazard — the worker owns its scope), bounded retries with backoff, terminal failure
   stamped `failed_at` + logged loudly (Loki/Grafana surfaces it in prod).
4. **Tests (integration):** outbox row commits atomically with the inbox row (fail the
   send path, both present); worker delivers via a fake gateway; provider failure
   retries then goes terminal and observable; process loss = rows survive restart and
   deliver on next start.
5. **Docs:** ARCHITECTURE (new worker + delivery guarantee), and add outbox rows to
   P7's retention classes (default: 30 days after delivered/failed — record it as a
   decision in `design.md`'s owner list when Jeremy confirms).

**Verify (real flow):** dev mailbox — trigger a notification, stop the API between
commit and delivery (or fault the gateway), restart, watch the email arrive.

## [ ] P6 — Bound time-filtered discovery

1. **Hard candidate cap** on the `when`-filtered path (`ListingService.SearchAllAsync`
   usage → `RoomRepository` → `AvailabilityService`): a named constant (default **300**;
   record any different choice) bounding rooms materialized and availability-evaluated
   per anonymous request, with deterministic ordering so truncation is stable.
2. **Page arithmetic:** cap `page` (default 1000) and compute offsets in checked/wider
   arithmetic — no negative-wrap server error.
3. **Slug lookups:** compare canonical lowercase slugs directly instead of `LOWER()` on
   the indexed column (verify slugs are stored canonical first; they should be).
4. **Suburbs:** apply the discovery geofence bounds to the published-suburbs query
   (defense in depth against drifted/imported data).
5. **Deferred, recorded:** moving availability into queryable/materialized data waits
   until inventory pressure demands it — record the gap in the backlog index
   (`docs/backlog/reputation-and-launch.md` recorded-gaps list).
6. **Tests:** extreme/huge page values; cap behavior with more-than-cap seeded rooms
   (integration); out-of-geofence suburb excluded; a `ToQueryString()` assertion that
   the slug compare stays sargable.

**Verify:** `when`-filtered search on `:5173` behaves identically at beachhead scale;
full `dotnet test`.

## [ ] P7 — Data-retention sweeper (after P5)

Owner-approved policies: refresh tokens 30d after expiry/revocation · notifications
12mo · idempotency records 30d · correspondence 2y after application/booking closure ·
legal acceptances kept indefinitely (post-anonymization) · plus P5's outbox rows.

1. **One `DataRetentionWorker`** (BookingReminderWorker idiom): per-class delete queries
   in bounded batches (default 500/pass), spans config-backed with the owner defaults.
2. **Correspondence × financial records:** *before implementing that class*, write the
   interaction note the design demands (what payment/booking financial rows must
   outlive message deletion, and how) into the owning contract doc; implement to the
   note. If the note surfaces a real owner decision, ship the other classes and leave
   correspondence flagged for Jeremy.
3. **Changeset `021-*`** only if the delete predicates need supporting indexes.
4. **Tests per class:** an over-age row sweeps, an under-age row survives, batch bound
   respected, and — as its own test — nothing ever deletes a `user_agreements` row.

**Verify:** integration suite green; a manual pass against the dev DB with shortened
spans confirms batches and logging.

## [ ] P8 — Production configuration, payments audit, Apple

1. **One Production startup validator** (Program.cs idiom already exists for JWT/mock-
   payments — extend, don't scatter): every external capability declares an explicit
   mode. Fail closed in Production when: email unconfigured; geocoding or media resolve
   to development adapters; `Seo:PublicBaseUrl` missing; database password absent or
   `steeple_dev_pw`; no SSO provider, or **Apple missing** (owner decision: Apple is
   required); Turnstile neither explicitly enabled nor explicitly disabled — silence is
   an error, `disabled` is a legal pre-release mode (general-release flip lives in
   `reputation-and-launch.md`). Development stays exempt.
2. **Hygiene:** `.gitignore` covers `.env.*` (keep `.env.example` allowed);
   `.dockerignore` adds `.env.*`, `.secrets.env`, local media, captured mail, test
   runs; pin base images (`postgres`, `node`, `nginx`) to tested patch versions or
   digests in every Dockerfile and compose.
3. **Payments flag audit** (owner decision: keep `payments.enabled`, off in
   Production while the gateway is mock): walk every reader (P0 list + fresh grep) and
   confirm flag-off consistently hides UI and disables payment setup, gating, price
   snapshots, charging, and sweeping (`PaymentSweeper` idles); bookings created while
   off remain offline/uncharged per contract. Add flag-on/flag-off contract tests; keep
   the existing Production+mock rejection.
4. **Apple, code side:** the validator covers the API half; add a production-smoke
   assertion (suite or documented smoke step) that both Google and Apple buttons render
   when both are configured — the web build must receive `VITE_APPLE_CLIENT_ID` +
   `VITE_APPLE_REDIRECT_URI` (compose maps `APPLE_SERVICES_ID`/`APPLE_REDIRECT_URI`).
5. **⚠ Blocked on owner (list for Jeremy, do not attempt):** Apple Developer Services
   ID/domain/return-URL configuration; supplying the two Apple values to the production
   build + API audience and redeploying; the real first-time Apple sign-in test
   (once-only name, private relay email, agreement gate, refresh, sign-out, repeat).
6. **Startup tests** for each supported Production configuration combination
   (validator-level unit tests are enough; don't boot the world per case).

**Verify:** compose stack boots green with a valid config; each deliberately-broken
config fails at startup with an error naming the capability; `dotnet test`.

## [ ] P9 — Web structural splits + static quality gates

Three file-disjoint work orders — parallelizable as separate agents if wanted.

1. **Split `data/store.js`** (now shrunk by P2): drafts, wire↔domain mapping, schedule
   calculations, host state, dev fixtures into sibling modules behind the same exports.
   Behavior-preserving: suites untouched-green is the gate.
2. **Split `ui/host/listing.js`** (~2,100 lines) by workflow/panel, and give guest/host
   CSS explicit ownership — cascade `@layer` order matching today's load order, or
   strict block-prefix discipline — so the `.letter__sheet`-style bleed becomes
   structurally impossible. ⚠ Layers change cascade behavior globally: land as its own
   step, verified by hostile screenshot review of *both* surfaces (guest sheet, host
   letter, desk, hosting chain).
3. **Static gates:** ESLint (flat config, correctness rules, zero errors at adoption —
   fix or suppress-with-reason), `tsc --noEmit --checkJs` over an allowlist of JSDoc'd
   seam files (`api.js`, `session.js`, `router.js`, `store.js` splits — grow it, no
   TS rewrite), the P1 `audit:prod`, and a focused accessibility pass (axe or
   equivalent driven from an existing harness) over browse, room sheet, letter, inbox.
   Wire all four into the web's documented done-gates (`npm test` or a `check` script).

**Verify:** full web suite hygiene sweep (each suite in its header-documented
invocation, judged against known-stale sets); screenshots reviewed as a hostile design
review; `dotnet test` untouched.

## [ ] P10 — `ApplicationService` decomposition (best after P4)

Extract within `Services/Applications/` (same deployable, ports and controllers
untouched): pure transition rules, schedule validation, effective-expiry policy (P4's
predicates centralize here), notification composition, presentation/DTO mapping.
Verbatim moves where possible. Gates: `dotnet test` untouched-green and
`BookingIntegrityTests` green (this is bookings/approval — the concurrency proof is
mandatory), plus one live apply→approve→book drive on `:5173`.

## [ ] P11 — Wire-token golden contract

Decision (cost ceiling, no-lock-in): **no OpenAPI codegen toolchain.** One
authoritative token table — `docs/contracts/tokens.json` (or a shared fixture under
`tests/`) — listing every wire enum token: status, frequency, activity, amenity,
accessibility, notification kinds, days, feature-flag names. Golden tests on each side
read it: C# asserts serializer output for every enum member; web asserts its maps cover
the table exactly; mobile asserts its models against it (via `test/fixtures/*.json`;
`flutter analyze` + `flutter test` are part of done). CONTRACTS.md names the table as
the one place tokens change. **Prove the guard bites:** mutate one token locally,
watch all three sides go red, revert.

## [ ] P12 — Docs history separation + closing sweep

1. **History sweep:** mark superseded decisions mechanically (a standard
   "Superseded <date> → <pointer>" line), remove retired v1/endpoint references that no
   longer teach anything, audit CONTRACTS.md's ✅/🔲 marks against as-built, and keep
   rationale-of-record docs (design.md files) clearly labeled as history.
2. **Obligation check:** every phase's same-change doc updates actually landed (walk
   the doc map).
3. **Closing verification sweep** — a separate verification agent, not the builders:
   full `dotnet test` (unit + integration), web `npm test` + lint + typecheck +
   `audit:prod`, the live suites in their documented invocations with failures judged
   against documented stale sets, one full real-flow drive (search → sign-in → book →
   host decision → rating), and a compose-stack boot against a production-shaped
   config proving P8's validator both passes and fails correctly.
4. **Rewrite this file** into the dated history stub, SEO-plan precedent
   (`docs/backlog/seo/build_plan.md`): how it landed, deviations, what stayed open.

## Done means

- [X] `Steeple.Web.v1` and the diorama exist only in git history and dated notes; the
      npm production audit is clean and scripted.
- [X] No private data in browser storage: memory-only mirror, BroadcastChannel
      cross-tab, purge on boot and sign-out, proven by browser tests that try to
      recover it and fail.
- [X] Photos: per-row object keys, compensation on failure, DB constraints (unique
      key, unique sort order, one primary) — each proven to bite.
- [ ] Expiry, agreements, refresh rotation, and bulk-read caps fixed with tests that
      were shown to fail before the fix.
- [ ] Notifications deliver through a transactional outbox with retries and observable
      terminal failure; process loss loses nothing.
- [ ] Time-filtered discovery is hard-bounded; page math can't wrap; slug lookups are
      sargable; suburbs respect the geofence; availability materialization recorded as
      a deliberate gap.
- [ ] Retention sweeper enforces every owner-approved span in bounded batches;
      agreements provably never swept; the correspondence/financial-records note
      exists.
- [ ] Production startup validates every external capability with explicit modes;
      Turnstile-disabled is explicit; Apple is required and validated; ignore rules and
      image pins landed; payments flag audited with on/off contract tests. Owner
      actions for Apple handed to Jeremy as a checklist.
- [ ] `store.js`, `host/listing.js`+CSS, and `ApplicationService` are split with
      untouched-green suites; web has lint, JSDoc type-check, audit, and a11y gates.
- [ ] One token table gates C#, web, and mobile wire enums, and was proven to bite.
- [ ] Docs separate current truth from history; owning docs updated in the same change
      throughout; this plan rewritten as its own history stub.
