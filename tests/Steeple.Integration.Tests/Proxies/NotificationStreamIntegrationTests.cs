using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Steeple.Api.Proxies.Notifications;
using Steeple.Integration.Tests.Fixtures;
using System.Net;
using System.Net.Sockets;

namespace Steeple.Integration.Tests.Proxies;

[Collection(PostgresCollection.Name)]
public sealed class NotificationStreamIntegrationTests
{
    private readonly PostgresDatabaseFixture _fixture;

    public NotificationStreamIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task InstalledTriggerSignalsCommittedRowsOnlyForTheirRecipient()
    {
        await using var rig = await StartListenerAsync();
        var users = await CreateUserIdsAsync(2);
        using var first = rig.Stream.TrySubscribe(users[0]).Subscription!;
        using var second = rig.Stream.TrySubscribe(users[1]).Subscription!;
        DrainInitial(first, second);

        await using (var connection = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();
            await InsertAsync(connection, transaction, users[0]);
            Assert.False(first.Signals.TryRead(out _));
            await transaction.RollbackAsync();
        }

        await AssertNoSignalAsync(first);

        Guid committedId;
        await using (var connection = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();
            committedId = await InsertAsync(connection, transaction, users[0]);
            await InsertAsync(connection, transaction, users[0]);
            await transaction.CommitAsync();
        }

        await ReadSignalAsync(first);
        await Task.Delay(100);
        Assert.False(first.Signals.TryRead(out _));
        Assert.False(second.Signals.TryRead(out _));

        await using (var connection = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await connection.OpenAsync();
            await using var malformed = new NpgsqlCommand("NOTIFY steeple_notifications, 'not-a-user-id'", connection);
            await malformed.ExecuteNonQueryAsync();
            await using var markRead = new NpgsqlCommand(
                "UPDATE notifications SET \"ReadAtUtc\" = @readAt WHERE \"Id\" = @id",
                connection);
            markRead.Parameters.AddWithValue("readAt", DateTimeOffset.UtcNow);
            markRead.Parameters.AddWithValue("id", committedId);
            await markRead.ExecuteNonQueryAsync();
        }
        await AssertNoSignalAsync(first);
    }

    [Fact]
    public async Task TriggerIsInstalledAndListenerReconnectsAfterBackendTermination()
    {
        await using var rig = await StartListenerAsync();
        var userId = Assert.Single(await CreateUserIdsAsync(1));
        using var lostSubscription = rig.Stream.TrySubscribe(userId).Subscription!;
        Assert.True(lostSubscription.Signals.TryRead(out _));

        await using (var connection = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await connection.OpenAsync();
            await using var trigger = new NpgsqlCommand(
                "SELECT count(*) FROM pg_trigger WHERE tgname = 'notifications_notify_insert' AND NOT tgisinternal",
                connection);
            Assert.Equal(1L, (long)(await trigger.ExecuteScalarAsync())!);

            await using var terminate = new NpgsqlCommand(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'Steeple notification listener'",
                connection);
            Assert.True((bool)(await terminate.ExecuteScalarAsync())!);
        }

        await WaitForCancellationAsync(lostSubscription.Cancellation);
        var missedId = await InsertCommittedAsync(userId);
        await WaitUntilAsync(() => rig.Stream.IsReady, TimeSpan.FromSeconds(10));

        using var replacement = rig.Stream.TrySubscribe(userId).Subscription!;
        await ReadSignalAsync(replacement);
        await using var db = new SteepleDbContext(
            new DbContextOptionsBuilder<SteepleDbContext>().UseNpgsql(_fixture.ConnectionString).Options);
        var snapshot = await new NotificationService(new EfNotificationRepository(db))
            .GetPageAsync(userId, null, 24);

        Assert.Contains(snapshot.Items, item => item.Id == missedId);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("disabled")]
    [InlineData("wrong")]
    public async Task MissingDisabledOrWrongTriggerKeepsAdmissionClosed(string triggerState)
    {
        var schema = $"stream_without_migration_{Guid.NewGuid():N}";
        var builder = new NpgsqlConnectionStringBuilder(_fixture.ConnectionString)
        {
            SearchPath = schema,
        };
        await using (var connection = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await connection.OpenAsync();
            var triggerSql = triggerState switch
            {
                "missing" => "",
                "disabled" => $"""
                    CREATE FUNCTION "{schema}".notify_notification_inserted() RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN RETURN NEW; END;
                    $$;
                    CREATE TRIGGER notifications_notify_insert
                    AFTER INSERT ON "{schema}".notifications
                    FOR EACH ROW EXECUTE FUNCTION "{schema}".notify_notification_inserted();
                    ALTER TABLE "{schema}".notifications DISABLE TRIGGER notifications_notify_insert;
                    """,
                _ => $"""
                    CREATE FUNCTION "{schema}".notify_notification_inserted() RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN RETURN NEW; END;
                    $$;
                    CREATE TRIGGER notifications_notify_insert
                    BEFORE UPDATE ON "{schema}".notifications
                    FOR EACH ROW EXECUTE FUNCTION "{schema}".notify_notification_inserted();
                    """,
            };
            await using var create = new NpgsqlCommand($"""
                CREATE SCHEMA "{schema}";
                CREATE TABLE "{schema}".notifications ("UserId" uuid NOT NULL);
                {triggerSql}
                """, connection);
            await create.ExecuteNonQueryAsync();
        }

        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        var listener = CreateListener(builder.ConnectionString, stream);
        try
        {
            await listener.StartAsync(CancellationToken.None);
            await Task.Delay(300);

            Assert.False(stream.IsReady);
            Assert.Equal(NotificationStreamAdmissionStatus.Unavailable, stream.TrySubscribe(Guid.NewGuid()).Status);
        }
        finally
        {
            await listener.StopAsync(CancellationToken.None);
            listener.Dispose();
            await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
            await connection.OpenAsync();
            await using var drop = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", connection);
            await drop.ExecuteNonQueryAsync();
        }
    }

    [Fact]
    public async Task SilentDatabaseStallCancelsProbeAndClosesSubscriptions()
    {
        var destination = new NpgsqlConnectionStringBuilder(_fixture.ConnectionString);
        await using var relay = new PausableTcpRelay(
            destination.Host ?? throw new InvalidOperationException("Test database host is missing."),
            destination.Port);
        var relayed = new NpgsqlConnectionStringBuilder(_fixture.ConnectionString)
        {
            Host = IPAddress.Loopback.ToString(),
            Port = relay.Port,
        };
        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        var listener = CreateListener(
            relayed.ConnectionString,
            stream,
            new NotificationStreamOptions
            {
                ProbeInterval = TimeSpan.FromSeconds(1),
                ProbeDeadline = TimeSpan.FromMilliseconds(200),
                ConnectionDeadline = TimeSpan.FromSeconds(1),
                RetryBaseDelay = TimeSpan.FromMilliseconds(100),
                RetryMaxDelay = TimeSpan.FromMilliseconds(200),
            });

        try
        {
            await listener.StartAsync(CancellationToken.None);
            await WaitUntilAsync(() => stream.IsReady, TimeSpan.FromSeconds(5));
            using var subscription = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
            Assert.True(subscription.Signals.TryRead(out _));

            relay.Pause();
            var stalledAt = DateTimeOffset.UtcNow;
            await WaitForCancellationAsync(subscription.Cancellation, TimeSpan.FromSeconds(15));

            Assert.True(relay.IsPaused);
            Assert.True(relay.AcceptedConnections >= 1);
            Assert.False(stream.IsReady);
            Assert.InRange(DateTimeOffset.UtcNow - stalledAt, TimeSpan.Zero, TimeSpan.FromSeconds(3));

            relay.Resume();
            await WaitUntilAsync(() => stream.IsReady, TimeSpan.FromSeconds(5));
            using var recovered = stream.TrySubscribe(Guid.NewGuid()).Subscription!;
            Assert.True(recovered.Signals.TryRead(out _));
        }
        finally
        {
            relay.Resume();
            await listener.StopAsync(CancellationToken.None);
            listener.Dispose();
        }
    }

    [Fact]
    public async Task CommitCrossingAdmissionIsCoveredByInitialInvalidationAndSnapshot()
    {
        await using var rig = await StartListenerAsync();
        var userId = Assert.Single(await CreateUserIdsAsync(1));
        Guid notificationId;
        await using (var connection = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();
            notificationId = await InsertAsync(connection, transaction, userId);
            await transaction.CommitAsync();
        }

        using var subscription = rig.Stream.TrySubscribe(userId).Subscription!;
        await ReadSignalAsync(subscription);
        await using var db = new SteepleDbContext(
            new DbContextOptionsBuilder<SteepleDbContext>().UseNpgsql(_fixture.ConnectionString).Options);
        var snapshot = await new NotificationService(new EfNotificationRepository(db))
            .GetPageAsync(userId, null, 24);

        Assert.Contains(snapshot.Items, item => item.Id == notificationId);
    }

    [Fact]
    public async Task HealthyListenerKeepsItsBackendAndSubscriptionAcrossIdleAndBusyProbes()
    {
        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        var listener = CreateListener(
            _fixture.ConnectionString,
            stream,
            new NotificationStreamOptions { ProbeInterval = TimeSpan.FromSeconds(1) });
        try
        {
            await listener.StartAsync(CancellationToken.None);
            await WaitUntilAsync(() => stream.IsReady, TimeSpan.FromSeconds(5));
            var userId = Guid.NewGuid();
            using var subscription = stream.TrySubscribe(userId).Subscription!;
            Assert.True(subscription.Signals.TryRead(out _));
            var originalPid = await ListenerBackendPidAsync();

            var busyUntil = DateTimeOffset.UtcNow.AddSeconds(2.5);
            while (DateTimeOffset.UtcNow < busyUntil)
            {
                await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
                await connection.OpenAsync();
                await using var notify = new NpgsqlCommand(
                    $"NOTIFY steeple_notifications, '{userId}'",
                    connection);
                await notify.ExecuteNonQueryAsync();
                await Task.Delay(100);
            }

            Assert.Equal(originalPid, await ListenerBackendPidAsync());
            Assert.True(stream.IsReady);
            Assert.False(subscription.Cancellation.IsCancellationRequested);
            await Task.Delay(TimeSpan.FromSeconds(1.2));
            Assert.Equal(originalPid, await ListenerBackendPidAsync());
            Assert.True(stream.IsReady);
        }
        finally
        {
            await listener.StopAsync(CancellationToken.None);
            listener.Dispose();
        }
    }

    private async Task<ListenerRig> StartListenerAsync()
    {
        var stream = new InMemoryNotificationStream(Options.Create(new NotificationStreamOptions()));
        var listener = CreateListener(_fixture.ConnectionString, stream);
        await listener.StartAsync(CancellationToken.None);
        await WaitUntilAsync(() => stream.IsReady, TimeSpan.FromSeconds(10));
        return new(listener, stream);
    }

    private static PostgresNotificationListener CreateListener(
        string connectionString,
        INotificationStream stream,
        NotificationStreamOptions? options = null) =>
        new(
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:SteepleDb"] = connectionString,
            }).Build(),
            stream,
            Options.Create(options ?? new NotificationStreamOptions()),
            TimeProvider.System,
            NullLogger<PostgresNotificationListener>.Instance);

    private async Task<Guid[]> CreateUserIdsAsync(int count)
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        var ids = Enumerable.Range(0, count).Select(_ => Guid.NewGuid()).ToArray();
        foreach (var id in ids)
        {
            await using var command = new NpgsqlCommand(
                "INSERT INTO users (\"Id\", \"DisplayName\", \"CreatedAtUtc\") VALUES (@id, 'Stream test user', @createdAt)",
                connection);
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("createdAt", DateTimeOffset.UtcNow);
            await command.ExecuteNonQueryAsync();
        }
        return ids;
    }

    private async Task<int> ListenerBackendPidAsync()
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT pid FROM pg_stat_activity WHERE application_name = 'Steeple notification listener'",
            connection);
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private async Task<Guid> InsertCommittedAsync(Guid userId)
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        return await InsertAsync(connection, null, userId);
    }

    private static async Task<Guid> InsertAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction? transaction,
        Guid userId)
    {
        var id = Guid.NewGuid();
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO notifications ("Id", "UserId", "Type", "PayloadJson", "CreatedAtUtc")
            VALUES (@id, @userId, @type, '{}', @createdAt)
            """,
            connection,
            transaction);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("type", (int)NotificationType.ApplicationReceived);
        command.Parameters.AddWithValue("createdAt", DateTimeOffset.UtcNow);
        await command.ExecuteNonQueryAsync();
        return id;
    }

    private static void DrainInitial(params INotificationStreamSubscription[] subscriptions)
    {
        foreach (var subscription in subscriptions)
        {
            Assert.True(subscription.Signals.TryRead(out _));
        }
    }

    private static async Task ReadSignalAsync(INotificationStreamSubscription subscription)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await subscription.Signals.ReadAsync(timeout.Token);
    }

    private static async Task AssertNoSignalAsync(INotificationStreamSubscription subscription)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
            await subscription.Signals.ReadAsync(timeout.Token));
    }

    private static async Task WaitForCancellationAsync(
        CancellationToken cancellationToken,
        TimeSpan? timeoutAfter = null)
    {
        using var timeout = new CancellationTokenSource(timeoutAfter ?? TimeSpan.FromSeconds(5));
        await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken).WaitAsync(timeout.Token)
            .ContinueWith(_ => { }, CancellationToken.None);
        Assert.True(cancellationToken.IsCancellationRequested);
    }

    private static async Task WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        while (!condition())
        {
            if (DateTimeOffset.UtcNow >= deadline)
            {
                throw new TimeoutException("Condition was not reached before the deadline.");
            }
            await Task.Delay(20);
        }
    }

    private sealed class ListenerRig(
        PostgresNotificationListener listener,
        InMemoryNotificationStream stream) : IAsyncDisposable
    {
        public InMemoryNotificationStream Stream { get; } = stream;

        public async ValueTask DisposeAsync()
        {
            await listener.StopAsync(CancellationToken.None);
            listener.Dispose();
        }
    }

    private sealed class PausableTcpRelay : IAsyncDisposable
    {
        private readonly string _destinationHost;
        private readonly int _destinationPort;
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource _stopping = new();
        private readonly List<TcpClient> _clients = [];
        private readonly object _clientsGate = new();
        private readonly Task _accepting;
        private TaskCompletionSource? _resume;
        private int _acceptedConnections;

        public PausableTcpRelay(string destinationHost, int destinationPort)
        {
            _destinationHost = destinationHost;
            _destinationPort = destinationPort;
            _listener.Start();
            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            _accepting = AcceptAsync();
        }

        public int Port { get; }
        public int AcceptedConnections => Volatile.Read(ref _acceptedConnections);
        public bool IsPaused => Volatile.Read(ref _resume) is not null;

        public void Pause() => Interlocked.CompareExchange(
            ref _resume,
            new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously),
            null);

        public void Resume() => Interlocked.Exchange(ref _resume, null)?.SetResult();

        public async ValueTask DisposeAsync()
        {
            _stopping.Cancel();
            _listener.Stop();
            lock (_clientsGate)
            {
                foreach (var client in _clients)
                {
                    client.Dispose();
                }
            }
            try
            {
                await _accepting;
            }
            catch (OperationCanceledException)
            {
            }
            catch (SocketException) when (_stopping.IsCancellationRequested)
            {
            }
            _stopping.Dispose();
        }

        private async Task AcceptAsync()
        {
            while (!_stopping.IsCancellationRequested)
            {
                var inbound = await _listener.AcceptTcpClientAsync(_stopping.Token);
                var outbound = new TcpClient();
                await outbound.ConnectAsync(_destinationHost, _destinationPort, _stopping.Token);
                lock (_clientsGate)
                {
                    _clients.Add(inbound);
                    _clients.Add(outbound);
                }
                Interlocked.Increment(ref _acceptedConnections);
                _ = RelayConnectionAsync(inbound, outbound);
            }
        }

        private async Task RelayConnectionAsync(TcpClient inbound, TcpClient outbound)
        {
            try
            {
                await Task.WhenAny(
                    CopyAsync(inbound.GetStream(), outbound.GetStream()),
                    CopyAsync(outbound.GetStream(), inbound.GetStream()));
            }
            catch (OperationCanceledException) when (_stopping.IsCancellationRequested)
            {
            }
            catch (IOException)
            {
            }
            finally
            {
                inbound.Dispose();
                outbound.Dispose();
            }
        }

        private async Task CopyAsync(Stream source, Stream destination)
        {
            var buffer = new byte[16 * 1024];
            while (!_stopping.IsCancellationRequested)
            {
                var count = await source.ReadAsync(buffer, _stopping.Token);
                if (count == 0)
                {
                    return;
                }

                var resume = Volatile.Read(ref _resume);
                if (resume is not null)
                {
                    await resume.Task.WaitAsync(_stopping.Token);
                }
                await destination.WriteAsync(buffer.AsMemory(0, count), _stopping.Token);
                await destination.FlushAsync(_stopping.Token);
            }
        }
    }
}
