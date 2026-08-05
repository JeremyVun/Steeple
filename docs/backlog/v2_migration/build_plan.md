# Web v2 production migration — build plan

> Companion to `design.md` (decisions D1–D9; read it first — this plan does not repeat
> the rationale). Each phase is a self-contained brief: scope, files, tasks, acceptance
> criteria, verification. Phases assume the repo state of 2026-08-05; re-verify any
> "today" claim against code before building on it. Update this doc (check boxes, prune)
> as phases land; record deviations in `SYSTEM_DESIGN.md` §17.

**Dependency graph:** P1 → P2 → (P4) are sequential on the web surface. P3 (API/Admin)
is independent of P1/P2 and can run in parallel with them. P5 depends on P2 (timeout
work touches the same send paths) but its API half (idempotency) can pair with P3. P6
is the closing sweep and runs last.

**Every phase:** `dotnet test` green (unit instant; integration needs Docker);
anything touching approval keeps `BookingIntegrityTests` green; drive the real flow
(`docs`-map "Build / run / verify" recipe in `CLAUDE.md`) — compiling is not done;
update the owning docs (CLAUDE.md doc map) in the same change. Web harness suites in
`src/Steeple.Web.v2/tools/*.mjs` each document their own flags/env in their header —
run them exactly as documented. Known-stale failures predating this work: guest-test 3,
wave2-test 6, world-test 12.

---

## Phase 1 — Signed-out truth & the account surface (web) `[ ]`

**Implements:** D6, and the visible half of D4's "no demo data for strangers".
**Touches:** `src/Steeple.Web.v2/src/ui/account.js`, `ui/guest/index.js`,
`ui/guest/journal.js`, `ui/host/index.js`, `ui/host/desk.js`, `data/session.js`,
`data/store.js`, `data/api.js` (sign-out call), `ui/index.js`.

Tasks:

1. **Header affordance, both states.** Signed out: quiet "Sign in" chip where the
   account chip sits (`account.js:107` currently hides the element entirely); opens the
   same identity panel the flows use (`ui/guest/sso.js`). Signed in: existing chip/card;
   add "Sign out everywhere" (`DELETE /me/sessions`) to the card. Match the design
   system — calm, never a nav bar bolted on.
2. **Server-side sign-out.** `api.js` gains `deleteSession()` (`DELETE /auth/sessions`,
   bearer) and `deleteAllSessions()`; `session.signOut()` calls the former best-effort
   (revocation failure must not trap the user signed in locally).
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

---

## Phase 2 — Correspondence onto the wire (web) `[ ]`

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
   synthetic 08:00–22:00 seed (`weekCard.js` ← `store.openHoursFor`).
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

1. **`Idempotency-Key` on manage creates (API):** `POST /manage/venues` and
   `POST /manage/venues/{id}/rooms` — replay returns the original (mirror the
   applications module's mechanism). Contracts idempotency table updated. Integration
   test: same key twice ⇒ one venue.
2. **Client sends keys + sane timeouts:** `createManagedVenue`/`createManagedRoom`
   send keys; write timeout 15s separated from read 4s (`api.js:25`); timeout ≠
   unreachable in `send.js`/`manage.js` classification. Fix `draft.roomId`
   always-`'main-space'` (second room per venue collides) while in the listing flow.
3. **nginx.conf:** CSP (allow self + API + map tiles + Turnstile/Google/Apple script
   origins as P4 requires), `X-Frame-Options: DENY`, `Referrer-Policy:
   strict-origin-when-cross-origin`. Coordinate: nginx.conf is also touched by the
   build workstream — rebase, don't clobber.
4. **`window.__steeple`** gated on `import.meta.env.DEV` (`main.js:38-52`); confirm
   every `tools/*.mjs` harness runs against dev builds.
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
