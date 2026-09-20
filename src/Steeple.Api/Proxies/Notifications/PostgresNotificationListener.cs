using Microsoft.Extensions.Options;
using Npgsql;

namespace Steeple.Api.Proxies.Notifications;

public sealed class PostgresNotificationListener : BackgroundService
{
    internal const string ChannelName = "steeple_notifications";
    internal const string TriggerName = "notifications_notify_insert";

    private readonly string _connectionString;
    private readonly INotificationStream _stream;
    private readonly NotificationStreamOptions _options;
    private readonly TimeProvider _clock;
    private readonly ILogger<PostgresNotificationListener> _logger;

    public PostgresNotificationListener(
        IConfiguration configuration,
        INotificationStream stream,
        IOptions<NotificationStreamOptions> options,
        TimeProvider clock,
        ILogger<PostgresNotificationListener> logger)
    {
        _options = options.Value;
        var configured = configuration.GetConnectionString("SteepleDb")
            ?? throw new InvalidOperationException("ConnectionStrings:SteepleDb is required for notification streaming.");
        var builder = new NpgsqlConnectionStringBuilder(configured)
        {
            Pooling = false,
            Enlist = false,
            ApplicationName = "Steeple notification listener",
            CancellationTimeout = -1,
        };
        _connectionString = builder.ConnectionString;
        _stream = stream;
        _clock = clock;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var failures = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            DateTimeOffset? listeningSince = null;
            try
            {
                await ListenAsync(
                    () => listeningSince = _clock.GetUtcNow(),
                    stoppingToken).ConfigureAwait(false);
                failures = 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogError(
                    "Notification listener lost its PostgreSQL connection ({FailureType}).",
                    exception.GetType().Name);
            }
            finally
            {
                _stream.MarkUnavailable();
            }

            if (listeningSince is not null
                && _clock.GetUtcNow() - listeningSince.Value >= _options.HealthyResetInterval)
            {
                failures = 0;
            }

            var delay = RetryDelay(failures++);
            try
            {
                await Task.Delay(delay, _clock, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task ListenAsync(Action listening, CancellationToken stoppingToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        connection.Notification += (_, notification) =>
        {
            if (string.Equals(notification.Channel, ChannelName, StringComparison.Ordinal)
                && Guid.TryParse(notification.Payload, out var userId))
            {
                _stream.Publish(userId);
            }
        };

        await WithDeadlineAsync(async token =>
        {
            await connection.OpenAsync(token).ConfigureAwait(false);
            await EnsureTriggerInstalledAsync(connection, token).ConfigureAwait(false);
            await using var transaction = await connection.BeginTransactionAsync(token).ConfigureAwait(false);
            await using var listenCommand = new NpgsqlCommand($"LISTEN {ChannelName}", connection, transaction);
            await listenCommand.ExecuteNonQueryAsync(token).ConfigureAwait(false);
            await transaction.CommitAsync(token).ConfigureAwait(false);
        }, _options.ConnectionDeadline, stoppingToken).ConfigureAwait(false);

        _stream.MarkReady();
        listening();
        _logger.LogInformation("Notification listener is accepting stream subscriptions.");

        var nextProbe = _clock.GetUtcNow() + _options.ProbeInterval;
        while (!stoppingToken.IsCancellationRequested)
        {
            var remaining = nextProbe - _clock.GetUtcNow();
            if (remaining <= TimeSpan.Zero)
            {
                await ProbeAsync(connection, stoppingToken).ConfigureAwait(false);
                nextProbe = _clock.GetUtcNow() + _options.ProbeInterval;
                continue;
            }

            using var waitCancellation = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            var pendingWait = connection.WaitAsync(waitCancellation.Token);
            try
            {
                await pendingWait.WaitAsync(
                    remaining,
                    _clock,
                    stoppingToken).ConfigureAwait(false);
            }
            catch (TimeoutException)
            {
                var cancelling = waitCancellation.CancelAsync();
                try
                {
                    await pendingWait.WaitAsync(
                        _options.ProbeDeadline,
                        _clock,
                        stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
                {
                    await cancelling.ConfigureAwait(false);
                    await ProbeAsync(connection, stoppingToken).ConfigureAwait(false);
                    nextProbe = _clock.GetUtcNow() + _options.ProbeInterval;
                }
                catch (TimeoutException)
                {
                    _stream.MarkUnavailable();
                    ObserveFault(pendingWait);
                    ObserveFault(cancelling);
                    throw new TimeoutException("PostgreSQL notification wait exceeded its cancellation deadline.");
                }
            }
        }
    }

    private async Task EnsureTriggerInstalledAsync(NpgsqlConnection connection, CancellationToken stoppingToken)
    {
        const string sql = """
            SELECT EXISTS (
                SELECT 1
                FROM pg_trigger
                JOIN pg_proc AS trigger_function ON trigger_function.oid = pg_trigger.tgfoid
                WHERE tgname = 'notifications_notify_insert'
                  AND tgrelid = 'notifications'::regclass
                  AND tgenabled = 'O'
                  AND tgtype = 5
                  AND NOT tgisinternal
                  AND trigger_function.proname = 'notify_notification_inserted'
                  AND pg_get_function_identity_arguments(trigger_function.oid) = ''
            )
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        var installed = (bool)(await command.ExecuteScalarAsync(stoppingToken).ConfigureAwait(false) ?? false);

        if (!installed)
        {
            throw new InvalidOperationException("Notification stream migration is not installed.");
        }
    }

    private Task ProbeAsync(NpgsqlConnection connection, CancellationToken stoppingToken) =>
        WithDeadlineAsync(async token =>
        {
            await using var probe = new NpgsqlCommand("SELECT 1", connection);
            await probe.ExecuteNonQueryAsync(token).ConfigureAwait(false);
        }, _options.ProbeDeadline, stoppingToken);

    private async Task WithDeadlineAsync(
        Func<CancellationToken, Task> operation,
        TimeSpan deadline,
        CancellationToken stoppingToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var pending = operation(linked.Token);
        try
        {
            await pending.WaitAsync(deadline, _clock, stoppingToken).ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            _stream.MarkUnavailable();
            ObserveFault(linked.CancelAsync());
            ObserveFault(pending);
            throw;
        }
    }

    private TimeSpan RetryDelay(int failure)
    {
        var exponent = Math.Min(failure, 30);
        var upperMilliseconds = Math.Min(
            _options.RetryMaxDelay.TotalMilliseconds,
            _options.RetryBaseDelay.TotalMilliseconds * Math.Pow(2, exponent));
        var milliseconds = upperMilliseconds * (0.5 + Random.Shared.NextDouble() * 0.5);
        return TimeSpan.FromMilliseconds(milliseconds);
    }

    private static void ObserveFault(Task task) =>
        _ = task.ContinueWith(
            completed => _ = completed.Exception,
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);

}
