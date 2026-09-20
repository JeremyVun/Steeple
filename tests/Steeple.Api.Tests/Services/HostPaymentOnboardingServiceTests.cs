using Microsoft.Extensions.Options;
using Steeple.Api.Contracts.Payments;
using Steeple.Api.Proxies.Payments;

namespace Steeple.Api.Tests.Services;

public sealed class HostPaymentOnboardingServiceTests
{
    private static readonly Guid CallerId = Guid.NewGuid();
    private static readonly Guid VenueId = Guid.NewGuid();

    [Fact]
    public async Task Start_IsManagerScoped_AndReusesDurableProvisioningIdentity()
    {
        var repository = new MemoryRepository();
        var gateway = new FakeConnectGateway();
        var service = CreateService(repository, gateway, isManager: true);

        var first = await service.StartAsync(CallerId, VenueId);
        var second = await service.StartAsync(CallerId, VenueId);

        Assert.Null(first.Error);
        Assert.Null(second.Error);
        Assert.Equal(1, repository.ProvisioningCreates);
        Assert.Equal(1, gateway.AccountCreates);
        Assert.Equal(2, gateway.LinkCreates);
        Assert.Equal(repository.Account!.ProvisioningKey, gateway.LastProvisioningKey);
        Assert.Contains("/app/desk?paymentVenue=", gateway.LastReturnUrl);
        Assert.EndsWith("&paymentReturn=return", gateway.LastReturnUrl);
        Assert.EndsWith("&paymentReturn=refresh", gateway.LastRefreshUrl);

        var deniedGateway = new FakeConnectGateway();
        var denied = await CreateService(new MemoryRepository(), deniedGateway, isManager: false)
            .StartAsync(CallerId, VenueId);
        Assert.Equal(PaymentErrorCodes.NotFound, denied.Error?.Code);
        Assert.Equal(0, deniedGateway.AccountCreates);
    }

    [Fact]
    public async Task Get_RefreshesCurrentProviderState_WithoutChangingOptIn()
    {
        var repository = new MemoryRepository
        {
            Account = Account(ready: true, optedIn: true),
        };
        var gateway = new FakeConnectGateway
        {
            Retrieved = new ProviderAccountSnapshot("acct_test", true, false, false, ["external_account"], "requirements.past_due"),
        };
        var service = CreateService(repository, gateway, isManager: true);

        var result = await service.GetAsync(CallerId, VenueId);

        Assert.Equal("restricted", result.Value?.Status);
        Assert.True(result.Value?.OptedIn);
        Assert.False(result.Value?.OnlinePaymentsAvailable);
        Assert.Equal(["external_account"], result.Value?.RequirementsDue);
    }

    [Fact]
    public async Task Get_HidesLegacyMockIdentity_AndStartPromotesItToStripe()
    {
        var repository = new MemoryRepository
        {
            Account = Account(ready: true, optedIn: true),
        };
        repository.Account.Provider = "mock";
        repository.Account.ProviderAccountId = "acct_mock_old";
        var gateway = new FakeConnectGateway();
        var service = CreateService(repository, gateway, isManager: true);

        var before = await service.GetAsync(CallerId, VenueId);
        var started = await service.StartAsync(CallerId, VenueId);

        Assert.Equal("notStarted", before.Value?.Status);
        Assert.False(before.Value?.OnboardingStarted);
        Assert.Null(started.Error);
        Assert.Equal("stripe", repository.Account.Provider);
        Assert.Equal("acct_test", repository.Account.ProviderAccountId);
        Assert.Null(repository.Account.OptedInAtUtc);
    }

    [Fact]
    public async Task OptIn_RequiresCurrentReadiness_AndOptOutAlwaysWorks()
    {
        var repository = new MemoryRepository { Account = Account(ready: false, optedIn: false) };
        var gateway = new FakeConnectGateway
        {
            Retrieved = new ProviderAccountSnapshot("acct_test", false, false, false, ["business_profile.url"], null),
        };
        var service = CreateService(repository, gateway, isManager: true);

        var blocked = await service.SetOptInAsync(CallerId, VenueId, true);
        Assert.Equal(PaymentErrorCodes.AccountNotReady, blocked.Error?.Code);

        gateway.Retrieved = new ProviderAccountSnapshot("acct_test", true, true, true, [], null);
        var enabled = await service.SetOptInAsync(CallerId, VenueId, true);
        Assert.True(enabled.Value?.OptedIn);

        gateway.Retrieved = new ProviderAccountSnapshot("acct_test", true, false, false, [], "requirements.past_due");
        var disabled = await service.SetOptInAsync(CallerId, VenueId, false);
        Assert.False(disabled.Value?.OptedIn);
    }

    [Fact]
    public async Task Webhook_Deduplicates_AndRetrievesCurrentAccountState()
    {
        var repository = new MemoryRepository { Account = Account(ready: false, optedIn: true) };
        var gateway = new FakeConnectGateway
        {
            Verified = new VerifiedConnectEvent("evt_1", "account.updated", "acct_test", "acct_test", false),
            Retrieved = new ProviderAccountSnapshot("acct_test", true, true, true, [], null),
        };
        var service = CreateService(repository, gateway, isManager: true, webhookSecret: "whsec_test");

        var first = await service.ProcessWebhookAsync("signed body", "signature");
        var replay = await service.ProcessWebhookAsync("signed body", "signature");

        Assert.Null(first.Error);
        Assert.Null(replay.Error);
        Assert.Equal(1, gateway.Retrieves);
        Assert.True(repository.Account!.ChargesEnabled);
        Assert.NotNull(repository.Account.OptedInAtUtc);
        var ledger = Assert.Single(repository.Webhooks.Values);
        Assert.NotNull(ledger.ProcessedAtUtc);
        Assert.Equal(1, ledger.Attempts);
    }

    [Fact]
    public async Task Webhook_WithoutConfiguredSecret_IsUnavailable()
    {
        var result = await CreateService(new MemoryRepository(), new FakeConnectGateway(), true)
            .ProcessWebhookAsync("body", "signature");

        Assert.Equal(PaymentErrorCodes.ProviderUnavailable, result.Error?.Code);
    }

    [Fact]
    public async Task MockComplete_PreservesLegacyReadyAndOptedInCollapse()
    {
        var repository = new MemoryRepository();
        var service = CreateService(repository, new MockPaymentGateway(), isManager: true);

        await service.StartAsync(CallerId, VenueId);
        var completed = await service.CompleteMockAsync(CallerId, VenueId);

        Assert.Equal("ready", completed.Value?.Status);
        Assert.True(completed.Value?.OptedIn);
    }

    private static HostPaymentOnboardingService CreateService(
        MemoryRepository repository,
        IConnectOnboardingGateway gateway,
        bool isManager,
        string webhookSecret = "") =>
        new(
            repository,
            gateway,
            new FixedVenueManagers(isManager),
            new NullAnalytics(),
            TimeProvider.System,
            Options.Create(new PaymentsOptions
            {
                Connect = new ConnectOptions
                {
                    Mode = ConnectOptions.StripeMode,
                    WebBaseUrl = "https://steeple.test/app",
                    WebhookSecret = webhookSecret,
                },
            }));

    private static VenuePaymentAccount Account(bool ready, bool optedIn) => new()
    {
        VenueId = VenueId,
        ProviderAccountId = "acct_test",
        ProvisioningKey = Guid.NewGuid(),
        Provider = "stripe",
        DetailsSubmitted = ready,
        ChargesEnabled = ready,
        PayoutsEnabled = ready,
        RequirementsDue = [],
        OptedInAtUtc = optedIn ? DateTimeOffset.UtcNow : null,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow,
    };

    private sealed class FixedVenueManagers(bool value) : IVenueManagerRepository
    {
        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) => Task.FromResult(value);
        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Guid>>([]);
        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Venue>>([]);
        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<User>>([]);
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class FakeConnectGateway : IConnectOnboardingGateway
    {
        public bool IsMock => false;
        public string Provider => "stripe";
        public int AccountCreates { get; private set; }
        public int LinkCreates { get; private set; }
        public int Retrieves { get; private set; }
        public Guid LastProvisioningKey { get; private set; }
        public string LastReturnUrl { get; private set; } = "";
        public string LastRefreshUrl { get; private set; } = "";
        public ProviderAccountSnapshot Retrieved { get; set; } =
            new("acct_test", false, false, false, [], null);
        public VerifiedConnectEvent Verified { get; set; } =
            new("evt_default", "account.updated", "acct_test", "acct_test", false);

        public Task<ProviderAccountSnapshot> FindOrCreateAccountAsync(Guid venueId, Guid provisioningKey, CancellationToken ct = default)
        {
            AccountCreates++;
            LastProvisioningKey = provisioningKey;
            return Task.FromResult(Retrieved);
        }

        public Task<ProviderAccountSnapshot> RetrieveAccountAsync(string providerAccountId, CancellationToken ct = default)
        {
            Retrieves++;
            return Task.FromResult(Retrieved);
        }

        public Task<string> CreateAccountLinkAsync(string providerAccountId, string returnUrl, string refreshUrl, CancellationToken ct = default)
        {
            LinkCreates++;
            LastReturnUrl = returnUrl;
            LastRefreshUrl = refreshUrl;
            return Task.FromResult("https://connect.stripe.com/setup/test");
        }

        public Task<string> CreateDashboardLinkAsync(string providerAccountId, CancellationToken ct = default) =>
            Task.FromResult("https://connect.stripe.com/express/test");

        public VerifiedConnectEvent VerifyWebhook(string payload, string signature, string secret) => Verified;
    }

    private sealed class MemoryRepository : IPaymentRepository
    {
        private readonly object _lock = new();
        public VenuePaymentAccount? Account { get; set; }
        public int ProvisioningCreates { get; private set; }
        public Dictionary<string, PaymentWebhookEvent> Webhooks { get; } = [];

        public Task<User?> GetUserAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<User?>(null);
        public Task<VenuePaymentAccount?> GetVenueAccountAsync(Guid venueId, CancellationToken ct = default) => Task.FromResult(Account);
        public Task<VenuePaymentAccount?> GetVenueAccountByProviderIdAsync(string providerAccountId, CancellationToken ct = default) =>
            Task.FromResult(Account?.ProviderAccountId == providerAccountId ? Account : null);
        public Task ReloadVenueAccountAsync(VenuePaymentAccount account, CancellationToken ct = default) => Task.CompletedTask;
        public Task AcquireAccountStateLockAsync(string providerAccountId, CancellationToken ct = default) => Task.CompletedTask;
        public Task ReleaseAccountStateLockAsync(string providerAccountId, CancellationToken ct = default) => Task.CompletedTask;

        public Task<VenuePaymentAccount> GetOrCreateVenueProvisioningAsync(
            Guid venueId, string provider, DateTimeOffset nowUtc, CancellationToken ct = default)
        {
            lock (_lock)
            {
                if (Account is null)
                {
                    ProvisioningCreates++;
                    Account = new VenuePaymentAccount
                    {
                        VenueId = venueId,
                        ProvisioningKey = Guid.NewGuid(),
                        Provider = provider,
                        CreatedAtUtc = nowUtc,
                        UpdatedAtUtc = nowUtc,
                    };
                }
                else if (Account.Provider == "mock" && provider == "stripe")
                {
                    Account.Provider = "stripe";
                    Account.ProviderAccountId = null;
                    Account.ProvisioningKey = Guid.NewGuid();
                    Account.DetailsSubmitted = false;
                    Account.ChargesEnabled = false;
                    Account.PayoutsEnabled = false;
                    Account.RequirementsDue = [];
                    Account.DisabledReason = null;
                    Account.OptedInAtUtc = null;
                    Account.UpdatedAtUtc = nowUtc;
                }
                return Task.FromResult(Account);
            }
        }

        public Task<(PaymentWebhookEvent Event, bool Added)> GetOrAddWebhookEventAsync(PaymentWebhookEvent webhookEvent, CancellationToken ct = default)
        {
            lock (_lock)
            {
                var key = $"{webhookEvent.Source}:{webhookEvent.ProviderEventId}";
                if (Webhooks.TryGetValue(key, out var existing)) return Task.FromResult((existing, false));
                Webhooks[key] = webhookEvent;
                return Task.FromResult((webhookEvent, true));
            }
        }

        public Task<bool> TryAddPaymentAsync(Payment payment, CancellationToken ct = default) => Task.FromResult(false);
        public Task<IReadOnlyList<Payment>> GetForBookingsAsync(IReadOnlyList<Guid> bookingIds, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Payment>>([]);
        public Task<IReadOnlyList<ChargeCandidate>> GetChargeCandidatesAsync(DateTimeOffset nowUtc, DateTimeOffset windowEndUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<ChargeCandidate>>([]);
        public Task<ChargeCandidate?> GetFirstChargeCandidateForBookingAsync(Guid bookingId, CancellationToken ct = default) => Task.FromResult<ChargeCandidate?>(null);
        public Task<IReadOnlyList<Payment>> GetRefundableAsync(Guid? bookingId = null, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Payment>>([]);
        public Task<IReadOnlyList<Payment>> GetStalePendingAsync(DateTimeOffset olderThanUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Payment>>([]);
        public Task<bool> WasPreviousOccurrencePaymentCancelledAsync(Guid bookingId, DateTimeOffset beforeStartUtc, CancellationToken ct = default) => Task.FromResult(false);
        public Task SaveAsync(CancellationToken ct = default) => Task.CompletedTask;
        public Task<bool> TryAcquireSweepLockAsync(CancellationToken ct = default) => Task.FromResult(true);
        public Task ReleaseSweepLockAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}
