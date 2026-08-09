using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Retention;

/// <summary>Runs bounded data-retention passes in fresh dependency-injection scopes.</summary>
public sealed class DataRetentionWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly TimeProvider _clock;
    private readonly DataRetentionOptions _options;
    private readonly ILogger<DataRetentionWorker> _logger;

    /// <summary>Creates the worker.</summary>
    public DataRetentionWorker(
        IServiceScopeFactory scopes,
        TimeProvider clock,
        IOptions<DataRetentionOptions> options,
        ILogger<DataRetentionWorker> logger)
    {
        _scopes = scopes;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = _options.Interval > TimeSpan.Zero ? _options.Interval : TimeSpan.FromDays(1);
        _logger.LogInformation(
            "Data retention worker started (batch {BatchSize}, every {Interval}).",
            Math.Clamp(_options.BatchSize, 1, 500),
            interval);

        using var timer = new PeriodicTimer(interval, _clock);
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
                _logger.LogError(ex, "Data retention pass failed; retrying next interval.");
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

    /// <summary>Runs one pass in one fresh scope; exposed for integration tests and manual checks.</summary>
    public async Task<DataRetentionSweepResult> RunOnceAsync(CancellationToken ct = default)
    {
        await using var scope = _scopes.CreateAsyncScope();
        var retention = scope.ServiceProvider.GetRequiredService<IDataRetentionService>();
        var result = await retention.RunOnceAsync(_clock.GetUtcNow(), ct).ConfigureAwait(false);

        if (result.Total > 0)
        {
            _logger.LogInformation(
                "Data retention pass removed {Total} row(s): {RefreshTokens} refresh tokens, " +
                "{Notifications} notifications, {IdempotencyRecords} idempotency records, " +
                "{Correspondence} correspondence rows, {NotificationOutbox} outbox rows.",
                result.Total,
                result.RefreshTokens,
                result.Notifications,
                result.IdempotencyRecords,
                result.Correspondence,
                result.NotificationOutbox);
        }

        return result;
    }
}
