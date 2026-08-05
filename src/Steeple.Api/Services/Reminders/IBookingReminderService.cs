namespace Steeple.Api.Services.Reminders;
/// <summary>
/// The upcoming-booking reminder sweep, separated from its timer so it can be driven directly by
/// tests and by the dev loop.
/// </summary>
public interface IBookingReminderService
{
    /// <summary>
    /// Runs one sweep: claims and dispatches every reminder now due. Returns how many were sent
    /// (claims that lost the race, and bookings already reminded, count as zero).
    /// </summary>
    Task<int> RunOnceAsync(CancellationToken ct = default);
}
