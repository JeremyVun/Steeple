using Stripe;

namespace Steeple.Api.Proxies.Payments;

public sealed class StripeConnectOnboardingGateway : IConnectOnboardingGateway
{
    private const string VenueMetadata = "steeple_venue_id";
    private const string ProvisioningMetadata = "steeple_provisioning_key";

    private readonly IStripeClient _client;

    public StripeConnectOnboardingGateway(IStripeClient client) => _client = client;

    public bool IsMock => false;
    public string Provider => "stripe";

    public async Task<ProviderAccountSnapshot> FindOrCreateAccountAsync(
        Guid venueId, Guid provisioningKey, CancellationToken ct = default)
    {
        Account? existing;
        try
        {
            existing = await FindProvisionedAccountAsync(provisioningKey, ct).ConfigureAwait(false);
        }
        catch (Exception exception) when (IsProviderFailure(exception, ct))
        {
            throw new ConnectProviderException("Stripe account provisioning is unavailable.", exception);
        }
        if (existing is not null)
        {
            return ToSnapshot(existing);
        }

        var service = new AccountService(_client);
        try
        {
            var account = await service.CreateAsync(
                new AccountCreateOptions
                {
                    Type = "express",
                    Metadata = new Dictionary<string, string>
                    {
                        [VenueMetadata] = venueId.ToString("D"),
                        [ProvisioningMetadata] = provisioningKey.ToString("D"),
                    },
                },
                new RequestOptions { IdempotencyKey = $"connect-account:{provisioningKey:N}" },
                ct).ConfigureAwait(false);
            return ToSnapshot(account);
        }
        catch (Exception exception) when (IsProviderFailure(exception, ct))
        {
            try
            {
                existing = await FindProvisionedAccountAsync(provisioningKey, ct).ConfigureAwait(false);
            }
            catch (Exception recoveryException) when (IsProviderFailure(recoveryException, ct))
            {
                throw new ConnectProviderException("Stripe account provisioning is unavailable.", exception);
            }

            return existing is not null
                ? ToSnapshot(existing)
                : throw new ConnectProviderException("Stripe account provisioning is unavailable.", exception);
        }
    }

    public async Task<ProviderAccountSnapshot> RetrieveAccountAsync(
        string providerAccountId, CancellationToken ct = default)
    {
        try
        {
            var account = await new AccountService(_client).GetAsync(providerAccountId, cancellationToken: ct)
                .ConfigureAwait(false);
            return ToSnapshot(account);
        }
        catch (Exception exception) when (IsProviderFailure(exception, ct))
        {
            throw new ConnectProviderException("Stripe account retrieval is unavailable.", exception);
        }
    }

    public async Task<string> CreateAccountLinkAsync(
        string providerAccountId, string returnUrl, string refreshUrl, CancellationToken ct = default)
    {
        try
        {
            var link = await new AccountLinkService(_client).CreateAsync(
                new AccountLinkCreateOptions
                {
                    Account = providerAccountId,
                    ReturnUrl = returnUrl,
                    RefreshUrl = refreshUrl,
                    Type = "account_onboarding",
                    CollectionOptions = new AccountLinkCollectionOptionsOptions { Fields = "currently_due" },
                },
                cancellationToken: ct).ConfigureAwait(false);
            return RequireStripeUrl(link.Url);
        }
        catch (Exception exception) when (IsProviderFailure(exception, ct))
        {
            throw new ConnectProviderException("Stripe onboarding is unavailable.", exception);
        }
    }

    public async Task<string> CreateDashboardLinkAsync(string providerAccountId, CancellationToken ct = default)
    {
        try
        {
            var link = await new AccountLoginLinkService(_client).CreateAsync(
                providerAccountId, cancellationToken: ct).ConfigureAwait(false);
            return RequireStripeUrl(link.Url);
        }
        catch (Exception exception) when (IsProviderFailure(exception, ct))
        {
            throw new ConnectProviderException("Stripe Dashboard is unavailable.", exception);
        }
    }

    public VerifiedConnectEvent VerifyWebhook(string payload, string signature, string secret)
    {
        try
        {
            var stripeEvent = EventUtility.ConstructEvent(payload, signature, secret);
            var objectId = (stripeEvent.Data.Object as Account)?.Id;
            return new VerifiedConnectEvent(
                stripeEvent.Id,
                stripeEvent.Type,
                stripeEvent.Account ?? objectId,
                objectId,
                stripeEvent.Livemode);
        }
        catch (Exception exception)
        {
            throw new ConnectWebhookSignatureException(exception);
        }
    }

    private async Task<Account?> FindProvisionedAccountAsync(Guid provisioningKey, CancellationToken ct)
    {
        var service = new AccountService(_client);
        await foreach (var account in service.ListAutoPagingAsync(
            new AccountListOptions { Limit = 100 }, cancellationToken: ct).ConfigureAwait(false))
        {
            if (account.Metadata.TryGetValue(ProvisioningMetadata, out var value)
                && value.Equals(provisioningKey.ToString("D"), StringComparison.OrdinalIgnoreCase))
            {
                return account;
            }
        }

        return null;
    }

    private static ProviderAccountSnapshot ToSnapshot(Account account) => new(
        account.Id,
        account.DetailsSubmitted,
        account.ChargesEnabled,
        account.PayoutsEnabled,
        account.Requirements?.CurrentlyDue ?? [],
        account.Requirements?.DisabledReason);

    private static bool IsProviderFailure(Exception exception, CancellationToken ct) => exception switch
    {
        StripeException => true,
        HttpRequestException => true,
        TaskCanceledException when !ct.IsCancellationRequested => true,
        _ => false,
    };

    private static string RequireStripeUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || !uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            || !uri.Host.Equals("connect.stripe.com", StringComparison.OrdinalIgnoreCase)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !uri.IsDefaultPort)
        {
            throw new ConnectProviderException("Stripe returned an unsafe redirect URL.");
        }

        return uri.AbsoluteUri;
    }
}
