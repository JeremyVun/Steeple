namespace Steeple.Api.Services.Payments;

public interface IConnectOnboardingGateway
{
    bool IsMock { get; }
    string Provider { get; }
    Task<ProviderAccountSnapshot> FindOrCreateAccountAsync(Guid venueId, Guid provisioningKey, CancellationToken ct = default);
    Task<ProviderAccountSnapshot> RetrieveAccountAsync(string providerAccountId, CancellationToken ct = default);
    Task<string> CreateAccountLinkAsync(string providerAccountId, string returnUrl, string refreshUrl, CancellationToken ct = default);
    Task<string> CreateDashboardLinkAsync(string providerAccountId, CancellationToken ct = default);
    VerifiedConnectEvent VerifyWebhook(string payload, string signature, string secret);
}

public sealed record ProviderAccountSnapshot(
    string Id,
    bool DetailsSubmitted,
    bool ChargesEnabled,
    bool PayoutsEnabled,
    IReadOnlyList<string> RequirementsDue,
    string? DisabledReason);

public sealed record VerifiedConnectEvent(
    string Id,
    string Type,
    string? ProviderAccountId,
    string? ProviderObjectId,
    bool LiveMode);

public class ConnectProviderException : Exception
{
    public ConnectProviderException(string message, Exception? inner = null) : base(message, inner) { }
}

public sealed class ConnectWebhookSignatureException : ConnectProviderException
{
    public ConnectWebhookSignatureException(Exception inner)
        : base("Stripe webhook signature verification failed.", inner) { }
}
