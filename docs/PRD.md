# Steeple — Product Requirements Document

> **Status:** Draft — sections resolved through discovery; the **POC scope, architecture, and stack are decided.** One **Open Question** remains (demand channels — needs founder input); other deferred items are recorded as **Deferred Decisions**. Pending product-owner sign-off.

---

## Overview

Steeple is a hyperlocal, two-sided marketplace that connects religious institutions (starting with churches) that have **underutilized rooms and halls** with **community-centric organizers** — schools, non-profits, hobbyists, and event runners — who need affordable, nearby space to rent.

The idea was born from real-world friction: in 2017, while scouting a location for a school's next campus, the founder had to drive around and physically "door-knock" churches to figure out, manually, whether their buildings would suit the school's use. Along the way, she discovered the other side of the problem too — churches were *actively trying to advertise* spare space and asking her to "spread the word." Both sides wanted to find each other and had no channel to do it.

Steeple digitizes individual church rooms into a searchable database and bridges underutilized religious infrastructure with local community need through a low-risk, success-based partnership model.

_Formal market-sizing is deferred — at POC stage, the build itself is the validation. The qualitative evidence is the founder's lived 2017 experience (door-knocking churches to find a campus) and churches actively asking her to advertise their spare space._

## Solution

Steeple removes the need for community organizers to manually hunt for and cold-contact venues, and removes the need for churches to find a channel for their spare capacity. Instead of door-knocking — or paying the premium charged by specialized event-venue middlemen who corner both the supply and demand side — organizers search a database of real, available, nearby spaces and book them directly.

The product's distinctive value is **matchmaking spare "hall" capacity with people who need community-centric space**, within a tight geographic radius. Unlike Airbnb or real-estate search, both the *organizer* and their *participants* are location-bound, so relevance is defined by proximity and fit, not breadth of selection.

**Positioning — community first, not commercial first.** Steeple deliberately leads with a community feel and mission, rather than positioning as a commercial venue-booking tool. The founder's bet is that this resonates with a large, currently *unserved* community-centric subset of the market — and that "community first" is both the brand and a go-to-market wedge that commercial venue platforms cannot credibly occupy.

In practice, "community first" means two things rather than a hard membership gate:
- **Feel & price** — warm, affordable, non-corporate; experienced more like a community noticeboard than a SaaS booking engine. **"Find free community space" is a hero marketing angle** for organizers with little or no budget.
- **Trust** — both sides are vetted and values-aligned. The church knows who is using its valued/sacred space; the organizer knows the space is legitimate. (This is where the "Gates" live.)

Notably, Steeple likely does **not** need to hard-exclude commercial users, because **low cost is itself the gate**: nobody books a church hall for a corporate workplace meeting when WeWork exists. Price self-selects the community-centric audience.

**Booking is request → approve, not instant-book.** A supplier (e.g. a church) will not auto-accept every applicant. Steeple supports an **application and approval flow with intent-matching** — surfacing the requesting group's activity, size, frequency, and purpose so the supplier can decide. A church might, for instance, grant its hall to a Christian youth group for free.

**The flywheel:** more consumers → more demand for space → more suppliers list → more options → more consumers.

```
  Supplier  →  [ Gate ]  →  Steeple  ←  [ Gate ]  ←  Consumer
 (churches)   (trust/legal/      (listings)    (trust/legal/   (community
              insurance/ops)                    insurance/ops)  organizers)
```

**The "Gates" (hypothesized moat):** the trust and risk layer between each side and the marketplace — insurance, legal, regulatory, operational, and contractual handling. This is where Steeple's defensibility and core value-add are believed to live. _Detailed in **Trust & Safety** below._

## Business Model & Ambition

**Ambition:** Steeple is a **lean, home-grown, mission-driven startup — explicitly not VC-backed.** The goal is a flourishing community platform that sustains itself (and supports the founder) — *not* a hyper-growth, capital-intensive company. Money flowing through the platform is **one of several indicators of success, not the sole north star.**

**Low cost is a survival *advantage*, not a moat.** Running lean (~$100 AUD/month) buys runway to find product-market fit and lets Steeple serve free/near-free inventory a burn-heavy rival won't bother with — but it **defends nothing by itself** (it's cheap for anyone to replicate, including a funded incumbent running a subsidized "community tier"). **The real — and admittedly narrow — moat is community embeddedness + local supply density + the founder's existing NoVA church/school relationships:** defensible in *one* metro, but slow and **re-earned per metro** (which is also why multi-city expansion is structurally hard, not merely "later"). _Consistent with the competitive read below._

**Pricing starts at $0.** Free inventory is the **acquisition engine**, not the revenue engine — the most emotionally resonant, lowest-cost way to build density and reach PMF. Revenue comes from the slices *on top* of free:

- **Thin, invisible commission on *paid* bookings** — folded into the contract price, Airbnb-style, never made salient.
- **Trust-as-a-service (primary seam):** paid **"verified" badges** / vetting for suppliers and consumers. This directly monetizes the "Gates" — people pay for trust where the stakes are personal and strangers are involved (e.g. letting outsiders into a church).
- **Possible later seams:** insurance facilitation, sponsorship/grants (fitting the community mission), optional premium features.

**Hypothesis to test (not a v1 mechanic):** a reciprocity / credits model where providing free supply earns access to free supply. _Caution: most participants are either pure suppliers (churches) or pure consumers (organizers); the "prosumer" population may be too thin to anchor a launch around._

## Trust & Safety — "The Gates"

The "Gates" are Steeple's moat: the trust layer that makes the marketplace safe to spin. The asymmetry matters — **supplier trust is largely solved** (churches are fixed, verifiable, contactable institutions), so the hard problem is **consumer-side trust**, threading between two opposite failure modes:

- **Ghost / troll requests** — spam applications that never show up, which poison the supplier experience quickly.
- **Genuine-but-uncredentialed users** — e.g. "Maria": real, broke, no track record. **Must not be excluded** — she is the hero user.

The 1:1 "talk it out" approach works but **does not scale** when a church receives hundreds of applications.

**Guiding principle: delegate trust, don't custody it.** Airbnb's "working credit card" works because identity is verified and stored by the *payment processor*, not Airbnb. Steeple's twist: **the free hero use case removes the card, and with it the natural anti-troll gate** that paid marketplaces get for free. The design problem is therefore: *get the credit-card filtering effect without a transaction and without becoming a KYC/PII data custodian.*

**Layered, delegated, tiered trust stack (friction scales with stakes, not imposed universally):**

| Layer | v1? | Mechanism | Notes |
|---|---|---|---|
| Identity / anti-spam (**primary**) | **v1** | **SSO — Sign in with Google / Apple**, at the *apply* step (not signup) | **Free, low-friction** — a *reasonable* identity signal (raises troll cost, esp. paired with the written application), but **not** phone/card-grade (Google accounts can be minted at scale). Native in ASP.NET Core Identity. **v1 also puts Cloudflare Turnstile + per-IP rate-limits on the *apply* endpoint** (per-*account* limits alone fall to N accounts). |
| Application as filter | **v1** | Short written intent (activity, group size, frequency) + per-account rate limits | Trolls don't write thoughtful applications at scale. |
| Reputation | **v1** (ratings); vouching later | Ratings + booking history; bootstrap new genuine users via **community vouching / org-affiliation** | On-brand for community-first; stores no sensitive data. Solves Maria's cold-start. |
| Phone/OTP step-up | **escalation (later)** | SMS OTP via Twilio/Plivo Verify | A *paid* real-world-identity signal — **off the MVP critical path.** Reserve for higher-stakes bookings (recurring, children). Phone *number* can be collected unverified for contact; OTP-verify only when stakes justify the cost. |
| Payment-method-on-file | later | Card authorizing a refundable **no-show hold**, even for free bookings — **only when stakes justify it** | Stripe verifies & stores; Steeple stores nothing. Reserved for higher-stakes bookings so cardless users aren't blocked from free/low-stakes ones. |
| Paid "Verified" badge | later | Identity verification via 3rd-party provider (Stripe Identity / Persona) | The monetizable top tier; **Steeple never stores raw IDs.** |

**Unifying rule:** *tier the friction to the risk of the specific booking.* One-off free booking of an open hall → light (SSO + application + ratings). Recurring booking involving children in a church → escalate hard (e.g. phone OTP step-up).

**v1 default:** ship the **light tier** — **SSO (Sign in with Google/Apple) + written application + ratings** — which is free and low-friction. **Phone OTP is a *paid step-up*, not the default gate**, reserved for higher-stakes bookings; escalate only where the instrumented drop-off/abuse metrics show a real problem. Don't over-gate (or over-spend) before the data does.

**Safeguarding (must design for early, not later):** many activities involve **children and vulnerable people on church premises**, bringing **safeguarding / background-check** obligations into scope. Heavy, but real — and a potential value-add Steeple could facilitate. **Decision:** v1 stays neutral-platform and **excludes background-check/safeguarding workflows** (see Out of Scope); jurisdiction-specific obligations are researched **before** any child-focused vetting feature or Option B.

**v1 framing for child activities (decided — Option A): keep *children* as an activity type, but don't overclaim trust.** (1) The listing's indicator shows only **"Identity-verified (SSO)"**, never "vetted"/"safe". (2) A clear **disclaimer**: *Steeple does not vet users or run background checks — the church is responsible for its own safeguarding* (churches hosting children's activities are already the duty-bearers and typically have their own child-protection policies). (3) Churches can surface **their own** requirement (e.g. *"background check / safeguarding policy required for children's activities"*). A real **vetting/background-check program is a separate spin-off workstream** — genuinely needed, but out of PRD scope beyond a **link-out** (future `docs/vetting-program.md`).

**Liability & insurance stance — v1 = neutral platform (Option A).** Steeple is a **neutral matchmaker, not a party to the booking**; the agreement is between organizer and church. The ToS disclaims accordingly, organizers attest their own coverage, and churches rely on their existing insurance. **Option B (future, monetizable):** Steeple brokers/provides insurance and damage **bonds** as a premium layer of the Gates (the SpaceToCo model) — deferred until trust and volume justify the added liability surface.

## Goals & Metrics

**POC reality:** Steeple is at proof-of-concept stage — the immediate goal is to **ship something usable to put in real hands**, not to hit predefined growth targets. **Strategic / mission success metrics** (what "flourishing" means, 3- and 12-month targets, the north-star number) are **deliberately deferred to the founder — "wait and see"** once there is real usage to judge against. Setting arbitrary targets pre-PMF would mislead more than guide.

**What we *do* commit to now: instrument the funnel.** Wire an analytics stream from day one (GA4/Firebase Analytics, self-hosted PostHog, or simply logging events to your own Postgres — the last best fits the no-lock-in ethos) so the data already exists when the founder is ready to evaluate. The job now is simply that **nothing important goes un-instrumented.** Diagnostic, technically-measurable metrics:

**Demand funnel (per session):**
- Installs / first opens; returning users (D1/D7/D30 retention cohorts).
- Map browses without account; listings viewed per session.
- Searches performed (+ filter params: activity, group size, day/time, free vs. paid).
- **Liquidity proxy:** % of searches returning ≥N nearby results — and searches returning **zero** (the supply-gap signal).
- Listing-detail view → application started → **application submitted** (drop-off at each step).
- **SSO sign-in started → completed** (friction/drop-off at the auth gate — a key tunable).

**Booking & trust loop:**
- Applications by outcome: approved / declined / no-response; **time-to-decision**.
- Bookings confirmed — **one-off vs. recurring** split.
- Recurring-booking continuation vs. cancellation; no-show marks; cancellations (both sides).
- Ratings submitted; notification sent → opened rates.

**Supply health:**
- Listings created; rooms per church; time-to-first-application per listing.
- Church-admin **response rate & response time** (makes the unresponsive-admin failure mode visible).
- Geo-fence: in-area vs. rejected out-of-area requests.

_Targets and the mission north-star are intentionally left for the founder to set once real data flows._

## Users & Personas

- **Supply — Church / religious institution:** has underutilized rooms/halls, wants to advertise spare capacity and earn from it (or grant it to aligned groups), but lacks a channel and is cautious about risk and *who* uses its valued space. Wants control via approval, not auto-booking.
- **Supply (secondary) — Government / public community spaces:** a bootstrap supply vector to seed inventory and density early.
- **Demand — Community organizer:** schools, non-profits, hobbyist groups, event runners who need affordable, nearby space and are highly location-bound.
- **Demand (budget-constrained):** organizers with little or no money for whom *free* space is the primary draw — a key marketing wedge.

Differentiated needs, motivations, and frictions are expressed in the **User Stories** below. The two primary v1 personas are the **Organizer** (demand) and the **Church admin** (supply); the budget-constrained free-seeker and government/public supply are secondary personas for later.

## User Stories

Kept deliberately simple for v1. Two primary personas — the **Organizer** (consumer / booker / searcher, e.g. "Maria") and the **Church admin** (supplier) — plus cross-cutting managed-trust interaction.

**Organizer (demand)**
- As an organizer, I want to **install the app and browse nearby spaces immediately, without signing up**, so that I can judge whether Steeple is worth my time before committing anything. *(low-friction install & browsing)*
- As an organizer, I want to **filter by activity type** (children, sports, community, religious), **group size, day/time, and free vs. paid**, so that I only see spaces that genuinely fit my need. *(intent-based matching & filtering)*
- As an organizer, I want to book a space as **a one-off OR as a bounded recurring slot (with start + end dates)**, so that both single events and ongoing programs are covered, with a clear renewal point. *(one-off + bounded recurring)*
- As an organizer, I want to **apply by describing my group and intent, signing in with Google/Apple only at that point**, so that I prove I'm genuine without friction before I'm even sure I want to book. *(managed trust, low friction)*
- As an organizer, I want to be **notified when I'm approved, asked a question, or declined**, so that I know where I stand and can plan.

**Church admin (supply)**
- As a church admin, I want to **list one or several rooms**, each with its own photos, capacity, amenities, house rules, and price (including free), so that I can offer my different spaces appropriately. *(multiple rooms/listings, low-friction provision)*
- As a church admin, I want to **state which activities and groups I'll consider** (e.g. welcome children's and religious groups; no loud sports), so that I attract the right requests and filter out mismatches. *(intent matching)*
- As a church admin, I want to be **notified of a new application**, see the **applicant's stated intent and trust signals**, and **approve, ask, or decline**, so that I stay in control of who enters our space. *(notifications, managed trust)*
- As a church admin, I want **approved recurring bookings to repeat automatically**, so that I don't re-approve the same playgroup every week.

**Managed-trust interaction (cross-cutting)**
- As both an organizer and a church admin, I want our **identities and intent lightly vetted and our interaction mediated by the platform** (SSO-verified identity, stated intent, ratings/history), so that we can deal with a stranger safely without either of us running our own background check.

### End-to-end happy path
1. Maria hears about Steeple, **installs the app, and immediately browses** the map of nearby spaces — **no account required**.
2. She **filters**: *recurring Tuesday mornings, ~15 people, toddler-friendly/children, free or low-cost*. Three church halls surface within range.
3. She opens **St. Andrew's** listing — photos, capacity, amenities, house rules, and an **identity-verification indicator** (SSO — *not* a vetting/safety claim).
4. She **applies**, describing her toddler playgroup, group size, and recurring intent, and **signs in with Google/Apple at this step** (her first friction — one tap, and only because she's now committing).
5. The **church admin is notified**, reviews Maria's intent and trust signals, and **approves**.
6. The **recurring weekly booking is confirmed**; both are notified. Money/keys are handled per the listing (offline in early v1).
7. Tuesday comes; Maria and 12 toddlers show up; it works. She **rebooks automatically next week and leaves a rating**, strengthening her trust profile for future applications.

## Competitive Analysis

**Bottom line:** the "Airbnb for churches" *category and metaphor are already taken* — but the *community-first, free-first positioning* and the *NoVA/DC territory* are wide open. No incumbent combines community-first framing + free-as-default + hyperlocal density. (Researched June 2026. Two minor items to confirm with the founder — **non-blocking**: ChurchSpace's actual take-rate, and a quick check that no faith competitor has live NoVA/DC listings; also worth confirming she's aware of ChurchSpace and comfortable with the positioning against it.)

| Competitor | What it is | Model / take | Where | Why it's not us |
|---|---|---|---|---|
| **ChurchSpace** (direct threat) | "Airbnb for churches" — coined by *Washington Post* | Marketplace, take-rate undisclosed; pitches churches ~$23K–100K/yr | TX → Detroit; ~350 churches, ~6K users, $1.2M raised (2025) | **Commercial** framing (food entrepreneurs, micro-logistics, "economic engines"), not community/free; **not in NoVA/DC** |
| **SpaceTogether** | Faith + commercial space rental | Listing/marketplace | US; ~15K users | Revenue-for-owners framing, not community/free |
| **Peerspace** | Largest hourly-venue marketplace | ~20% guest service fee | 23+ cities, 40K spaces, ~$40M raised | Commercial shoots/events; premium; high take |
| **Tagvenue** | Event-venue marketplace | 0% guest, ~10–15% host | UK/US/AU; 22K venues, **bootstrapped & profitable** | Commercial events — but *proves a lean low-take marketplace can scale* |
| **Facilitron** | Public-facility (schools/councils) marketplace | **$0-to-owner**, 6–12% on paid rentals | 31 US states, 15K+ institutions | Public-sector not faith; *the model to emulate on the supply side*; a threat if it adds churches |
| **SpaceToCo** | Community-venue booking SaaS + free marketplace | SaaS + discounted NFP commission | Australia, 60+ councils | Closest *philosophical* cousin; AU-only, software-led |
| **Skedda / Planning Center / ChurchTrac** | Facility-booking & church-mgmt **SaaS** | Per-space SaaS | Global | **Substitutes, not marketplaces** — no demand-side network; churches must still find renters |
| **Status quo** | Facebook groups, church sites, word-of-mouth, **door-knocking**, libraries | Free / manual | Everywhere (esp. DC) | **Steeple's *real* competition** — entrenched & free, but fragmented, no discovery, no trust, no availability data |

**Why we win (thesis):** *We own the buyer and the price nobody else wants.* **Everyone else sells churches *passive income*; Steeple sells them *mission impact, starting at free* — a lane nobody is in.** Every competitor optimizes a church's idle real estate into **commercial revenue**; Steeple optimizes a church's **mission into community impact**, starting at $0. Winning one dense metro (NoVA/DC) with a community-first, free-first, locally-vetted network builds liquidity and trust that a Texas-rooted, revenue-framed ChurchSpace and the commercial Peerspace tier structurally won't replicate — because it's off-strategy for them.

**Lessons borrowed:** stay **marketplace-light, never hold real estate** (Breather: raised $122M, died asset-heavy); pick **recurring** demand — community groups rebook weekly (Splacer died on thin, one-off niche economics); **$0-to-owner host model** removes supply friction (Facilitron); **low take + low friction** wins community-adjacent supply (Tagvenue, bootstrapped to 22K venues); **handling the boring trust/compliance plumbing** (insurance, bonds, safeguarding) is what the community segment actually rewards, and a SaaS-for-hosts tier can fund the free marketplace (SpaceToCo).

**Biggest competitive risks:** (1) **ChurchSpace expanding into the DC corridor** — or Peerspace/Facilitron moving down-market into community/church space — *before* Steeple achieves local liquidity. (2) **Internal:** the free-as-default hero use case has **no proven monetization path** — the same disease that killed Splacer and Breather. Differentiation built on "vetting/trust" alone is a *feature, not a moat*; the durable moat must be **community embeddedness + local supply density**.

## In Scope (v1)

The core v1 is a **polished, map-based marketplace** (not a flat directory — a directory would be "dead on arrival" in 2026; users expect a rich experience). Supply is **concierge-onboarded** by the founder (manually listing known churches, as in 2017) so the map is never empty — but the **demand-side product is fully built and productized**. Principle: *concierge supply, productized demand.* **Go-to-market: supply first** — concierge-onboard a cluster of churches in one NoVA suburb (the founder picks the specific suburb from her existing church/school network) so the map has density before demand arrives.

- **Map-based search** of church/community spaces within a **single allowed beachhead area** (one NoVA suburb), with pins and listing previews.
- **Filters:** proximity, day/time/recurrence, capacity/group size, free vs. paid, activity-fit, **accessibility**.
- **Rich listing pages:** photos, capacity, amenities (parking, kitchen, restrooms, **step-free/accessible access**), house rules, identity-verification status (SSO).
- **Application → approval flow** carrying intent (activity, group size, frequency) so suppliers can decide; supplier can approve, ask, or decline.
- **Minimal trust layer:** **SSO (Sign in with Google/Apple)** at the *apply* step; written intent; basic ratings/history. (Phone OTP is a deferred paid step-up, not in the MVP.)
- **Geo-fenced backend:** only hardcoded allowed location(s) are honored — server rejects requests for any area outside the beachhead (cost control + focus).
- **Consumer web funnel (a distinct product — HTMX + light JS, its own Web API):** install-free, **shareable, read-only discovery** — browse listings on the web (e.g. `steeple.com/st-andrews`), with **applying converting into the app**. The **demand-side cold-start lever**, since mobile-install friction is real for a low-frequency need (book a hall a few times a year, not daily). Built alongside the app with separated concerns. _Whether the web also supports applying (vs. purely funnelling to the app) is a build-time call._
- **Payments: out of v1** — money/keys are handled **offline** between the parties; the invisible commission, and its rate + verification/badge pricing, are set only when in-app paid bookings arrive later. Not needed for the POC.

### POC-first slice (ship this first)
The irreducible end-to-end loop, so the founder can put a working demo in real hands and onboard a few churches by hand:
- Geo-fenced map + nearby listings · listing detail pages · search/filter
- Apply (written intent + **SSO sign-in: Google / Apple**) · church approve/decline + notifications · booking confirmed

**Fast-follow (still v1, but after the POC loop runs):**
- **Ratings/reputation** — almost no signal until there's booking volume; earns its keep later.
- **Renewal nudges at the recurring-booking renewal seam** — the *bounded* recurring booking (start+end, materialized occurrences) is decided and in scope; automated renewal reminders are fast-follow.
- **Community vouching / org-affiliation.**
- **Phone OTP step-up** — a paid escalation for higher-stakes bookings; **SSO covers the MVP**, so SMS stays off the critical path.

## Out of Scope (deferred until real volume demands it)

- In-app payments, the invisible commission, and no-show card holds (handoff can happen offline at first).
- **Insurance / damage-bond facilitation (Option B)** — v1 is neutral-platform (Option A); insurance is a future monetizable Gates layer.
- Paid "Verified" badges and third-party ID verification (Stripe Identity / Persona).
- Background-check / safeguarding workflows (obligations still flagged in Constraints).
- Reciprocity / free-supply credits (unproven "prosumer" hypothesis).
- Government / public-space inventory (second supply vector, later).
- Multi-tier trust escalation beyond the minimal layer.
- Multi-city / multi-region expansion (deliberately one area first).

## Edge Cases & Failure Modes

**Liability:** v1 = **neutral platform (Option A)** — Steeple is not a party to the booking (see Trust & Safety). Insurance/bond facilitation = Option B, deferred.

**Actively handled in v1** (transactional-integrity issues that ratings alone cannot fix — they need product mechanisms):

- **No-shows & cancellations.** Either side can cancel with notice; the other party is notified and the slot is freed. No-shows are markable and **feed the two-way trust/rating profile** — for free bookings the deterrent is *reputational*, since there is no money to forfeit. *Needs: cancel flow + notice window + notifications + no-show marking (both directions).*
- **Double-booking.** Once a slot is approved/confirmed it is **locked** and cannot be booked again. Concurrent applications for the same slot resolve **first-approval-wins**; the rest are auto-declined and notified. *Needs: availability/calendar integrity + concurrency handling.*
- **Listing pulled / edited mid-recurring-booking.** **Confirmed recurring bookings are protected** — removing or editing a listing does not silently cancel existing commitments; ending one requires an explicit cancellation with notice that notifies the organizer. *Needs: listing lifecycle that honors active bookings + graceful cancellation path.*
- **Fake / spoofed listings.** A host must submit proof of ownership or lease/listing authority before Admin can approve a venue's first listing. Steeple stores review metadata and links to externally hosted proof documents, not raw sensitive document contents.

**Handled by two-way reviews & ratings:**

- **Declared-vs-actual activity mismatch** ("said playgroup, ran a loud party") — the church rates the organizer; a mismatch damages their trust profile.
- **Unresponsive / slow church admins** — surfaced via ratings and (later) a response-rate indicator; stale applications can auto-expire.

**Consciously deferred — with honest caveats:**

- **Off-platform leakage** (church + organizer transact directly after the first match, especially on recurring bookings). *Ratings do **not** address this — it is a revenue-leakage issue, not a UX one. Acceptable to defer because the free-as-hero, tiny-take economics make the motive to defect low. Revisit if/when paid bookings dominate.*
- **Forged supplier evidence.** Verification reduces spoofed listings but does not make Steeple a title company or legal authority; suspicious documents still require founder/operator judgment and, where needed, off-platform follow-up with the institution.

## Architecture (POC)

A deliberately boring, conventional **N-tier** — **self-hosted, no lock-in, cheap.** The moat is cost and community, not infrastructure.

```
  [ Flutter app ]      [ Web funnel: HTMX + light JS ]      [ HTMX admin ]
        │                          │                              │
        ▼                          ▼                              ▼
   Mobile edge API            Web edge API              admin (own user/pw + MFA)
        └──────────────┬────────────┴────────────────┬────────────┘
   (all behind         │  → Maps API (geocode / autocomplete)
    Cloudflare DNS     │  → SMS provider (OTP — deferred step-up)
    + Caddy proxy)     │  → FCM (push — fire-and-forget)
                       │  → Feature flags service (.NET Core + SSE push)
                       ▼
                [ Postgres ]  self-hosted on DO droplet · system of record
                       │
                       └─► DO Spaces (S3): images + nightly DB backups
```

- **Clients (three surfaces):** the **Flutter mobile app** (engaged/repeat users — browse + apply); a **consumer web funnel** (**HTMX + light JS**, deliberately *not* React/Next.js) for **install-free, shareable discovery** — the demand-side cold-start lever; and a **bespoke HTMX admin dashboard** for concierge onboarding & moderation.
- **APIs — two separate edge layers (separation of concerns):** a **Mobile edge API** (serves the Flutter app) and a **Web edge API** (serves the consumer web funnel), both plain **.NET Core** behind **Caddy** + **Cloudflare DNS**, both reading the same Postgres system of record. The admin is its own surface with its own auth. Load balancing deferred until traffic warrants it and slots in transparently later.
- **Feature flags service:** a small **.NET Core** service owns runtime flags and serves them to Steeple services through a dedicated SDK. Services connect to `GET /flags/stream` over **Server-Sent Events** and keep an in-memory flag cache; flag evaluation is local and never on the hot request path. The service also exposes `GET /flags` for initial sync / fallback long-poll, and admin mutations broadcast immediately to connected listeners. v1 can start in-memory while table design settles, then persist flags/rules in Postgres behind the same service contract. Rule shape follows the proven Perchd pattern: ordered condition rules, AND groups, default rule, public/private visibility, and deterministic percentage rollouts.
- **Postgres = system of record, self-hosted on an existing DigitalOcean droplet.** Relational + transactional, which fits the domain (church → rooms → availability → applications → bookings → recurrence → ratings) far better than a document store. **Backups:** nightly `pg_dump` (or WAL-G for PITR) → **DO Spaces**. _POC RPO ≈ 1 day; **test restores** — an untested backup is not a backup._
- **Operations (solo-operator resilience):** the single droplet is a SPOF (app + DB + admin). Add **DO automated snapshots** (separate from `pg_dump`), **uptime monitoring → alert to phone** (free tier), and a **one-page restore/rebuild runbook with a target RTO** (~hours). DO **Managed Postgres** is the heavier option if budget allows, to split the system-of-record off the app box.
- **Object storage:** images on **DO Spaces** (S3-compatible). Public listing photos served via the **Spaces CDN** (public-read — they aren't secret); reserve **signed URLs** for genuinely private assets.
- **Auth — self-hosted, no vendor:** **ASP.NET Core Identity** (built into .NET, OSS, users stored in your own Postgres via EF Core). **Primary gate = SSO / OAuth — Sign in with Google + Apple** (free, low-friction, native external-provider support). SSO is a *reasonable* identity signal but **not** phone/card-grade — accounts are mintable at scale — so **v1 also guards the *apply* endpoint with Cloudflare Turnstile + per-IP rate-limits** (per-account limits alone fall to N accounts). Offering Sign in with Apple satisfies App Store guideline 4.8 (which requires an *equivalent privacy-preserving* login when third-party SSO is offered) — both free. No passwords / no email-link. **Phone OTP is a deferred *paid step-up*, off the MVP path** — behind a thin **`ISmsOtpSender`** interface, **Twilio Verify** (robust, A2P-10DLC-exempt) or **Plivo Verify** (cheapest, ~$0.008) when enabled. ⚠️ If/when OTP is enabled, **SMS-pumping / toll fraud is a real budget threat** — rate-limit per-phone + per-IP, backoff, **Cloudflare Turnstile** (free captcha — already behind Cloudflare).
- **SSO mechanics (MVP = SSO only):** the Flutter app uses native Google/Apple sign-in to obtain a provider **ID token (signed JWT)**; the .NET API **verifies it server-side** (signature via the provider **JWKS** + `aud`/`iss`/expiry), **finds-or-creates a local user keyed by `(provider, sub)`** — the stable subject claim, *not* email — and issues **its own session token** for later calls. **No passwords / no email-verify/reset flow**, but you still create the local user row + manage your own sessions. **Apple caveats:** name + (possibly relayed `@privaterelay.appleid.com`) email arrive **only on first authorization** — persist them then; the Apple client secret is a JWT (**≤6-month max validity**) — **generate it programmatically from the .p8 key (short-TTL / per-request or cron) so it can't silently expire**, backed by a login-failure alert. Cross-provider account-linking deferred.
- **Admin auth (separate from consumer SSO):** the HTMX admin uses **username + password + MFA (TOTP)** via ASP.NET Core Identity local accounts — *not* SSO. Served on a **separate, non-public hostname**, with **CSRF tokens on every mutation**.

**Postgres earns its keep on a requirement:** the **no-double-booking** rule is enforced at the DB level. **Recurring bookings are *bounded*** — mandatory **start + end date** (rental-contract style, with a **renewal seam** between terms) — so at approval all occurrences are **materialized as concrete `(room_id, time_range)` rows**, and a **`btree_gist` exclusion constraint** (`EXCLUDE USING gist (room_id WITH =, during WITH &&)`) atomically rejects *any* overlap — recurring or one-off, partial or exact. Bounded ⇒ a finite occurrence set, so **no rolling-horizon job**; **renewal = a new bounded booking** that re-checks availability. Not racey app-level checks.

**Notifications — push as optimization, inbox as truth:**
- New-application alerts: **.NET API → FCM, fire-and-forget** (best-effort).
- The authoritative application **inbox lives in Postgres**, fetched on open / pull-to-refresh — **no realtime/websocket layer** at POC scale. A dropped push never loses data; the provider sees it on next refresh.
- **Email fallback (decision-loop):** also send a transactional **email** on new-application / approval / decline (the Google/Apple email is on hand; Apple's relay forwards). The reliable channel for low-frequency, important events to infrequent app-openers — send via a **transactional email provider** (SES / Postmark / Resend), *not* from the droplet, for deliverability (SPF/DKIM/DMARC).

**Geo:** proximity + geofence via a **bounding-box query on indexed lat/long** — no PostGIS needed at one-suburb scale; the geofence (reject out-of-area) is a server-side bounds check.

**Build-time decisions (not blockers):** analytics sink — lean toward **logging events to Postgres** (best fits the no-lock-in ethos; GA4 or self-hosted PostHog are alternatives). *(Recurrence model now decided — bounded + materialized occurrences + `btree_gist` exclusion; see double-booking above.)*

## Constraints

- **Lean cost ceiling:** running costs targeted at ~$100 AUD/month — a deliberate constraint and the moat. Architecture and third-party choices must respect this.
- **Maps API cost — investigated (2026), NOT a budget risk.** At Steeple's scale (~1K–10K map loads/mo, a few hundred geocodes/mo) maps cost **~$0/month**, nowhere near the ceiling. Why: **native mobile map SDK loads are free** — Apple MapKit (free beyond the $99/yr Apple Developer membership) and Google Maps SDK for Android (unbilled, no cap). Only geocoding + autocomplete are metered, and the volume sits inside Google's 10,000-free-calls-per-SKU/month tier (Google replaced the old flat $200 credit with per-SKU free allowances in March 2025).
  - **Recommended stack:** native Apple MapKit (iOS) + Google Maps SDK (Android), with Google Geocoding + Places Autocomplete for addresses → ~$0/mo at this volume.
  - **Escape hatch at scale:** MapLibre GL + self-hosted Protomaps/PMTiles tiles + self-hosted geocoder (Nominatim/Photon) — public Nominatim is NOT usable commercially (1 req/s, no autocomplete, attribution/policy limits).
  - **Cost & abuse control:** **geo-fence the backend** to hardcoded allowed areas (bounds *which* addresses can be geocoded), **plus per-IP/session rate-limits on any endpoint proxying a metered Maps SKU** (geocode/autocomplete) — the geo-fence scopes *where*, the rate-limit caps *how many*.
- **OTP/SMS cost — investigated (2026); off the MVP path.** **SSO (Sign in with Google/Apple) is the primary gate — free.** Phone OTP is a deferred paid step-up; the figures below apply only **if/when** it's enabled. No provider offers a perpetual free SMS tier (Twilio = one-time ~$15 trial only). At MVP volume (100–1,000 verifications/mo) **Twilio Verify ≈ $6–58/mo** — negligible early (~$6–18 at 100–300/mo). Key lever: use a **managed Verify product**, which is **exempt from US A2P 10DLC** (the ~$2–10/mo fixed campaign fee + ~$15 registration that would otherwise dominate at low volume); rolling your own plain SMS over 10DLC incurs those fixed fees. **Plivo Verify** is the cheapest credible option (~$0.008/verification, no platform fee) behind the swappable `ISmsOtpSender` interface. **Firebase phone auth was evaluated and rejected** — also not free (Blaze-only, **~$0.01/SMS** US, only a "first 10 SMS/day" waiver; the oft-cited "10k/mo free" is a myth conflating the SMS-*excluded* 50k free-MAU tier), and it adds a Google client-SDK + Play-Integrity/reCAPTCHA dependency — **worse on both cost and lock-in than Plivo**. Whatever the provider, **rate-limit the OTP endpoint** (SMS-pumping defence — see Architecture).
- **Avoid becoming a PII/KYC data custodian:** identity verification, payment, and ID storage must be **delegated to third parties** (Stripe, Stripe Identity/Persona, OAuth, carriers). Holding government IDs would impose data-protection liability incompatible with a lean startup.
- **Data protection:** even minimal PII (contact details, application content) triggers obligations (US state privacy laws; relevant if/when expanding). Minimize what is stored.
- **Safeguarding / child protection:** activities involving minors/vulnerable people on religious premises may trigger background-check and safeguarding obligations that vary by jurisdiction. **v1 excludes background-check/safeguarding workflows** (neutral-platform); these obligations are researched **before** adding any such feature or Option B.
- **Founder-led, home-grown, not VC-backed:** limited capital and team; scope must fit a small build.
- **Platform: both iOS and Android.** Sequencing: **iOS first** (founder has an Apple Developer account; App Store review is more straightforward), **Android close behind** (main friction is Google Play's closed-testing tester requirement; founder has contacts to source testers). Native MapKit (iOS) + Google Maps SDK (Android) keep map costs ~$0.
- **Cross-platform framework: Flutter (decided).** Researched June 2026. Decisive factor is **maps** — the core of the product and RN's weakest area in 2025–26: `react-native-maps` had a rocky New-Architecture transition (marker/load crashes, broken interop for nested Map→Marker→Callout), `expo-maps` is still alpha (Apple Maps only on iOS), and the Mapbox plugin was handed to the community. Flutter's **`google_maps_flutter` is official and stable**, and **Impeller** (now default) removes shader-compile jank for a design-forward UI. RN has improved (New Architecture mandatory as of ~0.85; Expo is the official path) but frozen-legacy makes unmaintained modules a hard wall — the exact pain the builder already hit.
- **Auth approach:** **MVP = SSO only (Sign in with Google + Apple)** — no passwords, no email-link, no SMS. **ASP.NET Core Identity** (self-hosted in Postgres, no vendor lock-in); local user keyed by `(provider, sub)`, app issues its own session token. **Phone OTP deferred** as a paid step-up (see Architecture).
- **Backend (self-hosted, no lock-in):** plain **.NET Core API** + **Caddy** reverse proxy behind **Cloudflare DNS**; **Postgres self-hosted on an existing DigitalOcean droplet** (system of record) with nightly backups to **DO Spaces**; images on **DO Spaces** (S3); **FCM** for push. Cheap and within the ~$100/month line. See **Architecture**.
- **Watch-item:** Google's long-term Flutter commitment (2024 layoffs spawned the "Flock" community fork) — currently well-mitigated (committed 2026 cadence, heavy enterprise production use), monitor but not a blocker.
- **Team & timeline:** solo build by Jeremy (technical) with the founder owning domain & go-to-market; **no fixed deadline — POC-paced.**

## Deferred Decisions

Recorded **decisions to defer** (owner + trigger noted), not open unknowns — **none blocks the POC build**:

- **Beachhead suburb (GTM):** supply-first concierge onboarding is decided; the **founder picks the specific NoVA suburb** from her church/school network at launch.
- **Trust friction dial:** v1 ships the **light tier** (SSO sign-in + application + ratings); **phone OTP is a deferred paid step-up**; escalate only where analytics show abuse/drop-off.
- **Safeguarding / background checks:** **out of v1** (neutral-platform); obligations researched **before** any child-focused vetting feature or Option B.
- **Monetization numbers:** **no in-app payments in the POC**; commission % and verification/badge pricing set when paid bookings/verification are introduced.
- **Analytics sink:** build-time decision (lean: log events to Postgres). *(Recurrence data model now decided — bounded start+end, materialized occurrences, `btree_gist` exclusion; see Architecture.)*
- **Consumer web funnel:** now **in scope** — HTMX + light JS, its own Web edge API, install-free shareable discovery (see Architecture / In Scope). The demand-side cold-start lever.
- **Founder due-diligence (non-blocking):** confirm awareness of ChurchSpace + positioning; spot-check no faith competitor is live in NoVA/DC.

## Open Questions

- **Demand channels (founder input needed — the key cold-start risk).** *How* do organizers (the Marias) discover Steeple? Concierge seeds *supply*, and the consumer web funnel lowers *install* friction — but neither creates **awareness**. The likely seed is the founder's own school/non-profit network (the demand-side mirror of her church network), plus supplier churches cross-promoting to their congregations and local channels (neighborhood Facebook groups, Nextdoor, nonprofit mailing lists). **Unresolved — to be named by the founder.** Supply with no demand is an empty map that churns the hand-recruited suppliers.
