using Steeple.Api.Contracts.Payments;

namespace Steeple.Api.Services.Payments;
/// <summary>
/// Use-cases of the Payments module (docs/contracts/payments.md): the guest method-on-file loop,
/// venue payout onboarding (mock-collapsed), the charge machinery (at-confirmation kick + the
/// sweeper's due/refund passes), and the read side other modules project onto booking wire
/// shapes. Owns <c>payments</c> / <c>venue_payment_accounts</c> / users' payment identity;
/// never mutates occurrences or bookings — auto-cancel instructions are returned to the
/// <see cref="PaymentSweeper"/>, which routes them through the Bookings service.
/// </summary>
public interface IPaymentService
{
    /// <summary>Ensures the caller's provider customer and opens a setup intent.</summary>
    Task<SetupIntentResponse> CreateSetupAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// The mock stand-in for the Elements confirm step: records brand + last4 display data as the
    /// caller's method on file. Rejects anything that isn't exactly four digits of last4 — no
    /// field exists for a full card number by construction.
    /// </summary>
    Task<PaymentResult<MyPaymentsDto>> ConfirmMockSetupAsync(Guid userId, MockConfirmSetupRequest request, CancellationToken ct = default);

    /// <summary>The caller's saved-method summary.</summary>
    Task<MyPaymentsDto> GetMyPaymentsAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Whether the user has a payment method on file (the apply gate's question).</summary>
    Task<bool> HasPaymentMethodAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Creates/reuses the venue's payout account and returns a fresh onboarding link (manager-scoped).</summary>
    Task<PaymentResult<OnboardingLinkDto>> StartOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default);

    /// <summary>
    /// Mock-completes onboarding in one step: flips DetailsSubmitted/ChargesEnabled/PayoutsEnabled
    /// and records the opt-in (manager-scoped). At Stripe-time this endpoint retires in favor of
    /// <c>account.updated</c> webhooks + a separate opt-in switch.
    /// </summary>
    Task<PaymentResult<VenuePaymentStateDto>> CompleteMockOnboardingAsync(Guid callerId, Guid venueId, CancellationToken ct = default);

    /// <summary>The venue's payout state (manager-scoped).</summary>
    Task<PaymentResult<VenuePaymentStateDto>> GetVenuePaymentsAsync(Guid callerId, Guid venueId, CancellationToken ct = default);

    /// <summary>
    /// The post-commit charge kick after a booking confirms (instant submit or approval): charges
    /// the booking's first upcoming occurrence immediately — never called inside the booking
    /// transaction. No-ops for bookings without a price snapshot.
    /// </summary>
    Task ChargeAtConfirmationAsync(Guid bookingId, CancellationToken ct = default);

    /// <summary>
    /// One sweep pass at <paramref name="nowUtc"/>: recovers stale Pending rows, charges due
    /// occurrences (T−window), and refunds cancelled-but-charged occurrences. Returns the
    /// occurrences the failure ladder says to auto-cancel — the caller (the sweeper) routes them
    /// through the Bookings service and then calls <see cref="RefundCancelledForBookingAsync"/>.
    /// </summary>
    Task<SweepOutcome> SweepAsync(DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>Immediately refunds succeeded charges on this booking's cancelled occurrences.</summary>
    Task RefundCancelledForBookingAsync(Guid bookingId, CancellationToken ct = default);

    /// <summary>
    /// Latest payment state per occurrence for the given bookings (live row's status, else the
    /// most recent failed attempt) — the read the Bookings module projects onto its wire shapes.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, PaymentStatus>> GetOccurrenceStatusesAsync(IReadOnlyList<Guid> bookingIds, CancellationToken ct = default);
}

/// <summary>One auto-cancel instruction from the failure ladder.</summary>
/// <param name="CancelRemainingTerm">True when this is the second consecutive payment-failure
/// auto-cancel on the booking — the remaining term cancels with it (payments.md §5).</param>
public sealed record PaymentFailureCancellation(Guid BookingId, Guid OccurrenceId, bool CancelRemainingTerm);

/// <summary>Outcome of one sweep pass (counts are for logging/telemetry).</summary>
public sealed record SweepOutcome(int Charged, int Failed, int Refunded, IReadOnlyList<PaymentFailureCancellation> ToCancel)
{
    /// <summary>An idle pass.</summary>
    public static readonly SweepOutcome Empty = new(0, 0, 0, []);
}

/// <summary>Result envelope for payments use-cases (same idiom as <c>ApplicationResult</c>).</summary>
public sealed record PaymentResult<T>(T? Value, PaymentError? Error) where T : class
{
    /// <summary>Successful outcome.</summary>
    public static PaymentResult<T> Ok(T value) => new(value, null);

    /// <summary>Failed outcome carrying the wire error code.</summary>
    public static PaymentResult<T> Fail(string code, string detail) => new(null, new PaymentError(code, detail));
}

/// <summary>A stable wire error code plus a human-readable detail.</summary>
public sealed record PaymentError(string Code, string Detail);

/// <summary>The stable payments error codes documented in docs/contracts/payments.md.</summary>
public static class PaymentErrorCodes
{
    /// <summary>Unknown resource, or the caller doesn't manage it (no existence leak).</summary>
    public const string NotFound = "not_found";

    /// <summary>A payments request field failed validation (bad last4, unknown client secret…).</summary>
    public const string InvalidPayment = "invalid_payment";
}
