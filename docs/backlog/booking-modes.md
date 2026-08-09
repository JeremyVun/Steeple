# Booking modes — instant book by default, manual approval by choice

> **Status: IMPLEMENTED 2026-08-05** (mock-gateway era — as-built wire truth:
> `docs/contracts/payments.md`; schema 013/014; behind the `payments.enabled` flag, on in
> dev, off in prod until rollout). **Amended 2026-08-08:** instant book no longer rides on
> `payments.enabled` — see "Decoupled from payments" below. The chronic-rescinder signal
> (§3) and the deferred items
> below remain future work. Adopted 2026-08-05 (owner decision, in-session). Supersedes the
> request→approve-only model for the parts it names.
>
> **Superseded 2026-08-05 → "Charge timing" below:** `payments.md` §5's original
> charge-at-T−48h-only rule no longer governs the first occurrence.
> Non-negotiables inherited unchanged from `payments.md` §1: Steeple never stores or
> custodies card data (Stripe holds payment identity); booking-integrity invariants
> stand; no payment call inside the approval transaction.

## Adopted

1. **Per-venue booking mode**, host-chosen, two values:
   - **`instant` (default):** a valid request (schedule fits, card saved) confirms the
     booking immediately — slot taken under the same exclusion constraint as approval;
     first valid request wins. The host holds a **rescind** lever (decline by
     exception, any time).
   - **`manual`:** the existing request→approve flow, unchanged (approve / decline /
     message / counter-offer). Counter-offers exist only in this mode.
2. **Card at request, never stored by us.** The guest saves a payment method with
   Stripe (Elements/SetupIntent; mock gateway until Stripe lands) as part of
   requesting. Steeple's DB holds token IDs + brand/last4 display data only.
3. **Chronic-rescinder signal — deferred (owner todo, do not lose):** hosts who
   repeatedly rescind confirmed bookings give guests a bad experience; the future
   lever is tracking rescind rate and nudging (or forcing) chronic rescinders onto
   `manual` mode, where a slow "no" is a decline, not a cancellation. Deliberately
   not built now; revisit with data once instant mode has volume.

## Charge timing (adopted 2026-08-05)

- **One-off booking: charge the full amount at confirmation** (booking minute, not
  T−48h) — immediate, ticket-like feedback; commitment is real from the start.
- **Recurring booking: first occurrence charges at confirmation; each subsequent
  occurrence charges at T−48h** (per-occurrence machinery from `payments.md` §5
  unchanged — no scary upfront term sum, no proration math).
- **Refund table shifts accordingly:** guest cancel ≥48h before a *charged*
  occurrence → automatic full refund (Steeple eats the non-returnable processing fee
  — cost watch-item); guest cancel <48h → charge stands; **host rescind, any time →
  automatic full refund of everything charged** (the notice window binds only
  guests). Uncharged future occurrences simply free.
- **Funds flow:** destination charges with normal payout schedule (funds route
  through Stripe to the host; refunds claw back via `reverse_transfer` +
  `debit_negative_balances`). True held-funds-until-session-completes (separate
  charges & transfers) noted as an alternative — rejected for v1 (Stripe's 90-day
  platform-balance limit breaks far-future bookings; clawback already handles the
  rescind case).

## Decoupled from payments (owner decision, 2026-08-08)

The original design gated instant book on `payments.enabled` (the card-at-request was the
commitment gate standing in for host approval), so with the flag off — the production
default — every venue silently fell back to request→approve. **Rejected by the owner:**
the abuse risk is guest-side (spam-booking a calendar), and that answer punished the host
by disabling the feature they chose. Reversed as follows:

1. **Instant book honors the host's stored choice regardless of the payments flag.** The
   public `bookingMode` is no longer masked to `manual` while payments are off
   (`ListingService`), and an instant submit confirms at submit with or without a charge
   (`ApplicationService` — the charge kick stays a no-op without a price snapshot).
2. **Uncarded instant-book caps** (the guest-side spam guard): a guest with **no payment
   method on file** may hold at most **3 upcoming bookings per venue / 10 overall**
   (confirmed bookings with scheduled time still ahead — same effective-status predicate
   as `?status=confirmed`). An over-cap instant submit **falls back to request→approve**
   (a pending application, never an error; the web says why). A **verified payment method
   lifts both caps** — while payments are on, the 402 gate has already proven it, so the
   caps only ever bind in the payments-off era. Constants live in `ApplicationService`;
   tuning is a Phase 6 item.
3. What still limits spam besides the caps: SSO sign-in, the per-account `apply` rate
   limit, Turnstile, the geofence/beachhead, and the host's rescind lever as backstop.
4. `ManagedVenueDetailDto.instantBookingActive` (additive 2026-08-07, one day old, no
   released clients) and the desk's honesty note are **removed** — the setting is simply
   in effect now.

## Also deferred

- ~~Per-user cap on concurrent upcoming bookings~~ — **built 2026-08-08** as the uncarded
  instant-book caps above. Cancellation-rate tracking remains deferred — the
  real economic lever against serial book-and-cancel (upfront charging alone doesn't
  punish it: a full refund returns their money and costs *us* the processing fee).
- Partial-refund / cancellation-fee policies — only with evidence of abuse.
