using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

/// <summary>Durability and retry proofs for the notification outbox against real PostgreSQL.</summary>
[Collection(PostgresCollection.Name)]
public sealed class NotificationOutboxIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 8, 9, 12, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly PostgresDatabaseFixture _fixture;

    public NotificationOutboxIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    [Fact]
    public async Task Dispatcher_CommitsInboxAndOutboxBeforeAFailingProviderPath()
    {
        await ResetOutboxAsync();
        var user = await SeedUserAsync();

        await using (var db = CreateContext())
        {
            var dispatcher = new NotificationDispatcher(
                new EfNotificationRepository(db),
                new NullAnalytics(),
                new MutableTimeProvider(FixedNow),
                Options.Create(new EmailOptions { WebBaseUrl = "https://steeple.example" }));

            await dispatcher.NotifyAsync(
                [new NotificationRecipient(user.Id, user.Email)],
                NotificationType.ApplicationReceived,
                new { deepLink = "/inbox/applications/atomic" },
                new EmailContent("A request arrived", "Open Steeple."));
        }

        var email = new RecordingEmailGateway { FailuresRemaining = 1 };
        var clock = new MutableTimeProvider(FixedNow);
        await using var rig = CreateWorker(clock, email: email);
        Assert.Equal(2, await rig.Worker.RunOnceAsync());

        await using var readDb = CreateContext();
        Assert.Single(await readDb.Notifications.Where(row => row.UserId == user.Id).ToListAsync());
        var rows = await readDb.NotificationOutbox.OrderBy(row => row.Channel).ToListAsync();
        Assert.Equal(2, rows.Count);

        var emailRow = Assert.Single(rows, row => row.Channel == NotificationOutboxChannel.Email);
        Assert.Equal(1, emailRow.Attempts);
        Assert.Null(emailRow.DeliveredAtUtc);
        Assert.Null(emailRow.FailedAtUtc);
        Assert.Contains("provider failure", emailRow.LastError, StringComparison.Ordinal);

        var pushRow = Assert.Single(rows, row => row.Channel == NotificationOutboxChannel.Push);
        Assert.NotNull(pushRow.DeliveredAtUtc); // no current devices is a successful no-op
    }

    [Fact]
    public async Task Repository_WhenOutboxInsertFails_RollsBackTheInboxInsert()
    {
        await ResetOutboxAsync();
        var user = await SeedUserAsync();
        var inboxId = Guid.NewGuid();

        await using (var db = CreateContext())
        {
            var repository = new EfNotificationRepository(db);
            var inbox = new Notification
            {
                Id = inboxId,
                UserId = user.Id,
                Type = NotificationType.ApplicationReceived,
                PayloadJson = "{}",
                CreatedAtUtc = FixedNow,
            };
            var invalidDelivery = NewEmailOutbox(FixedNow);
            invalidDelivery.Channel = (NotificationOutboxChannel)99;

            await Assert.ThrowsAsync<DbUpdateException>(() =>
                repository.AddRangeAsync([inbox], [invalidDelivery]));
        }

        await using var readDb = CreateContext();
        Assert.False(await readDb.Notifications.AnyAsync(row => row.Id == inboxId));
        Assert.False(await readDb.NotificationOutbox.AnyAsync());
    }

    [Fact]
    public async Task Worker_DeliversEmailAndPushAndStampsBothRows()
    {
        await ResetOutboxAsync();
        var user = await SeedUserAsync();

        await using (var db = CreateContext())
        {
            var dispatcher = new NotificationDispatcher(
                new EfNotificationRepository(db),
                new NullAnalytics(),
                new MutableTimeProvider(FixedNow),
                Options.Create(new EmailOptions()));
            await dispatcher.NotifyAsync(
                [new NotificationRecipient(user.Id, user.Email)],
                NotificationType.ApplicationApproved,
                new { deepLink = "/bookings/worker" },
                new EmailContent("Booked", "Your booking is confirmed."));
        }

        var email = new RecordingEmailGateway();
        var push = new RecordingPushGateway();
        var devices = new FakeDeviceRegistry();
        devices.Tokens[user.Id] = ["fcm-token"];

        await using var rig = CreateWorker(new MutableTimeProvider(FixedNow), email, push, devices);
        Assert.Equal(2, await rig.Worker.RunOnceAsync());

        var sentEmail = Assert.Single(email.Sent);
        Assert.Equal(user.Email, sentEmail.ToEmail);
        Assert.Equal("Booked", sentEmail.Content.Subject);

        var sentPush = Assert.Single(push.Sent);
        Assert.Equal(["fcm-token"], sentPush.Tokens);
        Assert.Equal("applicationApproved", sentPush.Message.Type);
        Assert.Equal("/bookings/worker", sentPush.Message.DeepLink);

        await using var readDb = CreateContext();
        var rows = await readDb.NotificationOutbox.ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, row => Assert.NotNull(row.DeliveredAtUtc));
        Assert.All(rows, row => Assert.Equal(1, row.Attempts));
    }

    [Fact]
    public async Task Worker_ProviderFailureBacksOffThenBecomesTerminalAndObservable()
    {
        await ResetOutboxAsync();
        await SeedOutboxAsync(NewEmailOutbox(FixedNow));

        var clock = new MutableTimeProvider(FixedNow);
        var email = new RecordingEmailGateway { FailuresRemaining = 3 };
        var logger = new RecordingLogger();
        var options = new NotificationOutboxOptions
        {
            BatchSize = 10,
            MaxAttempts = 3,
            BaseRetryDelay = TimeSpan.FromSeconds(10),
            MaxRetryDelay = TimeSpan.FromMinutes(1),
            ClaimLease = TimeSpan.FromMinutes(2),
        };
        await using var rig = CreateWorker(clock, email: email, options: options, logger: logger);

        Assert.Equal(1, await rig.Worker.RunOnceAsync());
        var afterFirst = await SingleOutboxAsync();
        Assert.Equal(1, afterFirst.Attempts);
        Assert.Equal(FixedNow.AddSeconds(10), afterFirst.NextAttemptAtUtc);
        Assert.Null(afterFirst.FailedAtUtc);

        clock.Now = afterFirst.NextAttemptAtUtc;
        Assert.Equal(1, await rig.Worker.RunOnceAsync());
        var afterSecond = await SingleOutboxAsync();
        Assert.Equal(2, afterSecond.Attempts);
        Assert.Equal(clock.Now.AddSeconds(20), afterSecond.NextAttemptAtUtc);
        Assert.Null(afterSecond.FailedAtUtc);

        clock.Now = afterSecond.NextAttemptAtUtc;
        Assert.Equal(1, await rig.Worker.RunOnceAsync());
        var terminal = await SingleOutboxAsync();
        Assert.Equal(3, terminal.Attempts);
        Assert.Equal(clock.Now, terminal.FailedAtUtc);
        Assert.Null(terminal.DeliveredAtUtc);
        Assert.Contains("provider failure", terminal.LastError, StringComparison.Ordinal);
        Assert.Contains(logger.Entries, entry =>
            entry.Level == LogLevel.Error && entry.Message.Contains("permanently failed", StringComparison.Ordinal));

        clock.Now = clock.Now.AddDays(1);
        Assert.Equal(0, await rig.Worker.RunOnceAsync());
    }

    [Fact]
    public async Task Worker_ProcessLossAfterClaim_RedeliversAfterLeaseOnANewWorker()
    {
        await ResetOutboxAsync();
        var row = NewEmailOutbox(FixedNow);
        await SeedOutboxAsync(row);

        await using (var crashedDb = CreateContext())
        {
            var crashedRepository = new EfNotificationRepository(crashedDb);
            var claimed = await crashedRepository.ClaimDueAsync(
                FixedNow, limit: 1, lease: TimeSpan.FromMinutes(2));
            Assert.Equal(row.Id, Assert.Single(claimed).Id);
        } // simulated process loss: no delivered/failure stamp

        var email = new RecordingEmailGateway();
        var restartClock = new MutableTimeProvider(FixedNow.AddMinutes(2).AddSeconds(1));
        await using var restarted = CreateWorker(restartClock, email: email);
        Assert.Equal(1, await restarted.Worker.RunOnceAsync());

        Assert.Single(email.Sent);
        var delivered = await SingleOutboxAsync();
        Assert.Equal(2, delivered.Attempts);
        Assert.NotNull(delivered.DeliveredAtUtc);
    }

    private WorkerRig CreateWorker(
        TimeProvider clock,
        IEmailGateway? email = null,
        IPushGateway? push = null,
        IDeviceRegistry? devices = null,
        NotificationOutboxOptions? options = null,
        RecordingLogger? logger = null)
    {
        var services = new ServiceCollection();
        services.AddDbContext<SteepleDbContext>(builder => builder.UseNpgsql(_fixture.ConnectionString));
        services.AddScoped<INotificationRepository, EfNotificationRepository>();
        services.AddSingleton<IEmailGateway>(email ?? new RecordingEmailGateway());
        services.AddSingleton<IPushGateway>(push ?? new RecordingPushGateway());
        services.AddSingleton<IDeviceRegistry>(devices ?? new FakeDeviceRegistry());

        var provider = services.BuildServiceProvider();
        var worker = new NotificationOutboxWorker(
            provider.GetRequiredService<IServiceScopeFactory>(),
            clock,
            Options.Create(options ?? new NotificationOutboxOptions()),
            logger ?? new RecordingLogger());
        return new WorkerRig(worker, provider);
    }

    private async Task ResetOutboxAsync()
    {
        await using var db = CreateContext();
        await db.NotificationOutbox.ExecuteDeleteAsync();
    }

    private async Task<User> SeedUserAsync()
    {
        await using var db = CreateContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Outbox Tester",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task SeedOutboxAsync(NotificationOutbox row)
    {
        await using var db = CreateContext();
        db.NotificationOutbox.Add(row);
        await db.SaveChangesAsync();
    }

    private async Task<NotificationOutbox> SingleOutboxAsync()
    {
        await using var db = CreateContext();
        return await db.NotificationOutbox.AsNoTracking().SingleAsync();
    }

    private static NotificationOutbox NewEmailOutbox(DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        Channel = NotificationOutboxChannel.Email,
        Kind = NotificationType.ApplicationReceived,
        PayloadJson = JsonSerializer.Serialize(
            new EmailOutboxPayload("person@example.com", "Subject", "Body", null),
            JsonOptions),
        CreatedAtUtc = now,
        NextAttemptAtUtc = now,
    };

    private sealed class WorkerRig(NotificationOutboxWorker worker, ServiceProvider provider) : IAsyncDisposable
    {
        public NotificationOutboxWorker Worker { get; } = worker;
        public ValueTask DisposeAsync() => provider.DisposeAsync();
    }

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class RecordingEmailGateway : IEmailGateway
    {
        public int FailuresRemaining { get; set; }
        public List<(string ToEmail, EmailContent Content)> Sent { get; } = [];

        public Task SendAsync(string toEmail, EmailContent content, CancellationToken ct = default)
        {
            if (FailuresRemaining-- > 0)
            {
                throw new InvalidOperationException("provider failure");
            }

            Sent.Add((toEmail, content));
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingPushGateway : IPushGateway
    {
        public List<(IReadOnlyList<string> Tokens, PushMessage Message)> Sent { get; } = [];

        public Task SendAsync(
            IReadOnlyList<string> fcmTokens,
            PushMessage message,
            CancellationToken ct = default)
        {
            Sent.Add((fcmTokens, message));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeDeviceRegistry : IDeviceRegistry
    {
        public Dictionary<Guid, IReadOnlyList<string>> Tokens { get; } = [];

        public Task<bool> RegisterAsync(Guid userId, string fcmToken, string platform, CancellationToken ct = default) =>
            Task.FromResult(true);

        public Task UnregisterAsync(Guid userId, string fcmToken, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<string>> GetTokensAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult(Tokens.TryGetValue(userId, out var tokens) ? tokens : []);

        public Task DeleteByTokenAsync(string fcmToken, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class RecordingLogger : ILogger<NotificationOutboxWorker>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
