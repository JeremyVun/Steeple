using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Steeple.Api.Contracts.Payments;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

[Collection(PostgresCollection.Name)]
public sealed class StripeOnboardingPersistenceTests
{
    private static readonly Guid ProvisioningVenueId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid WebhookRaceVenueId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ProviderTransitionVenueId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private readonly PostgresDatabaseFixture _fixture;

    public StripeOnboardingPersistenceTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task ConcurrentProvisioning_ConvergesOnOneDurableIdentity()
    {
        using var gate = new Barrier(2);
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var repository = new EfPaymentRepository(db);
            gate.SignalAndWait();
            return await repository.GetOrCreateVenueProvisioningAsync(ProvisioningVenueId, "stripe", DateTimeOffset.UtcNow);
        })));

        Assert.Equal(results[0].ProvisioningKey, results[1].ProvisioningKey);
        await using var verify = CreateContext();
        Assert.Single(await verify.VenuePaymentAccounts.Where(a => a.VenueId == ProvisioningVenueId).ToListAsync());
    }

    [Fact]
    public async Task WebhookLedger_DeduplicatesConcurrentDelivery()
    {
        var eventId = $"evt_{Guid.NewGuid():N}";
        using var gate = new Barrier(2);
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var repository = new EfPaymentRepository(db);
            gate.SignalAndWait();
            return await repository.GetOrAddWebhookEventAsync(new PaymentWebhookEvent
            {
                Source = "connect",
                ProviderEventId = eventId,
                Type = "account.updated",
                ProviderAccountId = "acct_test",
                ProviderObjectId = "acct_test",
                ReceivedAtUtc = DateTimeOffset.UtcNow,
            });
        })));

        Assert.Single(results, result => result.Added);
        await using var verify = CreateContext();
        Assert.Single(await verify.PaymentWebhookEvents.Where(e => e.ProviderEventId == eventId).ToListAsync());
    }

    [Fact]
    public async Task ConcurrentWebhooks_CannotOverwriteNewerProviderState()
    {
        await using (var seed = CreateContext())
        {
            var account = await new EfPaymentRepository(seed)
                .GetOrCreateVenueProvisioningAsync(WebhookRaceVenueId, "stripe", DateTimeOffset.UtcNow);
            account.ProviderAccountId = "acct_freshness_race";
            account.DetailsSubmitted = false;
            account.ChargesEnabled = false;
            account.PayoutsEnabled = false;
            account.RequirementsDue = ["business_profile.url"];
            account.DisabledReason = null;
            await seed.SaveChangesAsync();
        }

        var gateway = new RacingConnectGateway();
        await using var firstDb = CreateContext();
        await using var secondDb = CreateContext();
        var firstService = Service(firstDb, gateway);
        var secondService = Service(secondDb, gateway);

        var first = firstService.ProcessWebhookAsync("evt_old", "signed");
        await gateway.FirstRetrieveEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        gateway.Current = new ProviderAccountSnapshot("acct_freshness_race", true, true, true, [], null);
        var second = secondService.ProcessWebhookAsync("evt_new", "signed");
        gateway.ReleaseFirstRetrieve.SetResult();

        await Task.WhenAll(first, second);

        await using var verify = CreateContext();
        var persisted = await verify.VenuePaymentAccounts.SingleAsync(a => a.VenueId == WebhookRaceVenueId);
        Assert.True(persisted.DetailsSubmitted);
        Assert.True(persisted.ChargesEnabled);
        Assert.True(persisted.PayoutsEnabled);
        Assert.Empty(persisted.RequirementsDue);
    }

    [Fact]
    public async Task ProviderTransition_ReplacesMockIdentity_ButNeverClobbersStripeIdentity()
    {
        Guid mockProvisioningKey;
        await using (var seed = CreateContext())
        {
            var repository = new EfPaymentRepository(seed);
            var account = await repository.GetOrCreateVenueProvisioningAsync(
                ProviderTransitionVenueId, "mock", DateTimeOffset.UtcNow);
            mockProvisioningKey = account.ProvisioningKey;
            account.ProviderAccountId = "acct_mock_old";
            account.DetailsSubmitted = true;
            account.ChargesEnabled = true;
            account.PayoutsEnabled = true;
            account.OptedInAtUtc = DateTimeOffset.UtcNow;
            await seed.SaveChangesAsync();
        }

        await using (var promote = CreateContext())
        {
            var account = await new EfPaymentRepository(promote).GetOrCreateVenueProvisioningAsync(
                ProviderTransitionVenueId, "stripe", DateTimeOffset.UtcNow);
            Assert.Equal("stripe", account.Provider);
            Assert.Null(account.ProviderAccountId);
            Assert.NotEqual(mockProvisioningKey, account.ProvisioningKey);
            Assert.False(account.DetailsSubmitted);
            Assert.Null(account.OptedInAtUtc);
        }

        await using (var protect = CreateContext())
        {
            var account = await new EfPaymentRepository(protect).GetOrCreateVenueProvisioningAsync(
                ProviderTransitionVenueId, "mock", DateTimeOffset.UtcNow);
            Assert.Equal("stripe", account.Provider);
            Assert.Null(account.ProviderAccountId);
        }
    }

    private SteepleDbContext CreateContext() => new(
        new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static HostPaymentOnboardingService Service(SteepleDbContext db, IConnectOnboardingGateway gateway) =>
        new(
            new EfPaymentRepository(db),
            gateway,
            new NullVenueManagers(),
            new NullAnalytics(),
            TimeProvider.System,
            Options.Create(new PaymentsOptions
            {
                Connect = new ConnectOptions
                {
                    Mode = ConnectOptions.StripeMode,
                    WebBaseUrl = "https://steeple.test",
                    WebhookSecret = "whsec_test",
                },
            }));

    private sealed class RacingConnectGateway : IConnectOnboardingGateway
    {
        private int _retrieves;
        public bool IsMock => false;
        public string Provider => "stripe";
        public TaskCompletionSource FirstRetrieveEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource ReleaseFirstRetrieve { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public ProviderAccountSnapshot Current { get; set; } =
            new("acct_freshness_race", false, false, false, ["business_profile.url"], null);

        public async Task<ProviderAccountSnapshot> RetrieveAccountAsync(string providerAccountId, CancellationToken ct = default)
        {
            var snapshot = Current;
            if (Interlocked.Increment(ref _retrieves) == 1)
            {
                FirstRetrieveEntered.SetResult();
                await ReleaseFirstRetrieve.Task.WaitAsync(ct);
            }
            return snapshot;
        }

        public VerifiedConnectEvent VerifyWebhook(string payload, string signature, string secret) =>
            new(payload, "account.updated", "acct_freshness_race", "acct_freshness_race", false);

        public Task<ProviderAccountSnapshot> FindOrCreateAccountAsync(Guid venueId, Guid provisioningKey, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> CreateAccountLinkAsync(string providerAccountId, string returnUrl, string refreshUrl, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> CreateDashboardLinkAsync(string providerAccountId, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed class NullVenueManagers : IVenueManagerRepository
    {
        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) => Task.FromResult(false);
        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Guid>>([]);
        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Venue>>([]);
        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<User>>([]);
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) => Task.CompletedTask;
    }
}
