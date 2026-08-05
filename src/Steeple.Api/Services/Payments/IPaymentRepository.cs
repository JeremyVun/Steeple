
namespace Steeple.Api.Services.Payments;
/// <summary>
/// Port: persistence for the Payments module. Owns <c>payments</c> and
/// <c>venue_payment_accounts</c> plus the users' payment-identity columns; it <b>reads</b>
/// booking occurrences (charge candidates, refundables) but never mutates them — occurrence and
/// booking state changes go through the Bookings service (module-ownership rule).
/// </summary>
public interface IPaymentRepository
{
    /// <summary>The user (payment identity columns included). Null when unknown.</summary>
    Task<User?> GetUserAsync(Guid userId, CancellationToken ct = default);

    /// <summary>The venue's payout account state. Null when onboarding never started.</summary>
    Task<VenuePaymentAccount?> GetVenueAccountAsync(Guid venueId, CancellationToken ct = default);

    /// <summary>Persists a new venue payout account.</summary>
    Task AddVenueAccountAsync(VenuePaymentAccount account, CancellationToken ct = default);

    /// <summary>
    /// Claims an occurrence by inserting the payment row. Returns <c>false</c> when the
    /// one-live-payment-per-occurrence partial unique index rejects it (another sweeper/request
    /// already holds the claim) — nothing was written.
    /// </summary>
    Task<bool> TryAddPaymentAsync(Payment payment, CancellationToken ct = default);

    /// <summary>All payment rows (any status) for the given bookings, newest attempt first.</summary>
    Task<IReadOnlyList<Payment>> GetForBookingsAsync(IReadOnlyList<Guid> bookingIds, CancellationToken ct = default);

    /// <summary>
    /// Occurrences due for charging: <c>Scheduled</c>, on a <c>Confirmed</c> booking with a price
    /// snapshot, starting before <paramref name="windowEndUtc"/> (and not yet started), with no
    /// live (non-failed) payment row. Graph loaded (booking → room → venue, organizer); failure
    /// history summarized per candidate.
    /// </summary>
    Task<IReadOnlyList<ChargeCandidate>> GetChargeCandidatesAsync(DateTimeOffset nowUtc, DateTimeOffset windowEndUtc, CancellationToken ct = default);

    /// <summary>The next chargeable occurrence of one booking (the at-confirmation charge), if any.</summary>
    Task<ChargeCandidate?> GetFirstChargeCandidateForBookingAsync(Guid bookingId, CancellationToken ct = default);

    /// <summary>
    /// Succeeded payments sitting on cancelled occurrences — the declarative refund rule
    /// (docs/contracts/payments.md: a cancelled occurrence's charge is always returned). Graph
    /// loaded for notification display fields.
    /// </summary>
    Task<IReadOnlyList<Payment>> GetRefundableAsync(Guid? bookingId = null, CancellationToken ct = default);

    /// <summary>
    /// Pending rows older than <paramref name="olderThanUtc"/> — a crash between claim and
    /// gateway outcome; re-driven through the gateway under the same idempotency key.
    /// </summary>
    Task<IReadOnlyList<Payment>> GetStalePendingAsync(DateTimeOffset olderThanUtc, CancellationToken ct = default);

    /// <summary>
    /// Whether the booking occurrence immediately preceding <paramref name="beforeStartUtc"/> was
    /// auto-cancelled for payment failure (cancelled while its booking stayed confirmed, with a
    /// failed attempt on record) — the "2 consecutive auto-cancels" ladder input.
    /// </summary>
    Task<bool> WasPreviousOccurrencePaymentCancelledAsync(Guid bookingId, DateTimeOffset beforeStartUtc, CancellationToken ct = default);

    /// <summary>Flushes mutations to already-loaded rows (status transitions, method cache writes).</summary>
    Task SaveAsync(CancellationToken ct = default);

    /// <summary>Takes the cross-instance sweep advisory lock; false = another sweeper holds it.</summary>
    Task<bool> TryAcquireSweepLockAsync(CancellationToken ct = default);

    /// <summary>Releases the sweep advisory lock.</summary>
    Task ReleaseSweepLockAsync(CancellationToken ct = default);
}

/// <summary>
/// One occurrence the charge machinery may act on: the occurrence with its display graph loaded
/// (booking → room → venue, organizer) plus a summary of prior failed attempts.
/// </summary>
public sealed record ChargeCandidate(
    BookingOccurrence Occurrence,
    int FailedAttempts,
    DateTimeOffset? LastFailureAtUtc);
