
namespace Steeple.Api.Services.Payments;
/// <summary>
/// Port: the payment provider (docs/backlog/payments.md §8). Shaped so the later
/// <c>StripePaymentGateway</c> is a drop-in behind the same calls (EnsureCustomer ↔ Customers,
/// CreateSetupIntent ↔ SetupIntents, ChargeOccurrence ↔ off-session PaymentIntents with an
/// idempotency key, Refund ↔ Refunds with reverse_transfer, connected accounts ↔ Connect).
/// Webhook verification/parsing deliberately joins the port only at Stripe-time — the mock has
/// no webhooks (docs/contracts/payments.md).
/// </summary>
public interface IPaymentGateway
{
    /// <summary>Finds-or-creates the provider customer for a user; returns the customer id.</summary>
    Task<string> EnsureCustomerAsync(Guid userId, string? email, string? existingCustomerId, CancellationToken ct = default);

    /// <summary>Starts saving a payment method against the customer; returns the client secret.</summary>
    Task<string> CreateSetupIntentAsync(string customerId, CancellationToken ct = default);

    /// <summary>
    /// Charges one occurrence off-session. <b>Idempotency key = the occurrence id</b> — replays
    /// after a crash or retry can never create a second charge (payments.md §5).
    /// </summary>
    Task<GatewayChargeResult> ChargeOccurrenceAsync(ChargeOccurrenceRequest request, CancellationToken ct = default);

    /// <summary>Refunds a succeeded charge in full (Stripe-time: reverse_transfer + refund_application_fee).</summary>
    Task<GatewayRefundResult> RefundAsync(string providerPaymentId, CancellationToken ct = default);

    /// <summary>Finds-or-creates the venue's connected payout account; returns the account id.</summary>
    Task<string> CreateConnectedAccountAsync(Guid venueId, string? existingAccountId, CancellationToken ct = default);

    /// <summary>A one-time onboarding link for the connected account (links expire; re-request freely).</summary>
    Task<string> CreateAccountLinkAsync(string providerAccountId, CancellationToken ct = default);
}

/// <summary>
/// One off-session charge ask. <paramref name="MethodLast4"/> is display data riding along so the
/// <b>mock</b> can simulate declines (a saved card ending 0002 always declines, mirroring
/// Stripe's test-card convention); the Stripe adapter ignores it — the method lives on the customer.
/// </summary>
public sealed record ChargeOccurrenceRequest(
    Guid OccurrenceId,
    string CustomerId,
    decimal Amount,
    string Currency,
    string? MethodLast4);

/// <summary>Outcome of a charge attempt: the provider payment id plus success or a failure code.</summary>
public sealed record GatewayChargeResult(bool Succeeded, string ProviderPaymentId, string? FailureCode);

/// <summary>Outcome of a refund attempt.</summary>
public sealed record GatewayRefundResult(bool Succeeded, string? FailureCode);
