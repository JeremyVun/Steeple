
namespace Steeple.Persistence.Constants;
/// <summary>
/// Lifecycle of a <see cref="Models.Payment"/> row (docs/contracts/payments.md). Failed rows
/// leave the one-live-payment-per-occurrence partial unique index so a retry can claim again;
/// every other status holds the claim.
/// </summary>
public enum PaymentStatus
{
    /// <summary>The occurrence is claimed; the gateway charge is in flight (or crash-recovering).</summary>
    Pending = 0,

    /// <summary>The gateway needs customer action (3DS etc. — Stripe-time; the mock never emits it).</summary>
    RequiresAction = 1,

    /// <summary>The charge landed.</summary>
    Succeeded = 2,

    /// <summary>The charge failed — superseded by any later attempt, never deleted.</summary>
    Failed = 3,

    /// <summary>The succeeded charge was refunded in full.</summary>
    Refunded = 4,

    /// <summary>The charge is under dispute (Stripe-time; the mock never emits it).</summary>
    Disputed = 5,
}
