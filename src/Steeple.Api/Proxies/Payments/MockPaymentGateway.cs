using Steeple.Api.Services.Payments;

namespace Steeple.Api.Proxies.Payments;
/// <summary>
/// The mock-era <see cref="IPaymentGateway"/>: everything succeeds instantly, ids are synthetic
/// (<c>cus_mock_… / seti_mock_… / pi_mock_… / acct_mock_…</c>), and no money exists anywhere.
/// One designated failure lever keeps the failure ladder testable end-to-end: <b>a saved card
/// ending 0002 always declines at charge time</b> (Stripe's decline test card is
/// 4000…0002, so the convention survives the Stripe swap). Setup never fails — dead cards die
/// between apply and week 12, which is exactly the ladder the sweeper exists for.
/// </summary>
public sealed class MockPaymentGateway : IPaymentGateway
{
    /// <summary>The last4 that makes every charge decline (the mock's magic failing token).</summary>
    public const string DecliningLast4 = "0002";

    /// <inheritdoc />
    public Task<string> EnsureCustomerAsync(Guid userId, string? email, string? existingCustomerId, CancellationToken ct = default) =>
        Task.FromResult(existingCustomerId ?? $"cus_mock_{userId:N}");

    /// <inheritdoc />
    public Task<string> CreateSetupIntentAsync(string customerId, CancellationToken ct = default) =>
        Task.FromResult($"seti_mock_{Guid.NewGuid():N}_secret_{Guid.NewGuid():N}");

    /// <inheritdoc />
    public Task<GatewayChargeResult> ChargeOccurrenceAsync(ChargeOccurrenceRequest request, CancellationToken ct = default)
    {
        // Deterministic provider id from the idempotency key (= occurrence id): a replayed charge
        // yields the same payment id, mirroring how Stripe idempotency behaves.
        var providerPaymentId = $"pi_mock_{request.OccurrenceId:N}";
        return Task.FromResult(request.MethodLast4 == DecliningLast4
            ? new GatewayChargeResult(false, providerPaymentId, "card_declined")
            : new GatewayChargeResult(true, providerPaymentId, null));
    }

    /// <inheritdoc />
    public Task<GatewayRefundResult> RefundAsync(string providerPaymentId, CancellationToken ct = default) =>
        Task.FromResult(new GatewayRefundResult(true, null));

    /// <inheritdoc />
    public Task<string> CreateConnectedAccountAsync(Guid venueId, string? existingAccountId, CancellationToken ct = default) =>
        Task.FromResult(existingAccountId ?? $"acct_mock_{venueId:N}");

    /// <inheritdoc />
    public Task<string> CreateAccountLinkAsync(string providerAccountId, CancellationToken ct = default) =>
        Task.FromResult($"mock-onboarding:{providerAccountId}");
}
