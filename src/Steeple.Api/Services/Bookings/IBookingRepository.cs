namespace Steeple.Api.Services.Bookings;
/// <summary>
/// Port: persistence for the Bookings module. Loads return the full display graph
/// (room + venue, organizer, occurrences). Mutating methods are complete units of work; mutations
/// to already-loaded (tracked) entities — including a tracked application riding along with a new
/// booking — are persisted by the same save.
/// </summary>
public interface IBookingRepository
{
    /// <summary>
    /// Persists a new booking with its occurrences in one atomic save (any other pending tracked
    /// changes, e.g. the application's Approved flip, commit with it). Returns <c>false</c> when
    /// the no-overlap exclusion constraint rejects it — the booking and its occurrences are then
    /// detached and nothing was written, but other pending changes remain tracked and unsaved.
    /// </summary>
    Task<bool> TrySaveNewAsync(Booking booking, CancellationToken ct = default);

    /// <summary>The booking with its full graph. Null when unknown.</summary>
    Task<Booking?> GetAsync(Guid bookingId, CancellationToken ct = default);

    /// <summary>The occurrence with its booking's full graph. Null when unknown.</summary>
    Task<BookingOccurrence?> GetOccurrenceAsync(Guid occurrenceId, CancellationToken ct = default);

    /// <summary>The organizer's bookings (full graph), newest first, paginated.</summary>
    Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForOrganizerAsync(
        Guid organizerId, BookingStatus? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Bookings for rooms of the given venues (full graph), newest first, paginated.</summary>
    Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForVenuesAsync(
        IReadOnlyList<Guid> venueIds, BookingStatus? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Flushes mutations made to already-loaded bookings/occurrences (sweeps, cancels, no-shows).</summary>
    Task SaveAsync(CancellationToken ct = default);
}
