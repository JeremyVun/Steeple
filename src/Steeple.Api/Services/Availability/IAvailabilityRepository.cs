namespace Steeple.Api.Services.Availability;
/// <summary>
/// Persistence port for a room's availability rules (open hours + blackout dates). The
/// Availability module owns <c>room_open_hours</c> and <c>room_blackout_dates</c>; venue-manager
/// authz stays in the service (via <see cref="IVenueManagerRepository"/>). Writes are replace-all
/// in one transaction.
/// </summary>
public interface IAvailabilityRepository
{
    /// <summary>A room with its venue loaded (for timezone + manager scoping); null when unknown.</summary>
    Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>The room's weekly open windows, ordered by weekday then start time.</summary>
    Task<IReadOnlyList<RoomOpenHours>> GetOpenHoursAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>The room's blackout dates, ascending.</summary>
    Task<IReadOnlyList<RoomBlackoutDate>> GetBlackoutsAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>Whether the room has at least one open-hours row (the publish gate's check).</summary>
    Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>
    /// The room's <b>confirmed</b> busy occurrences overlapping <c>[fromUtc, toUtc)</c>:
    /// <c>Scheduled</c> occurrences of <c>Confirmed</c> bookings (pending demand is never counted).
    /// Read-only — the Availability module reads <c>booking_occurrences</c> to subtract booked time
    /// but never mutates it; the exclusion constraint stays the sole double-booking authority.
    /// </summary>
    Task<IReadOnlyList<BookingOccurrence>> GetConfirmedOccurrencesAsync(
        Guid roomId, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default);

    /// <summary>
    /// Replaces the room's entire rule set (delete existing rows, insert the supplied ones) in one
    /// SaveChanges — a single implicit transaction, so a partial write is never visible.
    /// </summary>
    Task ReplaceRulesAsync(
        Guid roomId,
        IReadOnlyList<RoomOpenHours> openHours,
        IReadOnlyList<RoomBlackoutDate> blackouts,
        CancellationToken ct = default);
}
