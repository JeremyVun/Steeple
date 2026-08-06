# Web v2 production migration — design

> **Status:** Adopted 2026-08-05 (owner decision, this doc is authoritative for the
> migration). Companion: `build_plan.md` (phased execution). Read both before touching
> anything; they are written to be self-sufficient for a fresh agent session alongside
> `CLAUDE.md` and `docs/contracts/`.

## 1. Context — where we are and what this migration is

`Steeple.Web.v1` (ASP.NET MVC + HTMX BFF) is deprecated. `Steeple.Web.v2` (Vite +
vanilla JS + Leaflet SPA, Three.js splash) is the active web surface, born as the
"animated-web" experiment and consolidated 2026-08-05. Build/deploy consolidation
(Dockerfiles, compose, bake) is handled in a separate workstream — **do not touch build
scripts from this plan**.

v2 is a *prototype wearing production clothes*. A 2026-08-05 audit (API surface, web
account state, Admin responsibilities) established:

- **The API is essentially complete.** SSO (Google/Apple ID-token verifiers, fail-closed
  without client IDs), token rotation with reuse-revocation, server-side sign-out
  (`DELETE /auth/sessions`, `DELETE /me/sessions`), account deletion (`DELETE /me`),
  agreements, and the **entire** application lifecycle (`GET /me/applications`,
  `GET /manage/applications`, `GET /applications/{id}`, `/messages`, `/decision`,
  `/withdraw`, `/counter-offer[/respond]`) are built and documented ✅ in the wire
  contracts. Do not rebuild any of it.
- **v2 runs two identity systems that never meet.** `src/data/session.js` owns the real
  token pair; but the inbox, its badge, every letter, and every host decision run on
  `src/data/store.js` — a localStorage demo hardcoded to `GUEST_ID='maria-alvarez'`
  regardless of who is signed in. `GET /me/applications` is wired in `api.js` and never
  called. Signed-out visitors see "Inbox 2" of seeded demo letters with no way to sign
  in or out from the header.
- **Admin is mostly dead weight.** Its users/analytics/flags panels are in-memory mocks
  or read tables nothing writes; its login/MFA screens are non-functional theater (real
  access control is authelia at the edge). Exactly two actions are load-bearing:
  first-publish approval and venue identity verification.

No one uses Steeple yet. **Backwards compatibility is a non-goal** — refactor freely,
including breaking `/api/v1` shapes, provided all clients (web v2 + `/mobile`) update in
the same commit per the contracts governance rules.

## 2. Decisions (authoritative)

Each is logged here once; the build plan references them as **D1…D9**. When implemented,
record in `SYSTEM_DESIGN.md` §17 and update as-built docs per the CLAUDE.md doc map.

### D1 — SSO-only identity; no account keeping beyond the existing minimal model

Google + Apple sign-in only (dev provider stays, gated by `Auth:DevLoginEnabled`,
Development-only — it is the local dev and test-harness path and must keep working).
The Persistence model already matches: one `users` table (display name + nullable
email), `user_logins (Provider, Subject)`, no credentials ever, `DELETE /me`
anonymizes. **No schema changes for identity.** The client work is wiring Google
Identity Services + Sign in with Apple JS into the existing
`POST /auth/sessions {provider, idToken, nonce?, displayName?}` call — `session.js` was
built so only `signIn()` changes.

### D2 — One human gate: a new host's first listing goes "under review"

> Superseded 2026-08-06: approval is scoped to the venue, not the host; every newly claimed
> venue waits for its first decision. See `docs/contracts/manage.md` and SYSTEM_DESIGN §17.

Owner decision 2026-08-05, superseding the two-step moderation model (separate venue
verification + per-room publish approval):

- **Trusted host** = a user who already manages at least one room with
  `FirstPublishedAtUtc` set. Derived, not stored — no schema change. (Rejected
  alternative: an explicit `users.TrustedHostAtUtc` column; adds a changeset for no
  present benefit. Revisit if trust ever needs revocation independent of listings.)
- **Publish request by an untrusted host** → room stays unpublished,
  `PublishRequestedAtUtc` stamped (existing "under review" state, unchanged wire
  semantics: room reads as `draft` + `publishRequestedAtUtc` to its manager).
  An operator reviews the listing (photos, details, verification evidence if submitted,
  and the founder's own knowledge of the church) and makes **one decision**:
  - **Approve** → sets `Venue.IsIdentityVerified = true`, `Room.Status = Published`,
    stamps `FirstPublishedAtUtc`, writes the `listingApproved` inbox notification. The
    host is now trusted.
  - **Decline** → clears `PublishRequestedAtUtc`, records the note, writes
    `listingDeclined` with the note. Host can fix and resubmit.
- **Publish request by a trusted host** → **auto-publish immediately** (set
  `Published` + `FirstPublishedAtUtc`, and `Venue.IsIdentityVerified = true` on the
  venue if not already — the badge means "belongs to a vetted host"; the invariant
  becomes *published ⇒ venue verified*). Applies to new rooms on existing venues **and**
  entirely new venues created by a trusted host.
- The automatic gates apply to everyone, before either path: ≥1 photo (`no_photos`),
  open hours (`no_open_hours`, behind `manage.open_hours_required`), geofence.
- The separate venue-verification *decision* is retired. The evidence-submission flow
  (`venue_verification_requests` + documents) **stays** as the way a host attaches
  proof for the review; it no longer has its own approve/decline — the first-listing
  decision consumes it. Approval does not require a formal evidence submission (the
  founder often verifies out-of-band; PRD's fraud-prevention commitment is satisfied by
  the human review itself).
- Everything after the first approval is self-serve forever: unlist/relist, edits
  (still stamping `ProviderEditedAtUtc` as a dormant abuse-response seam — see D3).
- **Where the rule lives: `ManageService` (the API), single enforcement point.** Today
  the publish flip lives in Admin's `PostgresAdminWorkspace` while `ManageService` only
  stamps the request — that split already produced a drift bug (Admin's bulk listing
  status write bypasses verification entirely). After this change the API owns the whole
  rule; Admin's decide action performs only the operator decision.

### D3 — Admin shrinks to the review queue

Keep `Steeple.Admin` as a deployable (authelia-gated, direct Persistence reads — the
documented pattern), gutted to:

1. **Review queue** (the moderation panel, reduced): pending first-listing requests —
   listing preview (photos, details, price, hours), venue info, any submitted
   verification evidence, approve/decline + note. This is the only steady-state screen.
2. **Venue-manager linking** (kept): the concierge step that attaches a signed-in
   church account to a pre-seeded venue. Load-bearing only for the concierge-seeded
   supply model, which remains the GTM plan. One small form.
3. **Rating hide/unhide** (kept): the one content-moderation lever; already real.

**Delete:** users panel (in-memory mock), analytics panel (reads a table nothing
writes — Loki superseded it), feature-flags panel (mutates a disconnected mock),
login/MFA/trusted-devices screens (non-functional; authelia is the real gate),
application force-status repair (recreate as a psql runbook note if ever needed),
**bulk listing status changes** (the invariant-bypassing write), the
`ProviderEditedAtUtc` review feed screen (keep the column + stamping; the partial index
stays as the abuse-response seam).

Admin keeps its existing patterns: `Remote-User` attribution, direct inbox-row
notification writes on decisions, `listing_moderated` stdout analytics line.

### D4 — Server is truth for correspondence; store.js becomes a cache

The guest inbox, guest letters, host desk, and every decision move onto the existing
API endpoints. `store.js` survives as (a) the client-side cache/mirror of server
responses (its `fromWireApplication`/`fromWireRoom` translators already exist and its
state machine mirrors `004-applications.sql` faithfully), and (b) the offline demo seed
**in dev builds only**. `GUEST_ID` dies: identity comes from `session.currentUser()`.
The host desk is scoped by `GET /manage/venues` (already in `api.js`, unused for this)
— no venue selector over seeded venues, no host mode without a managed venue (visitors
without one get the "list your space" path, which is the existing listing flow).

### D5 — Honest offline; no silent local filing

Today `send.js` files an application locally when the API is unreachable and the UI
says "your request is on its way" (`live: false` is returned and no caller reads it).
In production that is a lie. Decision: **submissions require the API.** On failure the
draft is preserved (it already lives in the store) and the UI says so plainly
("Steeple couldn't be reached — your letter is saved as a draft here") with a retry.
The same stance applies to decisions/messages: no optimistic local state that claims
server truth. The bundled-catalog fallback for *reads* stays (browsing a cached map is
honest; inventing correspondence is not).

### D6 — The account surface is always present

- Signed out: a quiet header affordance ("Sign in") opens the same identity panel the
  flows use. The Inbox tab, badge, and every "Identity verified (SSO)" chip render only
  when signed in (chips only when factually verified).
- Signed in: the existing chip/card with one standard Sign out action for this browser.
- Sign-out calls `DELETE /auth/sessions` (server-side revocation), then clears local
  state. The store key becomes per-user (`steeple-village-store:{userId}`) so shared
  browsers never leak correspondence between accounts; sign-out drops the in-memory
  copy and returns every surface to its signed-out state.
- Session death (refresh failure) surfaces a small "signed out" notice instead of a
  silently vanishing chip.

### D7 — Production auth hygiene ships with SSO

- **Turnstile widget** client-side on sign-in and application submit (the API already
  verifies when `Turnstile__SecretKey` is set; the client currently hardcodes
  `turnstileToken: null`). Site key via Vite env (`VITE_TURNSTILE_SITE_KEY`); absent =
  widget off (dev).
- **ToS/Privacy acceptance** recorded via `POST /me/agreements` at first sign-in
  (versioned; `GET /me` returns what's accepted — prompt when the current version is
  missing).
- Demo persona one-tap buttons and "any address works here" copy in `sso.js` are
  dev-only (`import.meta.env.DEV`).
- Ops config (deploy-time, not code): `Auth__Google__ClientIds`,
  `Auth__Apple__ClientIds`, `Turnstile__SecretKey`, production `Auth__Jwt__SigningKey`.
  All currently empty ⇒ providers and Turnstile are inert until set. (The phase-6
  checklist's `steeple_web_keys` DataProtection item is a stale v1-BFF concern — v2
  keeps tokens in localStorage; drop it.)

### D8 — Idempotency on manage creates

`POST /manage/venues` and `POST /manage/venues/{id}/rooms` gain `Idempotency-Key`
support server-side (same replay-returns-original semantics as applications), and the
web client sends keys. This closes a live double-create hazard: every v2 write uses a
4s abort timeout, and a timed-out create retried by the user creates twice. Also:
raise/differentiate the client write timeout (reads 4s; writes 15s) and stop treating
timeout as "unreachable".

### D9 — SPA hardening & SEO honesty

- CSP / `X-Frame-Options` / `Referrer-Policy` headers in v2's nginx.conf (tokens in
  localStorage are only acceptable behind a real CSP).
- `window.__steeple` (exposes the whole store incl. `resetDemo()`) gated on
  `import.meta.env.DEV`. It is load-bearing for `tools/*.mjs` — harnesses run against
  dev builds, adjust if any drives a production build.
- **SEO reality check:** `docs/SEO.md`'s ✅ marks were earned by v1's server-rendered
  pages. v2 is client-rendered — per-listing meta, JSON-LD, and OG tags do not
  currently exist for crawlers. SEO is load-bearing (share-driven acquisition), so the
  migration must re-decide the mechanism (options: nginx prerender for bot UAs, a tiny
  meta-injection middleware, or accepting degradation until traffic justifies more).
  Scoped as an investigation + decision task in the build plan, not pre-decided here.

## 3. Target flows (post-migration, for orientation)

- **Visitor:** village splash → map → listing panels. Quiet "Sign in" in the header.
  No inbox tab, no verified chips, no host desk. "I have space to share" → listing
  flow, which requires sign-in at the Verify step (unchanged).
- **Guest:** applies (draft → identity step if signed out → Turnstile → real submit
  with idempotency key). Inbox tab shows *their* applications from
  `GET /me/applications`; letters show the real thread; withdraw / counter-accept /
  counter-decline / messages all hit the wire and re-mirror the response.
- **Host:** desk appears only when `GET /manage/venues` is non-empty, scoped to those
  venues. Incoming requests from `GET /manage/applications`; approve (→ real booking,
  `409 slot_taken` surfaced honestly), decline, ask (message), counter-offer — all
  wire. First listing: publish → "under review" state (already rendered by
  `manage.js publishState()`) → operator approves → `listingApproved` notification.
  Trusted host: publish → live immediately.
- **Operator (founder):** authelia → Admin review queue, a few times a week. Approves
  new hosts; everything else runs itself.

## 4. Wire-contract deltas

Governance: every delta follows the contracts governance checklist (contracts doc +
API + web `api.js` + mobile models/fixtures in one commit).

1. **Moderation model (D2):** `PATCH /manage/rooms/{id} {status: published}` for a
   trusted host now returns the room `published` immediately (was: always review for
   first publish). The under-review representation is unchanged. Venue-verification
   *decision* endpoints/screens retired; evidence submission unchanged. Contracts §6
   moderation-model section rewritten to the single-gate rule.
2. **Idempotency (D8):** `Idempotency-Key` honored on `POST /manage/venues` and
   `POST /manage/venues/{id}/rooms`. Additive.
3. **No new endpoints for correspondence** — the client adopts existing ✅ endpoints.
4. **Analytics:** decisions/publishes already emit server-side events; add an
   `auto_published` dimension (or equivalent) to the existing listing-moderation event
   rather than a new event; extend the §7 taxonomy accordingly. Client interaction
   events for the new header affordance per the existing taxonomy process.

Schema: **no new changesets.** (Trusted-host is derived; everything else uses existing
columns. The idempotency store for manage creates reuses the pattern/table approach the
applications module already uses.)

## 5. Explicitly out of scope

- Payments, verified-badge productization, phone OTP, multi-area (own backlog docs).
- Rebuilding v1's ratings web UI on v2 (v2 has only `rating` typedefs in `api.js`) —
  real gap, tracked in phase-6 Slice 1's caveat, not this migration.
- Mobile feature work. Mobile keeps compiling against unchanged contracts; only if a
  §4 delta touches a shape mobile consumes do its models/fixtures update (same commit).
- Cross-provider account linking (stays `409 use_original_provider`).
- Replacing the flags SDK, telemetry, or any deployed-infra service.
- Web v1 code removal (separate build-consolidation workstream owns the solution/build
  surface).

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Two workstreams touching compose/build files | This plan never edits build files; verify with `git status` before committing |
| Harness suites encode demo-store behavior (`tools/*.mjs`, `store-test.mjs` gates `GUEST_ID` semantics) | Each phase's brief re-baselines affected suites; a suite asserting demo behavior that D4/D5 removes is *updated with the product*, not preserved. Run each suite with its header-documented flags — inverting them produces convincing, meaningless failures |
| Approve path touches booking creation | `BookingIntegrityTests` (concurrent-approval exclusion) must stay green — non-negotiable |
| Dev geocoding stub sends every address to the village centre | Geofence-rejection paths are unreachable locally; don't "fix" silently-passing geofence tests against the stub |
| `draft.roomId` hardcoded `'main-space'` in the listing flow | Second room per venue collides — fix rides along in the phase touching the listing flow |
| SPA SEO regression vs v1 | D9 investigation task; at minimum keep sitemap + robots correct at launch |
