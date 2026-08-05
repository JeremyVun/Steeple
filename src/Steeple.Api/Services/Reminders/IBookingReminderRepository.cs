namespace Steeple.Api.Services.Reminders;
/// <summary>
/// Port: the reminder sweep's own persistence. Bookings and occurrences are read-only here — the
/// Bookings module owns every mutation of them (SYSTEM_DESIGN §4); the only rows this port writes
/// are its own <c>booking_reminders</c> claims.
/// </summary>
public interface IBookingReminderRepository
{
    /// <summary>
    /// Confirmed bookings with at least one scheduled occurrence starting inside the window,
    /// loaded with the display graph the notifications need (room + venue, organizer, occurrences).
    /// </summary>
    Task<IReadOnlyList<Booking>> GetDueAsync(
        DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default);

    /// <summary>
    /// Claims one (occurrence, kind) reminder atomically. <c>false</c> means someone already
    /// claimed it — a second worker, or this one before a restart — and nothing should be sent.
    /// </summary>
    Task<bool> TryClaimAsync(
        Guid occurrenceId, BookingReminderKind kind, DateTimeOffset sentAtUtc, CancellationToken ct = default);

    /// <summary>
    /// Gives a claim back when the dispatch it was taken for failed, so a later sweep retries it.
    /// </summary>
    Task ReleaseClaimAsync(Guid occurrenceId, BookingReminderKind kind, CancellationToken ct = default);
}
