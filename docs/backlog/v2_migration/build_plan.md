# Web v2 production migration — build plan

> Companion to `design.md` (decisions D1–D9; read it first — this plan does not repeat
> the rationale). Each phase is a self-contained brief: scope, files, tasks, acceptance
> criteria, verification. Phases assume the repo state of 2026-08-05; re-verify any
> "today" claim against code before building on it. Update this doc (check boxes, prune)
> as phases land; record deviations in `SYSTEM_DESIGN.md` §17.

**Dependency graph:** P1 → P2 → (P4) are sequential on the web surface. P3 (API/Admin)
is independent of P1/P2 and can run in parallel with them. P3.5 is an independent,
urgent web boot fix; land it before P4 (both touch the entry/splash and CSP). P3.6
(harness consolidation) touches `tools/` only, can run in parallel with anything, and
should be paid before P4 leans on the suites for verification. P5's remainder is small
(most of it landed 2026-08-06 — trust its checkboxes) and follows P2. P6 is the closing
sweep and runs last. **Remaining execution order: P3.5 → P3.6 (parallelizable) → P4 →
P5 remainder → P6.**

**Every phase:** `dotnet test` green (unit instant; integration needs Docker);
anything touching approval keeps `BookingIntegrityTests` green; drive the real flow
(`docs`-map "Build / run / verify" recipe in `CLAUDE.md`) — compiling is not done;
update the owning docs (CLAUDE.md doc map) in the same change. Web harness suites in
`src/Steeple.Web.v2/tools/*.mjs` each document their own flags/env in their header —
run them exactly as documented. Known-stale failures predating this work: guest-test 3,
wave2-test 6, world-test 12.

**Status 2026-08-06** (after the review-driven quality round, local tip `ba5119e`): P1,
P2, P2.5, P3 landed as recorded below; the quality round then moved numbers the landing
notes cite — `correspondence-test.mjs` is now **69/69 (§0–§9)** after the desk read-once
fix, `dotnet test` is 391 unit + 96 integration, the web refresh token became an httpOnly
cookie (`docs/contracts/identity.md`), and several P5 items landed early (marked in
place). Landing notes below are history; trust the checkboxes.

---

## Phase 1 — Signed-out truth & the account surface (web) `[x]` (landed 2026-08-05)

**Implements:** D6, and the visible half of D4's "no demo data for strangers".
**Touches:** `src/Steeple.Web.v2/src/ui/account.js`, `ui/guest/index.js`,
`ui/guest/journal.js`, `ui/host/index.js`, `ui/host/desk.js`, `data/session.js`,
`data/store.js`, `data/api.js` (sign-out call), `ui/index.js`.

Tasks:

1. **Header affordance, both states.** Signed out: quiet "Sign in" chip where the
   account chip sits (`account.js:107` currently hides the element entirely); opens the
   same identity panel the flows use (`ui/guest/sso.js`). Signed in: existing chip/card
   with the standard single-session Sign out action. Match the design system — calm,
   never a nav bar bolted on.
2. **Server-side sign-out.** `api.js` gains `deleteSession()` (`DELETE /auth/sessions`,
   bearer); `session.signOut()` calls it best-effort (revocation failure must not trap
   the user signed in locally).
3. **Gate the correspondence surfaces on session.** Inbox tab + badge
   (`ui/guest/index.js:130` — currently `state.mode` only), journal, letters: render
   only when signed in; subscribe to `session.onSessionChange`. The journal identity
   line reads the session user, not `ORGANIZERS[GUEST_ID]`.
4. **Gate every "Identity verified (SSO)" chip on fact.** Unconditional placements:
   `ui/guest/journal.js:93`, `ui/host/desk.js:76` and `:243`,
   `ui/host/listing.js:1289` (hardcoded `verified: true`). Pattern to copy:
   `sso.js:330-332` (`verified` ⇒ `session.isSignedIn()`).
5. **Per-user store + clean sign-out.** Store key becomes
   `steeple-village-store:{userId}` (guest/anonymous browsing may keep a `:anon`
   namespace for drafts); sign-out drops in-memory state, leaves other users' keys
   alone, and returns journal/letter/desk views to the village. Dev seed loads only in
   `import.meta.env.DEV`.
6. **Session-death notice.** On refresh failure (`session.js:125-130` silent
   `keep(null)`) surface a small non-blocking "You've been signed out" notice via the
   existing bus/notice pattern.

**Accept when:** a fresh incognito visitor sees no inbox, no badge, no verified chips,
a Sign in affordance; signing in (dev provider) shows chip + empty inbox; sign-out
revokes server-side (verify: replaying the old refresh token → 401), clears the
surface, and a second account on the same browser sees none of the first's state.
**Verify:** drive on `:5173` against a running API; then re-run the affected
`tools/*` suites with their documented flags and re-baseline assertions that encoded
the old demo behavior (that behavior is *removed by design* — update the suite, note it
in the phase summary).

**Landed 2026-08-05.** `tools/account-test.mjs` is the live probe (47 checks: signed-out
truth, the shelf's way in, sign-in, server-side revocation proven by replaying the old
refresh token, account isolation on one browser, the expiry notice). Store keys are
`steeple-village-store:{organizerId}` where the id is the session user's — or, **in dev
builds only**, the seeded persona an address belongs to (`store.PERSONA_IDS`), which is
what keeps the demo village's correspondence legible while it still exists. The demo seed
is gone from production builds (`import.meta.env.PROD`); `hostVenueId` still defaults to a
bundled venue, so P2's `GET /manage/venues` scoping is what actually empties the desk.
Re-baselined suites: `store-test` (signs a person in; new per-person assertions),
`surface-test` §2.6 (the shelf now carries the way in), `world-off-test` §6 (signs in and
skips the ladder where there is no seed), `world-test` §7 (reads a seeded date from the
venue, not from an inbox), `input-test` §11 (signs in before the inbox deep link).

---

## Phase 2 — Correspondence onto the wire (web) `[~]` *(code landed + driven 2026-08-05; suite debt below)*

> **The phase's own acceptance script is met and driven.** `correspondence-test.mjs` is
> **61/61 green** across §0–§7: a stranger is shown no business; the request goes through the
> `402` card step; the desk finds it by server truth; question → answer → counter-offer →
> accept → booking, with localStorage cleared twice mid-flow; the decision email's `?goto=`
> CTA is followed out of the dev mailbox; instant book books on the spot; one guest never
> sees another's inbox; and D5's honest-offline send files nothing, loses nothing and
> retries with the same idempotency key.
>
> **Driving it found four defects that every green test suite had missed** (all fixed
> 2026-08-05, all with their reasoning in the owning doc):
> 1. **Rate limiting was per-IP, never per-account** — `UseRateLimiter()` ran before
>    `UseAuthentication()`, so the policies partitioned on an anonymous principal and fell
>    back to the client IP. Everyone behind one NAT shared one bucket (`contracts/api-ports.md`).
> 2. **Card setup spent the apply budget** — a first request (submit → 402 → setup →
>    confirm → submit) burned four of five permits, so the guest was refused when they
>    answered the host's first question. `payments` is its own policy now.
> 3. **A list read forgot a live counter-offer** — the API omits `counterOffer` from lists by
>    design; the client's mirror replaced it unconditionally, so a background inbox refresh
>    erased the accept/decline controls under a letter somebody was reading.
> 4. **The host's desk read its venues once per page load** — a guest's withdrawal or
>    accepted counter stayed invisible until a reload. Opening the board asks again.
>
> Plus one copy defect only a real outage shows: "unreachable" meant `status === 0`, but this
> app is always behind a proxy and a proxy with a dead upstream answers **502**, so the one
> outage a person actually meets got the vaguest sentence in the vocabulary and no promise
> that nothing had been sent. `neverArrived()` covers 0/502/503 — and deliberately not 504.
>
> **Outstanding (suite debt only — no product debt known; execution home: Phase 3.6):**
> 1. `wave2-test.mjs`, `host-test.mjs` still drive the demo-store apply/desk path (send as a
>    seeded persona, decide on seeded requests). Their subject is `correspondence-test.mjs`'s
>    now; they need the same treatment `guest-test.mjs` got — keep what is uniquely theirs
>    (real-input drive), drop what the product stopped doing.
> 2. `host-publish-test.mjs` is green through §5 (the whole publish chain and its copy); one
>    tail assertion, `effectiveRoom(venue,'main-space')` for the host's own new room, now
>    returns null — likely the per-person store scoping (D6). Worth a look, not yet chased.
> 3. `host-offline-test.mjs` — **settled by P2.5 owner decision 1 (2026-08-05):** hosting
>    entry requires a session, so writing a listing while steeple is away is no longer a
>    promise the product makes. Delete the suite or rewrite it signed-in-then-offline
>    (P3.6 item 4); do not restore the old order.
> 4. `input-test.mjs` §12 (board ↔ ledger) is **skipped, not passing**, and two desk-specific
>    plumbing checks beside it ("the porch switch still works over an open desk", "a click
>    inside the desk is the desk's own") are **removed, owed**: driving them on the inbox
>    instead was tried and asserts the wrong thing — the two sheets sit in different modes.
>    All three need a host fixture. The right fix is to lift
>    `correspondence-test.mjs:mintVenue` into a shared `tools/fixtures.mjs` and let any suite
>    ask for a host who keeps a venue; that one change unblocks this, `host-test.mjs` and
>    `wave2-test.mjs` together, and is the highest-leverage next move on suite debt.
> 5. `input-test.mjs` also fails 7 checks in its **opening** section (the roll/arrival beats
>    and three "the canvas is topmost" hit tests). These are map-first drift that predates
>    this phase — the same family as `guest-test.mjs`'s documented known-stale 3 — and were
>    not touched here.
>
> **Re-baselined and green:** `account-test.mjs` 47/47 · `host-input-test.mjs` 61/61 ·
> `guest-test.mjs` (§§7–10b removed — their subject moved to `correspondence-test.mjs`; the
> composer pill now reads the venue's booking mode off the wire rather than assuming
> request→approve) · `input-test.mjs` (a deep link to `#/desk` while signed out must open no
> desk). `world-test.mjs` still fails its documented 12; the 3 extra are environmental — the
> shared dev database holds room photos with **absolute** URLs baked in at upload
> (`Media:PublicBaseUrl`), so rows written by other agents' API instances point at ports that
> are no longer listening. Worth knowing for production: renaming the media host orphans
> every photo already stored.
> Suite environment: API `:5210` (`--urls`; launchSettings pins 5200), vite `:5273` via the
> new `STEEPLE_API_ORIGIN` env in `vite.config.js`; `correspondence-test.mjs` needs
> `STEEPLE_API` + `STEEPLE_PSQL` (psql stands in for the operator's first-listing approve),
> and launches **one browser per person** — two same-origin pages in one renderer starve
> each other's `waitForFunction` (hang, no error). Never revert to tabs.
> Notes for whoever reads this next:
> (a) the wire for everything after a request is written is one new seam,
> `src/data/correspondence.js`, and `store.js` is now strictly its mirror — one way in per
> shape, no local status machine. Its failure vocabulary (`refused | offline | signedOut |
> unavailable`) is what every surface says something calm about;
> (b) **the 402 gate** (`payments.enabled` is on in dev) means no request can be sent without a
> card on file, so the apply flow grew a deliberately-minimal mock-card step,
> `src/ui/guest/payment.js` — brand + last4 only, and there is **no field a card number could
> travel in**, here or at the API. Polishing that step is the payments-UI agent's;
> (c) **instant venues** answer the submit with the booking (`status: approved` + `bookingId`),
> so the send copy is mode-aware and `409 slot_taken` on submit files nothing at all;
> (d) `?goto=` deep links from notification emails are implemented (`src/ui/deepLink.js`);
> `/bookings/{id}` resolves through the booking to its application and opens that letter,
> which is where this app renders a booking today;
> (e) two bugs found by driving it: a panel that disabled its controls while waiting never
> re-enabled them (`payment.js` **and** the pre-existing `sso.js`), and the apply flow could
> only ever open rooms the bundled scenery knew — both fixed, the second is what makes a
> production build able to file a request against a host-listed room;
> (f) the demo fixture stays in dev builds as village scenery and is contained by
> construction rather than by a flag (its letters are written under the seed's own ids; a real
> account's id is a GUID; the desk is scoped to `GET /manage/venues`).
> Live probe: `tools/correspondence-test.mjs`. Re-baselined: `store-test.mjs` (now the
> mirror's fidelity suite), `account-test.mjs`, `world-test.mjs`.

**Implements:** D4, D5. **Depends on:** P1 (identity is real).
**Touches:** `data/api.js`, `data/store.js`, `ui/guest/{journal,letter,send,composer,
weekCard}.js`, `ui/host/{index,desk,letter,model}.js`, `flows/world/ribbons.js` (reads
store-derived state — verify it still lights from mirrored data).

Tasks:

1. **api.js grows one function per existing endpoint** (names verbatim, `/api/v1`):
   `getManagedApplications()` (`GET /manage/applications`), `getApplication(id)`,
   `postApplicationMessage(id, body)`, `postDecision(id, decision, note?)`,
   `postWithdraw(id)`, `postCounterOffer(id, spec)`, `postCounterOfferResponse(id,
   accept)`. Wire shapes: contracts doc §5 (Applications). Counter-offer endpoints sit
   behind the `booking.counter_offers` flag server-side — surface the 404/flag-off case
   as "not available" rather than an error.
2. **Guest inbox = `GET /me/applications`.** Fetch on sign-in/session change and on
   journal open; mirror through `store.fromWireApplication` into the per-user store;
   render from the mirror. The badge counts *your-move* states from server truth.
3. **Guest letter actions → wire.** withdraw, counter accept/decline, thread messages
   (`ui/guest/letter.js:137,176,264,322` currently call store mutators). Pattern:
   call wire → merge returned application/thread into store → re-render (exactly what
   `send.js:104` already does for submit). On failure: honest error, no local
   state-flip (D5).
4. **Host desk = real venues + real requests.** Desk exists only when
   `GET /manage/venues` is non-empty (kills the seeded-venue selector,
   `ui/host/desk.js:220-233`); requests from `getManagedApplications()`. Approve /
   decline / ask / counter (`ui/host/letter.js:173,249,283,517`) → wire. Approve
   surfaces `409 slot_taken` as the product moment it is (slot went to another group);
   local booking fabrication (`store.approve` materializing occurrences) is deleted —
   bookings render from the approve response / subsequent reads.
5. **Honest submit (D5).** `send.js`: remove the silent `locally(draft)` fallback
   paths (`:92`, `:108`); API unreachable ⇒ draft stays a draft, copy says so, retry
   affordance; **do not delete the idempotency key on timeout** (`send.js:120` bug —
   the key is what makes retry safe).
6. **Availability truth.** The apply calendar reads
   `GET /listings/{id}/availability` (already in `api.js:303`, unused) instead of the
   synthetic 08:00–22:00 seed (`weekCard.js` ← `store.openHoursFor`). **Blocking after P1:**
   the 08:00–22:00 windows were part of the demo seed, so a production build now has none —
   the week card says "no open hours published yet" and nothing can be sent. This task is
   what makes a built bundle able to file a request at all.
7. **Demo seed containment.** Seeded applications/venues/personas load only in dev
   builds; production starts empty. `store-test.mjs` re-baselined to the cache-mirror
   role (its schema-fidelity assertions stay — they now guard the mirror translators).

**Accept when:** with the full stack up, two browsers (organizer + a dev-SSO'd manager
of a seeded venue — see `venue_managers` seed / Admin linking) complete the loop:
apply → host sees it (server truth: row exists via `GET /manage/applications` with
curl) → question → reply → counter-offer → accept → approved booking visible both
sides — with localStorage cleared mid-flow on both browsers and nothing lost.
**Verify:** the E2E suites in `tools/` that mint real accounts/venues/applications are
the closest existing harness — run them with documented flags; extend rather than fork.

---

## Phase 2.5 — The payments surface (web) `[x]` *(landed 2026-08-05)*

**Implements:** the client half of `docs/contracts/payments.md` +
`docs/backlog/booking-modes.md`, on top of Phase 2's wire integration.
**Touches:** `data/api.js`, `data/correspondence.js`, `data/store.js`,
`ui/money.js` (new), `ui/cardPanel.js` (new), `ui/notifications.js` (new),
`ui/host/{desk,index,payouts,listing}.js`, `ui/guest/{letter,index,journal,payment,sso}.js`,
`ui/{account,deepLink,index}.js`, `styles/{host,guest,main}.css`,
`tools/payments-ui-test.mjs` (new).

**Owner decisions this implements (2026-08-05, in session):**

1. **Hosting entry requires a session, full stop** — which retires the signed-out half of the
   listing flow's Verify step as dead code. It now confirms *whose* listing this will be and
   never asks a signed-in host to sign in again; a session that dies mid-flow says so and
   points at the one way back in (`createIdentityStep({requireSession})`). This also settles
   Phase 2's outstanding item 3: **`host-offline-test.mjs` is not re-baselinable — writing a
   listing while steeple is away is no longer a promise the product makes.** Delete it or
   rewrite it as a signed-in-then-offline test; do not restore the old order.
2. **The desk's IA is `Bookings · Requests · Spaces`.** "Requests" is the wrong primary noun
   under instant-book-by-default: most hosts never answer one. Bookings leads and the desk
   opens on it. Requests renders **only** for a manual venue — with one deliberate refinement
   on the brief: it also survives while an instant venue still has live requests, because mode
   changes bind new asks only and a tab that vanished with somebody's ask inside it would
   strand them. A fresh instant venue has no Requests tab, which is what the decision is about.
3. Copy grammar throughout: instant = booked/confirmed, manual = requests.

**What landed:** the host's rescind lever (two presses, an honest asymmetric warning, refund
proven in the `payments` table); per-occurrence charge state and the next-payment line on both
sides; the guest's failure ladder in steeple's own terms with the card step a press away; the
card on file reachable from the account chip (`Visa ···· 4242`, replace) through one shared
panel; the payout prompt → mock KYC → connected state, honest that payments are simulated; the
booking-mode toggle on Spaces; and `GET /me/notifications` rendered as **ambience** — one slip
on arrival plus quiet lines in the inbox, no bell, no unread count, no new nav tab.

**Verification:** `tools/payments-ui-test.mjs` **65/65** (§1 IA per mode · §2 the booking view
incl. a `0002`-card failure · §3 rescind + refund both sides and in the DB · §4 payouts · §5
the mode toggle changing the public apply UX · §6 a seeded reminder as a slip).
`correspondence-test.mjs` **62/62** (61 + one new check; its §2 was re-baselined to press the
Requests tab, since the desk opens on Bookings now). `host-input-test.mjs` 61/61 unchanged —
the simplified Verify step keeps its §2 assertions. `dotnet test` unit 386/386.
`host-publish-test.mjs` still fails only its documented tail assertion.

**Five defects the driving found that reading the code did not:**
1. The booking-mode radios reused `.choice*`, which is the **request sheet's** class in
   `styles/guest.css` — and guest.css loads after host.css, so the desk's setting silently
   inherited the composer's radio styling and rendered unreadable. They are `.mode*` now.
2. The guest letterhead printed **"Free"** over a $40-a-session booking for any host-listed
   room: `priceParts` answers Free to a price it was not given, and a room outside the bundled
   scenery has none. A missing figure means *unknown* now and prints nothing.
3. The payout screen offered **Confirm and finish before onboarding had started**, which
   answers `400 invalid_payment` — the screen's own fault, not the host's. The way on does not
   exist until steeple has answered.
4. The held-dates grid crammed three columns into two once a charge word joined each row.
5. The suite's first slip check passed on a slip at **opacity 0** — "not hidden" is not "on
   screen" when the thing fades in and headless GL runs app-time ~6× slow.

---

## Phase 3 — Single-gate moderation + Admin gutting (API + Admin) `[x]` *(landed 2026-08-05)*

> **Landed as specified**, with three notes for whoever reads this next:
> (a) the takedown lever is a per-room **Unlist** on `/admin/listings`, and Admin's routes moved
> (`/admin/review`, `/admin/venue-managers`; `/admin/moderation` is gone);
> (b) Admin's CSP was blocking every queue photo (`img-src 'self' data:`) — now config-pinned via
> `Admin:MediaImageOrigins`; a pre-existing bug, found by screenshotting the queue;
> (c) the first-listing decision now also marks the venue's pending evidence submission decided,
> so a declined host isn't locked out of resubmitting by `409 verification_pending`.
> `Steeple.Integration.Tests` references `Steeple.Admin` so the loop is tested across both halves.

**Implements:** D2, D3. **Independent of P1/P2.**
**Touches:** `src/Steeple.Api/Services/Manage/ManageService.cs` (publish path,
~`388-415`), `Controllers/Manage/*`, `src/Steeple.Admin/**` (large deletions),
`docs/contracts/manage.md` (moderation model section), tests.

Tasks:

1. **Trusted-host rule in `ManageService`.** On a publish request passing the
   automatic gates (photo, open-hours flag, geofence): if the requesting manager
   manages ≥1 room with `FirstPublishedAtUtc IS NOT NULL` → set `Published`, stamp
   `FirstPublishedAtUtc`, set `Venue.IsIdentityVerified = true` if unset, emit the
   moderation analytics event with an auto-published marker. Else → stamp
   `PublishRequestedAtUtc` (existing under-review behavior). One repository query;
   keep it in the manage module (read-only cross-module reads are allowed).
2. **Approve/decline moves to one decision (Admin).** Admin's
   `DecidePublishRequest`: approve = verify venue + publish + `listingApproved` inbox
   row (it largely does this; the standalone venue-verification decision is deleted and
   its evidence display folds into the queue item). Decline = clear request stamp +
   note + `listingDeclined`. Keep `Remote-User` attribution and the stdout analytics
   line.
3. **Gut Admin.** Delete: users panel, analytics panel, feature-flags panel,
   login/MFA/trusted-devices screens and routes, application force-status, bulk
   listing status changes, the `ProviderEditedAtUtc` review-feed screen (column +
   stamping stay). Keep: review queue, venue-manager linking, rating hide/unhide,
   overview trimmed to what's real. Delete dead workspace code + views with the
   screens; `PostgresAdminWorkspace`'s in-memory user/flag fixtures go entirely.
4. **Keep a takedown lever.** The bulk-status screen was the only operator path to
   pull a listing (DMCA/abuse — SYSTEM_DESIGN §14 flags this). Replace it with a
   single-room **Unlist** action on the review/listing surface (invariant-respecting:
   routes through the same status rules as `/manage`, honors upcoming confirmed
   occurrences) and note the psql runbook as backstop. Do not delete the old screen
   before the replacement exists.
5. **Tests.** Unit: trusted vs untrusted publish paths; published ⇒ venue verified.
   Integration: untrusted request → under review → Admin approve → published +
   verified + notification row; trusted second listing → immediate publish. Prove each
   new guard bites (temporarily break it, watch the test fail). `BookingIntegrityTests`
   untouched-and-green.
6. **Docs in the same change:** contracts manage/moderation section, ARCHITECTURE
   Admin + Manage sections, SYSTEM_DESIGN §6/§17 entry, PRD trust-model wording
   (already drafted by the 2026-08-05 docs pass — verify, don't duplicate).

**Accept when:** the integration tests above pass, and driving the real flow (fresh
dev-SSO user → create venue → room → photo → hours → publish) lands in Admin's queue;
approve publishes + verifies + notifies; that user's *second* room publishes with no
Admin involvement. Admin serves exactly three action surfaces.

---

## Phase 3.5 — Product-first boot and durable splash intent (web) `[ ]`

**Why now:** the 2026-08-06 first-paint work put the village poster and title markup in
`index.html`, but the visible controls remain inert until `ui/index.js` arrives and
`createArrival()` assigns their handlers. A production-build probe at slow 4G
(150ms RTT, 1.6Mbps down, 4× CPU) made the DOM interactive at ~0.7s, lost a real click
at ~0.7s, finished the Three/engine downloads at ~2.2s, and attached the handlers at
~2.3s. The current production chunks are approximately 105KB gzip for the UI and 184KB
gzip for journey/world/Three/engine. The controls do not depend on Three, but both
families start together in `main.js`, so the product and the overture compete for the
same connection.

**Product rule:** intent beats scenery. A press on **Find a space**, **Host a space**,
or the down affordance must be accepted from the first frame in which it is shown. If
the live village is ready, keep the roll cinematic. If it is not ready, go directly to
the product surface; do not wait for it, do not start it afterward, and do not fetch it
in the background while the map is in use. That visit is flat from then on, including a
later return to the title through the wordmark. Cold product deep links already skip the
cinematic and should follow the same no-world policy.

**Touches:** `src/Steeple.Web.v2/index.html`, `src/main.js`, `src/ui/arrival.js`,
`src/core/bus.js` and/or a new small boot-intent module, `src/journey/roll.js`,
`src/core/idle.js`, a new `tools/boot-priority-test.mjs`, `README.md`, and
`docs/contracts/web.md`. Do not change the village, map, catalog, or API contracts to
solve boot ordering.

Tasks:

1. **Give every printed control a durable native action.** Render the two CTAs and the
   down affordance as real links to the existing hash routes (`#/browse`, `#/desk`,
   `#/browse`) while retaining their button styling and accessible names. Before any
   JavaScript arrives, a press must at least record its destination in `location.hash`;
   it must never be a styled `<button>` with no behavior. Once the live roll owns the
   page, its handler may prevent the native navigation and run the cinematic.
2. **Separate splash intent from product hydration.** Move the small amount of arrival
   event ownership out of the 105KB-gzip `ui/index.js` graph. The critical controller
   may use an external same-origin module (the CSP deliberately forbids inline script),
   but it must not import Leaflet, product panels, session/store, Three, or world code.
   Its only job is to record `{destination, requestedAt}`, show immediate quiet progress
   feedback, prevent duplicate activation, and hand the intent to the boot coordinator.
3. **Make the intent sticky.** `rollTo()` currently emits a fire-and-forget
   `roll:request`; a request sent before `createRoll()` subscribes is lost. Do not fix
   this by merely moving the existing `onclick` earlier. Either give the boot
   coordinator a one-shot pending intent/ready promise or make this one bus request
   replayable until claimed. Consume it exactly once. The URL remains the recovery
   truth across a reload; the in-memory intent controls the current boot.
4. **Put the product first on the wire.** Start the interface chunk immediately. Do not
   start `engine.js`, `world/index.js`, or `journey/index.js` until the interface is
   interactive, the browser has an idle opportunity, and no product intent or deep link
   exists. There is no useful cancellation handle for a dynamic `import()` already in
   flight, so sequencing is the dependable bandwidth control; do not add a fetch/blob
   loader or a package to fake cancellation. Keep the poster as the visual while the
   village waits. Bound the idle wait (`requestIdleCallback` with a timeout fallback, or
   equivalent) — a busy main thread must not be able to postpone the village
   indefinitely on the no-intent path.
5. **Take the direct path when intent wins.** For an intent received before the village
   is ready: initialize the existing flat/no-op roll, set the roll to `1`, apply the
   destination (`village` for Find/down, `desk` for Host), remove/release any partial
   canvas state, and let the ordinary UI subscribers render the map or hosting surface.
   If 3D imports began in the narrow interval before the press, let their transfers
   settle but abandon that boot generation: it must never create/start an engine or
   overwrite the product state afterward.
6. **Wake product work on the intent, not on world readiness.** The initial catalog
   search, listing rows, map setup/tiles, and any destination-specific reads currently
   wait through `afterBoot`. A direct entry must release that gate as soon as the UI can
   consume the answer. `window.__steepleReady` continues to mean the currently chosen
   surface is interactive: frame-warm for a village boot, UI-ready for a direct/flat
   boot. No product request waits for that signal before *starting*.
   ⚠️ Trap (2026-08-06 boot round; comment in `ui/map/atlas.js`): **never defer
   Leaflet's tile layer** — a grid-layer-less map settles a NaN zoom on the unsized
   container and the next `invalidateSize` kills the boot. The direct path changes
   map-init timing; the tile layer ships with the map, always.
7. **Keep the normal arrival intact.** With no early intent or deep link, the current
   poster → live canvas crossfade and 1.28s roll remain. Do not lower poster priority,
   degrade the village, infer a slow connection from `navigator.connection`, or disable
   animation solely because a device is slow. The decision comes from the person's
   action, which is both more reliable and the product truth.
8. **Instrument only the settled action.** If the web analytics batcher from P5 has
   landed, emit one arrival-CTA event with `entry: cinematic | direct` when the intent
   is consumed, not once on native click and again on hydration. If P5 has not landed,
   leave the hook named in the controller and add the taxonomy row with P5; do not pull
   the batcher into this phase.
9. **Document the boot state machine.** `README.md` and `contracts/web.md` must name the
   three states and their ownership: printed arrival (native intent), product-first
   flat boot, and live-village boot. Record that a product-first visit never backfills
   Three while browsing and that native hash routes are the no-hydration fallback.

**Acceptance:**

- On a throttled production debug build, press each arrival action as soon as its
  printed DOM exists, before `ui/index.js` or any Three chunk completes. The press
  eventually lands once in the correct view without pressing again; visible progress
  feedback is required from the moment the task-2 intent controller is present (in the
  narrower pre-controller window, the recorded hash alone is the guarantee).
- An early Find/down press lands on an interactive map and starts the listings request
  without waiting for `window.__steepleReady` or any 3D resource. An early Host press
  lands on the desk/sign-in truth by the same path.
- When the press happens before the deferred world import begins, the resource timeline
  contains no engine, world, journey, or Three request for the rest of that visit. A
  direct hash load has the same property. Map tiles, catalog JSON, and listing images
  receive the freed connection capacity.
- A press during an already-started village import transitions directly, does not start
  an engine after the product has landed, and produces no unhandled rejection. The
  already-issued module requests are allowed to finish; the product does not wait for
  them.
- A no-intent cold load still crossfades poster to village without a visual jump, then
  rolls cinematically on click. `?world=off`, reduced motion, deep links, Back/forward,
  keyboard Enter/Space, and sub-path hosting retain their current behavior.

**Verify:** add `tools/boot-priority-test.mjs` and run it against `build:debug`, not the
Vite module graph. Drive CDP network + CPU throttling and delay named chunk responses so
the three timing windows are deterministic: pre-interface, interface-ready/world-not-
ready, and world-ready. Assert the destination and exactly-once consumption in all three;
assert resource absence/order through `performance.getEntriesByType('resource')`. Then
run `input-test.mjs`, `world-off-test.mjs`, `map-test.mjs`, `host-test.mjs`, and one real
catalog-backed browse flow using each suite's documented flags. The new test must click
before waiting on `window.__steepleReady`; waiting first would reproduce the existing
blind spot.

---

## Phase 3.6 — Harness consolidation (web `tools/` only) `[ ]`

**Why a phase:** P2's suite debt has sat as narrative notes since 2026-08-05 with no
owner, and P4/P5 verification leans on these suites. Touches `tools/*.mjs` only —
parallel-safe with any other phase, including P3.5.

Tasks:

1. **Lift `correspondence-test.mjs:mintVenue` into a shared `tools/fixtures.mjs`** so
   any suite can ask for a host who keeps a venue. This is the unlock for everything
   below — P2's named "highest-leverage next move on suite debt".
2. **Rebaseline `wave2-test.mjs` and `host-test.mjs`** onto the wire era: keep what is
   uniquely theirs (real-input drive), drop the demo-store apply/desk paths whose
   subject is `correspondence-test.mjs`'s now.
3. **Restore `input-test.mjs` §12** (board ↔ ledger) and the two removed desk plumbing
   checks ("porch switch over an open desk", "a click inside the desk is the desk's
   own") on a host fixture from item 1.
4. **`host-offline-test.mjs`:** delete, or rewrite signed-in-then-offline (P2.5 owner
   decision 1 — do not restore the old order).
5. ~~**Chase the `host-publish-test.mjs` tail**~~ — **done 2026-08-06.** Not D6 scoping:
   the local venue was kept under a *guessed* slug (`placed-trinity-hall-…`) while steeple
   minted its own (`trinity-hall-…`), and `mirrorManagedVenues`' dedupe filter dropped the
   guess mid-flow, orphaning the room, its hours and its closed days. The store now adopts
   the server's slug the moment a create answers (`adoptVenueSlug`/`adoptRoomSlug`), and
   the suite asserts it. Item 2's `host-test.mjs` half is still open (see its header).
6. **Fix the `surface-test.mjs` §5 crash** (`outBox.cx` null on the account monogram)
   that truncates its run.
7. **`pipe: true` + close-in-`finally` sweep across all suites** (absorbs P6 item 5) —
   headless Chrome outlives a dead node parent; verify by aborting a run mid-suite and
   checking `ps` shows no PPID-1 "Chrome for Testing" processes.

**Accept when:** every touched suite runs green under its documented flags (or its
remaining reds are re-documented as known-stale with a reason), and no suite drives
the demo-store apply/desk path.

---

## Phase 4 — Production SSO, Turnstile, agreements (web) `[ ]`

**Implements:** D1, D7. **Depends on:** P1 (header affordance exists).
**Touches:** `data/session.js`, `data/api.js`, `ui/guest/sso.js`, `ui/guest/send.js`,
`index.html`/Vite config (script loading, env), nginx.conf only if CSP needs
provider-domain allowances (coordinate with P5).

Tasks:

1. **Google:** Google Identity Services button → ID token (with nonce) →
   `POST /auth/sessions {provider:"google", idToken, nonce}`. **Apple:** Sign in with
   Apple JS, `response_type=code id_token` (the id_token arrives directly; no code
   exchange, no `.p8` — see SYSTEM_DESIGN §17 2026-07-04 decisions; the
   `for_education/SSO.md` walkthrough of token verification still applies even though
   its BFF-cookie half is v1-historical). Apple sends the name only on first auth —
   pass `displayName`. Only `signIn()` and the identity-panel UI change; token/refresh
   plumbing is untouched.
2. **Identity panel:** provider buttons replace the persona list; dev provider +
   persona shortcuts render only in dev builds. `organizationFor()`'s hardcoded
   email→org table dies; organization name is an input on the apply flow (it's
   application data, not identity).
3. **Turnstile:** widget on the identity panel and apply-send, token threaded into
   `createSession`/`submitApplication` (both currently hardcode `null`). Site key from
   `VITE_TURNSTILE_SITE_KEY`; absent ⇒ widget off (dev). Server fails open without a
   secret, so dev flows are unaffected.
4. **Agreements:** after sign-in, if `GET /me`.agreements lacks the current ToS/privacy
   version, prompt inline in the identity panel; `POST /me/agreements` on accept.
   Current version constants live with the rendered ToS/privacy pages — v2 needs those
   two static pages (plain, from the versioned markdown) if not already present.
5. **Ops runbook note** (doc, not code): Google OAuth client + Apple Services ID
   creation, `Auth__Google__ClientIds`/`Auth__Apple__ClientIds`/`Turnstile__SecretKey`/
   `Auth__Jwt__SigningKey` env in the deployed stack.

**Accept when:** with real client IDs configured in a dev-prod parity run, Google
sign-in end-to-end works (Apple verifiable only in the deployed environment — verify
token-path by unit/manual as far as local allows); Turnstile-enabled runs pass the
widget token through; first sign-in records agreements; dev provider still works with
`DevLoginEnabled` and harnesses stay green.

---

## Phase 5 — Hardening (API idempotency + SPA posture) `[ ]`

**Implements:** D8, D9. **API half pairs naturally with P3; web half after P2.**

Tasks:

1. `[x]` **`Idempotency-Key` on manage creates (API):** `POST /manage/venues` and
   `POST /manage/venues/{id}/rooms` — replay returns the original (mirror the
   applications module's mechanism). Contracts idempotency table updated. Integration
   test: same key twice ⇒ one venue.
   *Built 2026-08-05.* Applications' per-row column + filtered unique index couldn't
   transplant (venues carry no owner column — ownership is `venue_managers`), so the store
   is a small per-user ledger: **new changeset `016-idempotency.sql`**, deviating from this
   plan's "no new changesets" (`design.md` §4). Semantics, error shapes and the malformed-key
   rule the web half must build against: `docs/contracts/manage.md` → "Idempotent creates".
2. `[~]` **Client sends keys + sane timeouts:** the keys landed (quality round
   2026-08-06 — `createManagedVenue`/`createManagedRoom` send `Idempotency-Key`), and
   the `draft.roomId` collision is fixed (`listing.js` mints a `freeRoomId`; the
   CLAUDE.md hazard entry is stale — prune it in P6). **Remaining:** a longer write
   timeout separated from the 4s read default (`api.js` `send()` already takes
   `timeoutMs`; writes still ride the default, and `createManagedVenue`'s own comment
   notes the 4s abort can fire after the server commits); timeout ≠ unreachable in
   `send.js`/`manage.js` classification.
3. `[~]` **nginx.conf:** gzip, security headers and an evidence-based CSP landed
   2026-08-06 (`c84f4ba`). **Remaining:** the Turnstile/Google/Apple script origins —
   add them with P4, which is what needs them. Coordinate: nginx.conf is also touched
   by the build workstream — rebase, don't clobber.
4. `[x]` **`window.__steeple`** gated out of production (quality round 2026-08-06;
   `build:debug`/`build:flat:debug` keep it for suites that drive a built bundle).
5. **SEO reality check (D9):** `docs/SEO.md` was re-marked `✅ v1 (retired) / 🔲 v2`
   on 2026-08-05 — decide + document the crawler-rendering approach and implement only
   the cheap floor now (`robots.txt`, sitemap route wired to `GET /api/v1/sitemap`,
   index-page meta/OG — v2 currently serves none of these and nginx soft-404s
   everything). Larger rendering work gets its own backlog entry, not smuggled in here.
6. **Web analytics batcher (gap found 2026-08-05):** v2 emits zero events — v1's
   `IWebAnalytics` was the web emitter and is retired with it, so the PRD's
   "nothing user-visible ships un-instrumented" commitment is unmet on web. Add a small
   client batcher posting interaction events to `POST /api/v1/events` per the
   `docs/contracts/analytics.md` taxonomy (funnel events `application_started` /
   `sso_started` move client-side; server-authoritative events are unaffected).
   Instrument the surfaces this migration builds (sign-in, inbox, decisions) as they
   land or in this phase — nothing new ships dark.

**Accept when:** double-submit test passes; prod build has no `__steeple`, ships CSP
headers, and the app works under them (CSP violations surface in console — drive the
full flow); SEO.md tells the truth.

---

## Phase 6 — Closing sweep `[ ]`

1. Drive the entire loop on the full compose stack as three humans (guest, new host,
   operator) per the P2/P3 accept scripts, plus: sign-out/sign-in-as-other mid-flow,
   API-down behavior (honest failure), flag-off counter-offers.
2. `dotnet test` + full web-harness pass (documented flags); triage every red as
   app bug / suite-needs-rebaseline / environment before touching anything.
3. Docs closeout per the CLAUDE.md doc map: ARCHITECTURE as-built (web SPA §, Admin §,
   Manage §), CLAUDE.md's "Steeple.Web.v2" section (drop the integration-in-progress
   framing and stale hazards that this migration fixed), prune this plan to a
   phase-history stub in `docs/backlog/README.md`.
4. Confirm nothing here modified build/deploy files owned by the parallel workstream.
5. **Harness hygiene** — moved to Phase 3.6 item 7; verify here that it held (abort a
   run mid-suite → `ps` shows no PPID-1 Chrome processes).
6. **Media base URL is final before real photos exist:** room photo URLs are stored
   **absolute** from `Media:PublicBaseUrl` (P2 finding), so renaming the media host
   orphans every photo already written. Confirm the deployed value, and that nginx's
   CSP `img-src` includes it.
7. **Prune stale hazards** from CLAUDE.md's v2 section as part of the docs closeout —
   at minimum the fixed `draft.roomId` collision (P5 item 2) and any suite hazards
   P3.6 retired.
