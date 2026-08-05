
namespace Steeple.Persistence.Models;
/// <summary>
/// One charge/refund attempt on a <see cref="BookingOccurrence"/> (docs/contracts/payments.md).
/// A partial unique index (014-payments.sql) allows at most one non-<see cref="PaymentStatus.Failed"/>
/// row per occurrence — claiming the occurrence with a Pending row before calling the gateway is
/// what makes double-charging impossible under concurrent sweepers. Failed attempts are kept as
/// history, never deleted.
/// </summary>
public class Payment
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the charged occurrence.</summary>
    public Guid OccurrenceId { get; set; }

    /// <summary>Foreign key to the owning booking (denormalized for per-booking reads).</summary>
    public Guid BookingId { get; set; }

    /// <summary>The charged amount (the booking's per-occurrence price snapshot).</summary>
    public decimal Amount { get; set; }

    /// <summary>ISO currency code.</summary>
    public string Currency { get; set; } = "USD";

    /// <summary>The platform's cut declared on the charge (0 under the mock gateway).</summary>
    public decimal ApplicationFee { get; set; }

    /// <summary>The provider's payment id (mock: <c>pi_mock_…</c>; Stripe: the PaymentIntent id).</summary>
    public string? ProviderPaymentId { get; set; }

    /// <summary>Current lifecycle state.</summary>
    public PaymentStatus Status { get; set; }

    /// <summary>The provider's failure code when <see cref="PaymentStatus.Failed"/> (e.g. <c>card_declined</c>).</summary>
    public string? FailureCode { get; set; }

    /// <summary>Creation (= occurrence claim) timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Last state-change timestamp (UTC).</summary>
    public DateTimeOffset UpdatedAtUtc { get; set; }

    /// <summary>When the refund was issued; null while not refunded.</summary>
    public DateTimeOffset? RefundedAtUtc { get; set; }

    /// <summary>Navigation to the charged occurrence.</summary>
    public BookingOccurrence? Occurrence { get; set; }

    /// <summary>Navigation to the owning booking.</summary>
    public Booking? Booking { get; set; }
}
