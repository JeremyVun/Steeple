using Microsoft.EntityFrameworkCore;

namespace Steeple.Persistence.Queries;

/// <summary>
/// The "future confirmed occurrence" rule that blocks a room from leaving <c>Published</c>
/// (SYSTEM_DESIGN §5: ending a commitment needs explicit cancellation, not a status flip).
/// Expressed once here because both Api's <c>EfManageRepository</c> (single-room check on the
/// provider's own unpublish) and Admin's <c>PostgresAdminWorkspace</c> (bulk operator status
/// change) need the identical predicate and previously duplicated it.
/// </summary>
public static class BookingOccurrenceQueries
{
    /// <summary>The shared predicate: scheduled, still in the future, and its booking is confirmed.</summary>
    public static IQueryable<BookingOccurrence> FutureConfirmed(
        this IQueryable<BookingOccurrence> occurrences, DateTimeOffset nowUtc) =>
        occurrences.Where(o =>
            o.Status == OccurrenceStatus.Scheduled
            && o.EndUtc > nowUtc
            && o.Booking!.Status == BookingStatus.Confirmed);

    /// <summary>Whether the given room has any future confirmed occurrence (single-room check).</summary>
    public static Task<bool> HasFutureConfirmedOccurrenceAsync(
        this SteepleDbContext db, Guid roomId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        db.BookingOccurrences.Where(o => o.RoomId == roomId).FutureConfirmed(nowUtc).AnyAsync(ct);

    /// <summary>Which of the given rooms have a future confirmed occurrence (bulk check).</summary>
    public static IQueryable<Guid> RoomIdsWithFutureConfirmedOccurrences(
        this SteepleDbContext db, IReadOnlyCollection<Guid> roomIds, DateTimeOffset nowUtc) =>
        db.BookingOccurrences.Where(o => roomIds.Contains(o.RoomId)).FutureConfirmed(nowUtc).Select(o => o.RoomId).Distinct();
}
