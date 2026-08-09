using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Payments;
/// <summary>
/// The first real background worker (SYSTEM_DESIGN §17 — the lazy-sweep decision log reserved
/// exactly this trigger: money movement must not depend on someone opening a page). Every
/// <see cref="PaymentsOptions.SweepIntervalSeconds"/> it takes a Postgres advisory lock (so
/// multiple API instances never sweep concurrently), charges occurrences entering the T−48h
/// window, applies the failure ladder's auto-cancels through the Bookings service (Payments
/// never mutates occurrences), and refunds cancelled-but-charged occurrences.
/// </summary>
public sealed class PaymentSweeper : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly TimeProvider _clock;
    private readonly PaymentsOptions _options;
    private readonly IFeatureFlags _flags;
    private readonly ILogger<PaymentSweeper> _logger;

    /// <summary>Creates the worker.</summary>
    public PaymentSweeper(
        IServiceScopeFactory scopes,
        TimeProvider clock,
        IOptions<PaymentsOptions> options,
        IFeatureFlags flags,
        ILogger<PaymentSweeper> logger)
    {
        _scopes = scopes;
        _clock = clock;
        _options = options.Value;
        _flags = flags;
        _logger = logger;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_options.SweepIntervalSeconds), _clock);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // A failed sweep is retried on the next tick; the T−48h → T−24h grace absorbs
                // hours of outage (payments.md §13). Never let one bad pass kill the worker.
                _logger.LogError(ex, "Payment sweep failed; retrying on the next interval.");
            }

            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
                {
                    break;
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    /// <summary>One full pass — also invoked directly by tests (no timer, no lock retry loop).</summary>
    public async Task SweepOnceAsync(CancellationToken ct)
    {
        if (!_flags.IsEnabled(PaymentService.PaymentsFlag))
        {
            return;
        }

        using var scope = _scopes.CreateScope();
        var payments = scope.ServiceProvider.GetRequiredService<IPaymentService>();
        var bookings = scope.ServiceProvider.GetRequiredService<IBookingService>();
        var repository = scope.ServiceProvider.GetRequiredService<IPaymentRepository>();

        if (!await repository.TryAcquireSweepLockAsync(ct).ConfigureAwait(false))
        {
            return; // another instance is sweeping — correct today on one instance, safe on many
        }

        try
        {
            var outcome = await payments.SweepAsync(_clock.GetUtcNow(), ct).ConfigureAwait(false);

            // The failure ladder's cancels go through the Bookings service — the module-ownership
            // rule — then the freed-but-charged occurrences (a term cancel can free later, already
            // charged occurrences) refund immediately instead of waiting a full interval.
            foreach (var group in outcome.ToCancel.GroupBy(c => c.BookingId))
            {
                await bookings.CancelOccurrencesForPaymentFailureAsync(
                    group.Key,
                    group.Select(c => c.OccurrenceId).ToList(),
                    cancelRemainingTerm: group.Any(c => c.CancelRemainingTerm),
                    ct).ConfigureAwait(false);
                await payments.RefundCancelledForBookingAsync(group.Key, ct).ConfigureAwait(false);
            }

            if (outcome.Charged + outcome.Failed + outcome.Refunded + outcome.ToCancel.Count > 0)
            {
                _logger.LogInformation(
                    "Payment sweep: {Charged} charged, {Failed} failed, {Refunded} refunded, {Cancelled} auto-cancelled.",
                    outcome.Charged, outcome.Failed, outcome.Refunded, outcome.ToCancel.Count);
            }
        }
        finally
        {
            await repository.ReleaseSweepLockAsync(CancellationToken.None).ConfigureAwait(false);
        }
    }
}
