using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Reminders;
/// <summary>
/// Timer for <see cref="IBookingReminderService"/>. Domain-state expiry still sweeps lazily on read
/// (SYSTEM_DESIGN §5/§7), but a reminder nobody is reading has to come from somewhere. Each tick
/// runs in its own DI scope (the sweep is scoped over the DbContext) and swallows its failures — a
/// bad sweep must never take the API's host down with it.
/// </summary>
public sealed class BookingReminderWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly TimeProvider _clock;
    private readonly ReminderOptions _options;
    private readonly ILogger<BookingReminderWorker> _logger;

    /// <summary>Creates the worker.</summary>
    public BookingReminderWorker(
        IServiceScopeFactory scopes,
        TimeProvider clock,
        IOptions<ReminderOptions> options,
        ILogger<BookingReminderWorker> logger)
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
            "Booking reminder worker started (every {Interval}).", _options.Interval);

        using var timer = new PeriodicTimer(_options.Interval, _clock);
        do
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var sweep = scope.ServiceProvider.GetRequiredService<IBookingReminderService>();
                var sent = await sweep.RunOnceAsync(stoppingToken).ConfigureAwait(false);
                if (sent > 0)
                {
                    _logger.LogInformation("Booking reminder sweep sent {Count} reminder(s).", sent);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Booking reminder sweep failed; retrying next interval.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
