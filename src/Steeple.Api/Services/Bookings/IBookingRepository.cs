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
    /// Throws <see cref="ConcurrentUpdateException"/> when a tracked application riding along lost
    /// its optimistic-concurrency race, and <see cref="DuplicateIdempotencyKeyException"/> when an
    /// instant-book application insert lost the idempotency race — in both cases nothing was written.
    /// </summary>
    Task<bool> TrySaveNewAsync(Booking booking, CancellationToken ct = default);

    /// <summary>The booking with its full graph. Null when unknown.</summary>
    Task<Booking?> GetAsync(Guid bookingId, CancellationToken ct = default);

    /// <summary>The occurrence with its booking's full graph. Null when unknown.</summary>
    Task<BookingOccurrence?> GetOccurrenceAsync(Guid occurrenceId, CancellationToken ct = default);

    /// <summary>
    /// The organizer's bookings (full graph), newest first, paginated. A status filter matches the
    /// <b>effective</b> status at <paramref name="now"/>: a confirmed booking with no scheduled
    /// time left ahead counts as completed even before the lazy sweep persists the flip.
    /// </summary>
    Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForOrganizerAsync(
        Guid organizerId, BookingStatus? status, DateTimeOffset now, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Bookings for rooms of the given venues (full graph), newest first, paginated — same effective-status filtering.</summary>
    Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForVenuesAsync(
        IReadOnlyList<Guid> venueIds, BookingStatus? status, DateTimeOffset now, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// How many confirmed bookings with scheduled time still ahead the organizer holds — at the
    /// named venue and across all venues. Feeds the uncarded instant-book cap (booking-modes.md):
    /// "upcoming" is the same effective-status predicate the confirmed filter uses.
    /// </summary>
    Task<UpcomingBookingCounts> CountUpcomingForOrganizerAsync(
        Guid organizerId, Guid venueId, DateTimeOffset now, CancellationToken ct = default);

    /// <summary>Flushes mutations made to already-loaded bookings/occurrences (sweeps, cancels, no-shows).</summary>
    Task SaveAsync(CancellationToken ct = default);
}

/// <summary>An organizer's live upcoming-booking tallies: at one venue, and across all venues.</summary>
public sealed record UpcomingBookingCounts(int AtVenue, int Total);
