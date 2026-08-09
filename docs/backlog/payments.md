# Payments — production Stripe integration

> **Status (audited 2026-08-09):** the provider-independent booking and payment rails are
> built and tested against `MockPaymentGateway`. Production cannot enable them: there is no
> Stripe SDK or adapter, the payment controller and mock completion routes are Development-only,
> and the web/mobile clients cannot complete a real Stripe setup flow. The remaining work is a
> bounded Stripe integration, but it is **not** only an adapter swap; the current port and payment
> state model need the changes in §§7–9 first.
>
> `docs/contracts/payments.md` is the current wire contract. The code, changesets 014/017,
> and payment tests are the as-built truth summarized below.

## 1. Product behavior to preserve

- Card data and KYC documents stay on Stripe-hosted surfaces. Steeple stores provider ids and
  card display data (brand/last four) only.
- In-app payment is a per-venue choice. A venue becomes eligible only after Stripe reports both
  charges and payouts enabled and its manager explicitly opts in. Eligibility is snapshotted at
  booking confirmation; an offline booking never changes mode later.
- The organizer pays the frozen per-occurrence price in USD. The venue receives that price less
  Steeple's frozen application fee.
- No Stripe call runs inside the booking transaction. The first occurrence charges immediately
  after confirmation; later occurrences enter the charge flow 48 hours before they start.
- A failed later charge retries until 24 hours before the occurrence, then cancels that occurrence.
  Two consecutive payment-failure cancellations cancel the remaining term.
- Every succeeded charge on a cancelled occurrence refunds in full. Host cancellation frees all
  scheduled occurrences at any time; guest cancellation inside 48 hours leaves that occurrence
  and its charge standing.
- `payments.enabled` remains the rollout gate for new in-app bookings. Once real money exists,
  disabling new payment intake must not hide historical reads, stop webhooks, or suppress refunds
  already owed. Add separate operational controls for new charges and worker recovery rather than
  reusing one flag as a global money kill switch.

## 2. Stripe/Connect decision that must be confirmed first

The intended integration remains Stripe Connect Express with destination charges and
`application_fee_amount`. That shape fits the existing platform-level customer/payment-method
model and central charge worker. It is not yet a final legal or risk decision.

With destination charges, Stripe debits processing fees, refunds, disputes, and chargebacks from
the **platform** balance. The platform is merchant of record by default; `on_behalf_of` can make
the connected venue the settlement merchant, but does not remove the platform's negative-balance
exposure. Before implementation, confirm with Stripe and US counsel:

1. whether the venue or Steeple is merchant of record;
2. whether destination charges plus `on_behalf_of` correctly represents that answer, or direct
   charges are required;
3. statement descriptor, receipt, tax-reporting, sales/occupancy-tax, refund, dispute, and reserve
   responsibilities; and
4. that the platform account and connected-account configuration support this marketplace.

Do not retain the old claim that Connect by itself keeps Steeple out of money-transmission,
merchant-of-record, tax-reporting, or dispute obligations. Those are professional-review items.
Relevant Stripe references: [merchant of record](https://docs.stripe.com/connect/merchant-of-record),
[destination charges](https://docs.stripe.com/connect/destination-charges), and
[Connect disputes](https://docs.stripe.com/connect/disputes).

## 3. What already exists

| Area | As-built behavior |
|---|---|
| Schema | `venue_payment_accounts`, provider identity/display columns on `users`, frozen price/currency on `bookings`, and per-occurrence `payments`; changeset 017 removes synthetic mock state before a real rollout. |
| Booking gate | With the global flag on, every application requires a locally recorded method on file (`402 payment_method_required`). Every confirmed booking gets a price snapshot. |
| Charging | Claim-first payment row, one-live-payment partial unique index, first occurrence post-confirmation, later occurrences at T−48h, stale-Pending recovery, and a Postgres advisory-locked sweeper. |
| Failure ladder | Failure notification, paced retries, T−24h occurrence cancellation through `IBookingService`, and remaining-term cancellation after two consecutive failures. |
| Refunds | Immediate post-cancel plus sweep-time recovery; succeeded charges on cancelled occurrences are refunded and the organizer is notified. |
| Onboarding | Manager-scoped start/read endpoints and a mock completion endpoint that sets all readiness flags and opt-in at once. It is display-only and does not gate charging. |
| Clients | Web mock card and payout screens plus paid-booking status/copy. Mobile understands payment notification tokens but has no payment setup, paid-booking, or payout UI. |
| Safety | Production rejects `payments.enabled=true` with `Payments:Gateway=mock`; the current payment controller is excluded outside Development. |
| Tests | Controller flag behavior, charge-window policy, 402 gate, concurrent booking/charge claims, double-sweep idempotency, refunds, and failure auto-cancellation. |

This is useful domain machinery, not production money movement. In particular, the present global
flag behavior deliberately ignores venue onboarding: when enabled, every booking is priced and
charged through the mock whether or not its venue has completed the payout stub.

The current flag also pauses refund kicks and the sweeper. Before live money, split that behavior
as described in §1 so a rollout rollback cannot strand a refund or webhook transition.

## 4. Provider onboarding and per-venue activation

Replace the mock collapse with separate Stripe state and host intent:

1. Create/reuse an Express connected account and request only the capabilities required by the
   confirmed charge/MoR model.
2. Generate a new Account Link for every start/resume request. Account Links require HTTPS
   `return_url` and `refresh_url` in live mode; returning from Stripe is not proof that onboarding
   is complete.
3. Receive Connect `account.updated` events and mirror `details_submitted`, `charges_enabled`,
   `payouts_enabled`, and actionable requirements. Fetch current account state after return and
   resume links so the UI does not depend on webhook ordering.
4. Add explicit manager `opt-in` and `opt-out` operations. Stripe completion must never opt a venue
   in automatically.
5. Make confirmation consult one Payments-owned readiness method. Snapshot an in-app price and
   application fee only when readiness plus opt-in is true; otherwise keep the booking offline.
   Apply-time `402` and room-detail payment copy must use the same decision.
6. Generate Express Dashboard login links only on an authenticated manager action. They are
   single-use and must not be cached in `GET .../payments`, emailed, or rendered in a mobile web
   view. See [Express Dashboard login links](https://docs.stripe.com/connect/integrate-express-dashboard).

The current `DashboardUrl` response field can remain null for compatibility; add a dedicated
dashboard-link operation rather than turning the state read into a link minting side effect.

## 5. Guest payment method and charge behavior

- Web uses Stripe.js Payment Element/Elements to confirm a SetupIntent; mobile uses Stripe's
  supported Flutter flow. The SetupIntent is attached to the platform Customer with
  `usage=off_session`.
- The UI must collect explicit consent for Steeple to initiate the described one-off/recurring
  off-session charges, including how timing and amounts are determined. Stripe documents this
  requirement in [Setup Intents](https://docs.stripe.com/payments/setup-intents).
- `setup_intent.succeeded` becomes the authoritative setup completion. Persist its PaymentMethod id
  plus brand/last four/set time, and pass that id explicitly on later PaymentIntents. Saving a new
  method replaces the default used by every future occurrence.
- Create one destination-charge PaymentIntent per occurrence in minor units, with the frozen
  amount/fee, connected-account destination, customer, payment method, `off_session=true`,
  `confirm=true`, and metadata containing Steeple booking/occurrence ids. Apply `on_behalf_of` only
  if §2 selects it.
- A PaymentIntent in `requires_action` is not an ordinary decline. Persist it, notify the organizer,
  and expose an authenticated booking-scoped recovery operation so Stripe.js/PaymentSheet can
  complete authentication. Do not put a PaymentIntent client secret in email or notification
  payloads.
- Enable Stripe receipts only after the merchant/descriptor decision is complete and ensure the
  paid-listing/apply copy matches the actual charge schedule and cancellation policy.

## 6. Refunds and disputes

For a full destination-charge refund, request `reverse_transfer=true` and
`refund_application_fee=true`. Stripe can report a refund as pending or failed, so do not mark a
local payment `refunded` merely because the create-refund call returned. Persist the Refund id and
state, finish from `refund.updated`/retrieval, and let the sweeper retry only when no live refund
exists. See [destination-charge refunds](https://docs.stripe.com/connect/destination-charges#issue-refunds).

Add the already-deferred venue-no-show refund and manager goodwill-refund endpoint only with the
published policy. Partial refunds remain out of v1.

`charge.dispute.created/updated/closed` must create an Admin-visible case and alert the operator.
Destination-charge dispute amounts and fees hit the platform balance; any transfer recovery and
evidence submission needs a runbook before live traffic.

## 7. Required data and port changes

Add a new Liquibase changeset and matching EF configuration; never edit changeset 014.

- Add `users.PaymentMethodId` (provider token, not card data).
- Freeze `bookings.ApplicationFeePerOccurrence` (or an equivalent fee-policy version plus frozen
  amount) when the booking becomes in-app. A later commission change must not alter an existing
  term's venue net.
- Store one Stripe PaymentIntent identity for the occurrence even after a decline or
  `requires_action`. The current code drops `ProviderPaymentId` on failure, which is incompatible
  with safe Stripe recovery.
- Add refund identity/state (columns or a separate refunds table) so pending/failed refunds are not
  reported as complete.
- Add a durable `webhook_events` work ledger with event id, source (platform/Connect), type, account
  id, object id, received/processed timestamps, attempts, and last error. Do not retain raw webhook
  payloads.

Evolve `IPaymentGateway` around provider operations, not the mock's shortcuts:

- `ChargeOccurrenceRequest` needs PaymentMethod id, connected-account id, amount in minor units,
  frozen application fee, and the chosen settlement-merchant input.
- `CreateAccountLink` needs return/refresh URLs; add on-demand Express dashboard links and account
  retrieval.
- Setup completion/account state must come from retrieved Stripe objects or verified events, not a
  client assertion.
- Charge/refund results need provider id plus provider lifecycle status, not only a success boolean.

### Idempotency correction

Do not carry the mock's “occurrence id is the key for every attempt” literally into Stripe. Stripe
caches the first response for an idempotency key, including failures, so that key can replay the
same decline or server error rather than perform a later recovery.

Use one PaymentIntent per occurrence: create it with a stable `occurrence:{id}:create` key, persist
its id in every returned state, retrieve that intent after ambiguous failures, and retry
confirmation on the same intent with operation-specific idempotency keys. The PaymentIntent is the
provider-side no-double-charge boundary; the existing database claim/index remains the local
concurrency boundary. Stripe likewise recommends reusing a PaymentIntent for the same purchase:
[PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle) and
[idempotent requests](https://docs.stripe.com/api/idempotent_requests).

## 8. API, configuration, and webhook edge

1. Add the official Stripe .NET package and a `StripePaymentGateway`; register `mock` only in
   Development and `stripe` only with complete Stripe configuration.
2. Extend `PaymentsOptions` with secret/publishable keys, platform and Connect webhook secrets,
   public onboarding return/refresh bases, currency, fee policy, and explicit test/live mode. Keep
   secrets outside committed settings; update `.env.example` without reading `.env`.
   Add independently testable controls for accepting new in-app bookings, attempting new charges,
   and processing recovery/refunds; webhook ingestion, historical reads, and owed refunds remain
   available whenever real payment records exist.
3. Split the real authenticated endpoints from Development-only mock endpoints. Remove
   `[DevelopmentOnly]` from the production controller only after its mock actions are isolated and
   production startup validates Stripe mode and required HTTPS URLs/secrets.
4. Add anonymous raw-body webhook edges with separate signing secrets for platform events and
   Connect events. Verify signatures before persisting the minimal work item, deduplicate by event
   id/source, return 2xx quickly, and process through a retrying hosted worker. Stripe does not
   guarantee event order and can deliver duplicates: [webhook behavior](https://docs.stripe.com/webhooks?lang=dotnet).
5. Allowlist only the events used by the implementation: at minimum `setup_intent.succeeded`,
   PaymentIntent success/failure/action state, refund updates, disputes, and Connect
   `account.updated`. Retrieve the current Stripe object while processing so out-of-order events do
   not regress local state.

Webhook processing and the sweeper must be idempotent with each other. Synchronous API results can
reduce UI latency, but webhooks/retrieval are the recovery authority after timeouts or restarts.

## 9. Client work

**Web:** branch on `mock`; lazy-load Stripe.js only when the real setup surface opens, mount
Elements with the returned client secret, confirm setup, poll/read local method state until the
verified completion is visible, redirect real Account Links, and remove mock-only copy/actions from
the Stripe path. Keep the current document-relative API behavior and add a CSP exception only for
Stripe's documented origins.

**Mobile:** implement payment-method setup/replacement, `402` recovery and resubmit, payment status,
failure/action recovery, refund state, venue onboarding redirect, and app-link return handling.
Production must not enable payments while a supported mobile build can reach a paid venue without
those paths.

**Admin:** surface connected accounts that lose readiness, unresolved webhook work, failed/pending
refunds, disputed payments, and reconciliation mismatches. Admin does not become a general payment
dashboard; link operators to Stripe for provider detail.

## 10. Observability and reconciliation

- Structured logs and metrics: Stripe request id, local booking/occurrence/payment id, operation,
  provider status, webhook lag/attempts, refund age, and reconciliation outcome. Never log client
  secrets, API keys, webhook bodies, or personal/card data.
- Add a daily reconciliation worker/report covering nonterminal and recently changed
  PaymentIntents/refunds, local succeeded/refunded states, connected-account readiness, and webhook
  backlog. Alert on differences; do not silently rewrite money state without an audited rule.
- Write `docs/runbooks/stripe.md`: key/webhook rotation, Stripe CLI forwarding, event replay,
  ambiguous charge recovery, refund after payout, negative balances, account disabled mid-term,
  disputes, reconciliation, flag rollback, and test-to-live cutover.

## 11. Legal, policy, and support gate

Before any live charge:

- publish versioned payment/off-session consent and refund/cancellation terms and require acceptance
  through `user_agreements`;
- disclose price, frequency/timing, venue net/application fee where legally required, descriptor,
  refund timing, and who supplies the venue service;
- obtain US advice on marketplace/MoR, money transmission, tax collection/reporting, charitable
  entities, and consumer rules; and
- document support ownership for failed payments, refunds, disputes, payout holds, and connected
  account restrictions.

PCI scope must be confirmed from the final web/mobile integration; using Stripe-hosted Elements or
PaymentSheet is necessary but does not justify declaring an SAQ level in this backlog.

## 12. Ordered implementation plan

1. **Decide risk and economics:** complete §2 review; choose MoR/charge parameters, commission,
   minimum charge, refund-cost policy, currency, and pilot venue.
2. **Correct the seam:** implement §7 migration/state machine/port changes with gateway-contract
   tests while the flag remains off in production.
3. **Build Stripe foundation:** add Stripe config/adapter, dual webhook ingestion + worker, object
   retrieval, setup completion, and Stripe test-mode integration tests.
4. **Finish clients and onboarding:** real web/mobile method setup and recovery; Express onboarding,
   explicit opt-in/out, readiness display, login link, and per-venue confirmation gate.
5. **Move test money:** destination PaymentIntents, action recovery, refunds, disputes, receipts,
   Admin visibility, reconciliation, and the runbook. Exercise Stripe test cards and signed webhook
   replays end to end.
6. **Policy and pilot:** publish/re-accept terms, run the complete test suite and real browser/mobile
   journeys, then enable one venue in live mode behind the flag. Reconcile every pilot transaction
   and refund before widening access.

## 13. Verification and failure invariants

Keep `BookingIntegrityTests` green and add coverage for:

- concurrent confirmation/sweep/webhook processing creates one PaymentIntent and one charge;
- timeout after Stripe accepted create/confirm retrieves the same intent instead of creating one;
- declined, expired, insufficient-funds, 3DS-required, processing, and succeeded transitions;
- saved-method replacement followed by retry on the same occurrence;
- duplicate and out-of-order platform/Connect events, bad signatures, and worker replay;
- per-venue readiness/opt-in snapshots versus offline bookings and later opt-out;
- pending/succeeded/failed refunds, cancellation races, refund after payout, and dispute events;
- disabled connected account during a recurring term;
- production startup failures for mock mode, missing secrets, test/live mismatches, and non-HTTPS
  callback URLs; and
- web plus mobile `402`, setup, action-required, onboarding-return, refund, and flag-off paths.

No-double-charge remains the primary invariant. A local row marked failed after an ambiguous Stripe
timeout is not proof that no money moved; retrieve by persisted PaymentIntent id/idempotent create
before any new provider operation.

## 14. Decisions still required

- Merchant of record and `on_behalf_of`/direct-charge choice (§2).
- Commission and minimum per-occurrence charge. Calculate from current quoted Stripe pricing and
  expected refund/dispute losses; do not copy old percentage/flat-fee examples.
- Whether a Stripe-unready venue stays bookable offline (recommended for the existing per-venue
  opt-in promise) or cannot accept new bookings.
- Whether goodwill refunds ship in the pilot or only operator-assisted through Stripe.
- Whether Stripe Tax is applicable after legal/tax review.
- Pilot exit criteria: transaction/refund count, reconciliation period, acceptable payment failure
  rate, and minimum platform reserve.
