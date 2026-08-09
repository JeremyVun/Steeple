using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Notifications;

/// <summary>
/// Delivers durable notification outbox rows in bounded batches. Each pass owns a fresh DI scope,
/// so scoped gateways and the EF context live until every claimed row is stamped. Claims use a
/// lease: process loss makes unfinished rows due again; provider acceptance followed by process
/// loss can therefore duplicate delivery, the standard at-least-once outbox guarantee.
/// </summary>
public sealed class NotificationOutboxWorker : BackgroundService
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new(JsonSerializerDefaults.Web);
    private const int MaxStoredErrorLength = 2000;

    private readonly IServiceScopeFactory _scopes;
    private readonly TimeProvider _clock;
    private readonly NotificationOutboxOptions _options;
    private readonly ILogger<NotificationOutboxWorker> _logger;

    /// <summary>Creates the worker.</summary>
    public NotificationOutboxWorker(
        IServiceScopeFactory scopes,
        TimeProvider clock,
        IOptions<NotificationOutboxOptions> options,
        ILogger<NotificationOutboxWorker> logger)
    {
        _scopes = scopes;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Notification outbox worker started (batch {BatchSize}, every {Interval}).",
            _options.BatchSize,
            _options.Interval);

        using var timer = new PeriodicTimer(_options.Interval, _clock);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Notification outbox batch failed; retrying next interval.");
            }

            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
                {
                    return;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    /// <summary>Processes one bounded batch in one fresh scope; exposed for integration tests.</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct = default)
    {
        await using var scope = _scopes.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<INotificationRepository>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailGateway>();
        var devices = scope.ServiceProvider.GetRequiredService<IDeviceRegistry>();
        var push = scope.ServiceProvider.GetRequiredService<IPushGateway>();

        var now = _clock.GetUtcNow();
        var rows = await repository.ClaimDueAsync(
            now,
            Math.Clamp(_options.BatchSize, 1, 500),
            PositiveOrDefault(_options.ClaimLease, TimeSpan.FromMinutes(2)),
            ct).ConfigureAwait(false);

        foreach (var row in rows)
        {
            try
            {
                await DeliverAsync(row, email, devices, push, ct).ConfigureAwait(false);
                await repository.MarkDeliveredAsync(row.Id, _clock.GetUtcNow(), ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var failedAt = _clock.GetUtcNow();
                var terminal = row.Attempts >= Math.Max(1, _options.MaxAttempts);
                var nextAttempt = terminal ? failedAt : failedAt + RetryDelay(row.Attempts);
                var error = BoundedError(ex);

                await repository.RecordFailureAsync(
                    row.Id,
                    error,
                    nextAttempt,
                    terminal ? failedAt : null,
                    ct).ConfigureAwait(false);

                if (terminal)
                {
                    _logger.LogError(
                        ex,
                        "Notification outbox delivery permanently failed after {Attempts} attempts: {OutboxId} {Channel} {Kind}.",
                        row.Attempts,
                        row.Id,
                        row.Channel,
                        row.Kind);
                }
                else
                {
                    _logger.LogWarning(
                        ex,
                        "Notification outbox delivery failed on attempt {Attempt}; retry at {NextAttemptAtUtc}: {OutboxId} {Channel} {Kind}.",
                        row.Attempts,
                        nextAttempt,
                        row.Id,
                        row.Channel,
                        row.Kind);
                }
            }
        }

        return rows.Count;
    }

    private static async Task DeliverAsync(
        NotificationOutbox row,
        IEmailGateway email,
        IDeviceRegistry devices,
        IPushGateway push,
        CancellationToken ct)
    {
        switch (row.Channel)
        {
            case NotificationOutboxChannel.Email:
            {
                var payload = JsonSerializer.Deserialize<EmailOutboxPayload>(row.PayloadJson, PayloadJsonOptions)
                    ?? throw new JsonException("Email outbox payload was null.");
                await email.SendAsync(
                    payload.ToEmail,
                    new EmailContent(payload.Subject, payload.TextBody, payload.HtmlBody),
                    ct).ConfigureAwait(false);
                break;
            }
            case NotificationOutboxChannel.Push:
            {
                var payload = JsonSerializer.Deserialize<PushOutboxPayload>(row.PayloadJson, PayloadJsonOptions)
                    ?? throw new JsonException("Push outbox payload was null.");
                var tokens = await devices.GetTokensAsync(payload.UserId, ct).ConfigureAwait(false);
                if (tokens.Count > 0)
                {
                    await push.SendAsync(
                        tokens,
                        new PushMessage(payload.NotificationId, payload.Type, payload.DeepLink),
                        ct).ConfigureAwait(false);
                }
                break;
            }
            default:
                throw new InvalidOperationException($"Unsupported notification outbox channel {(int)row.Channel}.");
        }
    }

    private TimeSpan RetryDelay(int attempt)
    {
        var baseDelay = PositiveOrDefault(_options.BaseRetryDelay, TimeSpan.FromSeconds(30));
        var maximum = PositiveOrDefault(_options.MaxRetryDelay, TimeSpan.FromHours(1));
        var multiplier = Math.Pow(2, Math.Clamp(attempt - 1, 0, 30));
        var ticks = (long)Math.Min(baseDelay.Ticks * multiplier, maximum.Ticks);
        return TimeSpan.FromTicks(ticks);
    }

    private static TimeSpan PositiveOrDefault(TimeSpan value, TimeSpan fallback) =>
        value > TimeSpan.Zero ? value : fallback;

    private static string BoundedError(Exception exception)
    {
        var value = $"{exception.GetType().Name}: {exception.Message}";
        return value.Length <= MaxStoredErrorLength ? value : value[..MaxStoredErrorLength];
    }
}
