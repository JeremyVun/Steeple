# Phase 6 — Reputation & launch hardening (implementation plan)

> **Status:** Backlog, adopted 2026-07-04 (supersedes the retired `ROADMAP.md`'s Phase 6
> entry). Everything before this phase was staging; **the exit of this phase is the public
> launch** in the founder-chosen NoVA suburb. Slices 1–4 are code; slices 5–6 are mostly
> ops. Order within the phase: ratings first (longest signal lead time — a rating needs a
> completed booking to exist), launch checklist last.

## Why this phase exists

The PRD's trust stack ships its last v1 layer here: **ratings + booking history** is the
reputation loop that makes strangers safe to deal with, solves the
declared-vs-actual-activity and unresponsive-admin failure modes, and gives "Maria" a
trust profile that compounds. The rest of the phase is everything that must be true on
the day real users arrive: renewal loop closed, SEO finished, production config real.

## Slice 1 — Ratings & reviews (two-way, post-completion)

The centerpiece. Seams already reserved: `IRatingRepository` module slot (SYSTEM_DESIGN
§4), `bookings 1─* ratings` (§5), `POST /api/v1/bookings/{id}/ratings` 🔲 (CONTRACTS §5),
`rating_submitted` event 🔲 (§7), `ratingReceived` notification type (already in the
enum), `organizer.ratingSummary` comment slot in `ApplicationDto`, and no-show marks
"feed ratings" (Bookings module).

### Product rules

- **Booking-scoped, two-way, one per direction.** The organizer rates the venue; any
  `venue_manager` rates the organizer. Recurring terms get **one rating per direction per
  booking** (per term, not per occurrence — volume stays sane, renewal terms accrue
  fresh ratings). Enforced unique `(BookingId, RateeType)`.
- **Eligibility window:** opens once the booking has ≥1 past non-cancelled occurrence
  (`occurred` **or** `noShow` — a no-show is exactly when a warning rating matters);
  closes **14 days after the booking reaches `completed`/`cancelled`**. A term cancelled
  before anything happened is not rateable (nothing to rate; no-show marks cover
  "never showed").
- **Shape:** `stars 1..5` required, `comment` optional ≤1000 chars. **Immutable once
  submitted** (no edit wars); Admin can hide (moderation below).
- **Double-blind reveal:** a rating stays hidden until *both* directions exist **or** the
  submission window closes — computed **at read time** from the two rows + the window
  (the house lazy-sweep idiom; no reveal job, no state to sync). Prevents retaliation
  ratings. Unrevealed ratings are excluded from all aggregates and public display.
- **No-shows are not ratings** but surface in the same trust summary (count against the
  user, trailing 12 months). The deterrent for free bookings is reputational (PRD).

### Where reputation surfaces

| Surface | What shows |
|---|---|
| Application (provider view) | `organizer.ratingSummary` — `{averageStars, ratingCount, noShowCount, completedBookings}`; null until the organizer has ≥1 revealed rating (Maria's cold start must not render as a red flag — absence of signal, not negative signal) |
| Listing detail (public) | Venue-level average + count (ratee is the **venue**, aggregated across its rooms); revealed comments newest-first, paginated |
| Listing cards (search) | `rating {averageStars, count}` additive field, shown from the first revealed rating (signal is scarce; don't threshold it away) |
| Booking detail (both) | Rate CTA when eligible; own submitted rating; other side's once revealed |

### Data model — changeset `007-ratings.sql`

```
ratings: Id, BookingId FK, RaterId FK users, RateeType int (1 organizer | 2 venue),
         Stars smallint CHECK 1..5, Comment text?, CreatedAtUtc,
         HiddenAtUtc? (admin moderation),
         VenueId FK, OrganizerId FK   ← denormalized at write for cheap aggregates
UNIQUE (BookingId, RateeType); partial indexes on (VenueId) / (OrganizerId) WHERE HiddenAtUtc IS NULL
```

EF config + entity mirrored by hand in Persistence per the schema recipe. Aggregates are
SQL `AVG`/`COUNT` on read at this scale — denormalized summary columns are a later
optimization, not now.

### API (CONTRACTS §5 additions — one commit with Web `ApiModels.cs` + mobile models)

- `POST /api/v1/bookings/{id}/ratings` — `{stars, comment?}`; party-scoped, direction
  inferred from the caller (organizer → venue; venue manager → organizer). Errors:
  `409 invalid_state` (not yet eligible / window closed / already rated),
  `400 invalid_rating`. Per-account `apply` rate-limit policy; no Turnstile (authed,
  relationship-derived).
- `GET /api/v1/venues/{id}/ratings` — public, paginated revealed ratings
  `{items: [{stars, comment?, raterName, createdAtUtc}], …}` for the listing-detail
  reviews section.
- Additive DTO fields: `RoomSummary`/`RoomDetail.rating {averageStars, count}?`;
  `Booking.ratings {byOrganizer?, byVenue?, canRate, rateByUtc?}`;
  `Application.organizer.ratingSummary?` (the reserved slot).
- Notification: `ratingReceived` written **at submission**, content-free ("You received a
  rating — rate back to see it", `deepLink: /bookings/{id}`) — honest under double-blind
  and doubles as the reciprocity nudge.
- Analytics: `rating_submitted` (server) — `rateeType, stars, hasComment` (taxonomy row
  flips 🔲 → ✅).

### Moderation & abuse

Comments are the second public-UGC surface (after photos). Same reactive pattern as the
Phase 5 moderation feed: an Admin ratings panel lists recent comments with hide/unhide
(`HiddenAtUtc`); hidden ratings drop out of aggregates and display entirely. Length cap +
rate limit are the proactive controls; profanity filtering is deliberately not built at
this scale.

### Mobile & web

Web: rate form on booking detail, reviews block on listing detail, summary chip on the
provider's application screen. Mobile: `bookings_repository.dart` already stubs the
ratings call — implement per MOBILE_CONTRACTS seams; fixtures copied from CONTRACTS and
round-trip tested as usual.

### Tests

Unit: eligibility window edges (first occurrence, 14-day close, cancelled-term cases),
double-blind reveal logic, direction inference, aggregate math with hidden rows.
Integration: unique constraint, party scoping (non-party 404), reveal round-trip.
`BookingIntegrityTests` untouched (ratings never mutate bookings).

## Slice 2 — Provider responsiveness surfaced

The PRD's unresponsive-admin failure mode, made visible (the analytics side —
`application_decided.timeToDecisionHours` — already exists; this is the product side).

- Computed from `applications` over a **trailing 90 days**: response rate =
  decided ÷ (decided + expired); median time-to-decision over decided.
- Shown on listing detail as `venue.responseStats {responseRatePercent,
  medianResponseHours, sampleSize}` (additive) — **only at ≥5 in-window applications**,
  else omitted (a new venue must not launch with a scary blank stat).
- Implementation: one aggregate query per venue behind a short in-memory cache (~1h);
  no new tables, no denormalization.
- Admin: same stats as a column on the listings panel — the concierge follow-up signal
  ("this church needs a phone call").

## Slice 3 — Renewal nudge → one-tap rebook

The `renewalDue` nudge (last 14 days of a recurring term) exists; this closes the loop so
acting on it doesn't mean re-typing the application. Request→approve is **preserved** —
rebooking creates a pre-filled application, not a booking (bookings are only ever created
by approval; that invariant stands).

- `POST /api/v1/bookings/{id}/rebook` — `{startDate, endDate}` (client defaults: same
  weekday/times, term length repeated, starting after the current term). Organizer-scoped;
  allowed once the renewal window opens (nudge sent) or ≤30 days after `completed`;
  `409 invalid_state` otherwise or when an undecided renewal application already exists.
  Creates a new application copying room/activity/groupSize/schedule times with
  `renewalOfBookingId` set. `Idempotency-Key` honored; `apply` rate limit; **no
  Turnstile** (authed, relationship-derived — same stance as messages).
- Provider view: the application renders a renewal banner ("renewal of a term that
  completed with N occurrences, 0 no-shows") — `Application.renewalOfBookingId?`
  additive. Approval runs the normal booking transaction, so **availability is re-checked
  by the exclusion constraint for free**.
- Auto-approve-renewals (per-venue toggle) is deliberately deferred — provider control is
  the product's trust posture; revisit with continuation data.
- Analytics: `application_submitted` gains `isRenewal`; the funnel to watch is
  `renewalDue` sent → rebook submitted → approved (the PRD's continuation metric).

## Slice 4 — Stale-application expiry tuning (data-driven)

Keep the 14-day lazy expiry sweep. Add: a one-time **"expires soon" provider warning** at
T−3 days, written when any sweep-triggering read observes an unwarned near-expiry pending
application (inbox row + email fan-out; organizers polling their own application detail
also trigger it, which is the common case in practice). Tune the 14-day window itself
against real time-to-decision data after launch. If the data shows warnings systematically
not firing (nobody reads → nobody sweeps), adopt pg_cron/worker behind the same statuses —
the escalation path the decision log already reserved (SYSTEM_DESIGN §17, 2026-07-04
lazy-sweep entry).

## Slice 5 — SEO completion (`SEO.md` owns the checklist)

- **Area landing page** — `/halls/{area-slug}` (SEO.md item 7) backed by
  `GET /api/v1/areas/{slug}` (CONTRACTS §3 planned addition): area name, copy, listing
  grid. Implemented off the single `Geofence` config section — the `areas` *table*
  arrives only with Area #2 (Phase 7); don't build it early.
- Close the **sitemap `lastmod` caveat** (SEO.md item 1) — verify rooms/venues
  `UpdatedAtUtc` is actually threaded into `SitemapEntry` (ARCHITECTURE says built,
  SEO.md's caveat predates it; reconcile and tick).
- **Search Console + Bing** verification and sitemap submission (item 9); re-validate
  JSON-LD on a free and a paid listing; CWV field pass against the deployed environment.

## Slice 6 — Launch: beachhead swap + production checklist

**Beachhead swap:** founder picks the launch suburb → update the `Geofence` config
section (one config change by design) → concierge-onboard the supply cluster (target per
PRD: a dense cluster before any demand push) → purge demo seed data from production
(keep `renovation-annex`-style Draft-visibility proof in dev/test seeds only).

**Ops carry-overs** (absorbed verbatim from the retired ROADMAP — none are code):

| Carry-over (origin) | What must happen |
|---|---|
| Flags SDK wiring (Phase 0) | SDK source lives outside this repo; wire Api/Web/Admin to it when it lands here. Config-backed `IFeatureFlags` (same key names) meanwhile |
| Production SSO (Phase 1) | Create Google OAuth client + Apple Services ID; set them + Turnstile keys + production `AUTH_JWT_SIGNING_KEY` + `WEB_SIGN_IN_ENABLED=true`; verify both providers end-to-end in production; confirm sessions survive a deploy (DataProtection volume `steeple_web_keys`) |
| Real-hands demo (Phases 2–3) | Set `Email__ApiKey`/`Email__From`; flip `web.apply_from_browser`; link concierge venue managers in Admin; drive apply → church emailed → approve → organizer notified with a real church + organizer; confirm `application_decided.timeToDecisionHours` visible in Grafana |
| Production provider self-service (Phase 5) | Set `GEOCODING_GOOGLE_API_KEY` (real geocoding replaces the stub) + `MEDIA_*` Spaces credentials (uploads land on Spaces/CDN, closes the dev loopback-port deviation); flip `WEB_MANAGE_ENABLED=true` (+ `MOBILE_MANAGE_ENABLED=true` once the mobile build ships); register the DMCA agent with the Copyright Office (takedown path itself already exists) |
| Mobile release (Phase 4) | Firebase project + config files; Google Maps + SSO client ids; Xcode signing/entitlements; official Google sign-in brand asset; TestFlight (founder + first organizers) → App Store; Android closed testing (founder's testers); profile against MOBILE_DESIGN §4 budgets on real devices |

**Launch-day hygiene:** uptime monitor → phone confirmed firing; one restore drill from a
production `pg_dump` (untested backup ≠ backup); Grafana dashboard for the launch funnel
(searches, zero-result rate, applications, time-to-decision); rate-limit and Turnstile
sanity pass; ToS/Privacy versions final.

## Exit criteria

- Public launch live in the chosen suburb: real churches published, real organizers
  applying, zero founder involvement in the loop beyond Admin publish-approve.
- Ratings loop functioning end-to-end (first real two-way ratings recorded and revealed);
  response stats rendering for seasoned venues.
- Renewal continuation measurable (`renewalDue` → rebook funnel flowing).
- SEO checklist fully ✅ (area page indexed, Search Console reporting).
- Mobile app live on TestFlight/App Store; Android closed testing running.

## Doc/contract discipline for this phase

Every slice follows the standing recipes: CONTRACTS §1 checklist for the new
endpoint/DTO shapes (API + Web `ApiModels.cs` + mobile models + fixtures in one commit),
taxonomy table for `rating_submitted`/`isRenewal`, ARCHITECTURE.md gains the Ratings
module section as it lands, deviations → SYSTEM_DESIGN §17. Risky surfaces behind flags:
`web.ratings`, `web.rebook` (clean up once stable).
