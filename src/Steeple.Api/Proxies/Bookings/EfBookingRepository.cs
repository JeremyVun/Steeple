using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Api.Services.Bookings;

namespace Steeple.Api.Proxies.Bookings;
/// <summary>
/// EF Core adapter for <see cref="IBookingRepository"/>. Loads carry the full display graph
/// (room + venue, organizer, occurrences) — terms are bounded at ≤53 occurrences, so eager
/// loading beats a query per row. Booking creates take a transaction-scoped row lock on their
/// room before touching the btree_gist exclusion index: same-room contenders queue in one order
/// instead of deadlocking inside GiST. The constraint remains authoritative, and its violation
/// (SQLSTATE 23P01) becomes a <c>false</c> return from <see cref="TrySaveNewAsync"/>.
/// </summary>
public class EfBookingRepository : IBookingRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the EF context.</summary>
    public EfBookingRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<bool> TrySaveNewAsync(Booking booking, CancellationToken ct = default)
    {
        _db.Bookings.Add(booking);
        await using var transaction = await _db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        try
        {
            // Concurrent inserts into a GiST exclusion index can make both transactions wait on
            // one another, yielding SQLSTATE 40P01 instead of the expected 23P01 loser. Locking the
            // exact room row first gives every booking path the same order without serializing
            // unrelated rooms. ExecuteSql is intentional: SELECT still acquires the row lock and
            // Npgsql reports no affected-row count.
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"""SELECT 1 FROM rooms WHERE "Id" = {booking.RoomId} FOR UPDATE""", ct)
                .ConfigureAwait(false);

            // The booking, its occurrences, and tracked mutations riding along (the application's
            // Approved flip) commit or abort together.
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            await transaction.CommitAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex) when (HasSqlState(ex, PostgresErrorCodes.ExclusionViolation))
        {
            await transaction.RollbackAsync(CancellationToken.None).ConfigureAwait(false);

            // Slot already held. Nothing was written; detach the stillborn booking so the
            // caller's follow-up save (auto-decline) doesn't retry the same insert.
            // (Snapshot the list first — detaching triggers EF fixup that mutates the navigation.)
            foreach (var occurrence in booking.Occurrences.ToList())
            {
                _db.Entry(occurrence).State = EntityState.Detached;
            }

            _db.Entry(booking).State = EntityState.Detached;
            return false;
        }
    }

    private static bool HasSqlState(Exception exception, string sqlState)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres && postgres.SqlState == sqlState)
            {
                return true;
            }
        }

        return false;
    }

    /// <inheritdoc />
    public Task<Booking?> GetAsync(Guid bookingId, CancellationToken ct = default) =>
        Graph().FirstOrDefaultAsync(b => b.Id == bookingId, ct);

    /// <inheritdoc />
    public Task<BookingOccurrence?> GetOccurrenceAsync(Guid occurrenceId, CancellationToken ct = default) =>
        _db.BookingOccurrences
            .Include(o => o.Booking!).ThenInclude(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(o => o.Booking!).ThenInclude(b => b.Organizer)
            .Include(o => o.Booking!).ThenInclude(b => b.Occurrences)
            .FirstOrDefaultAsync(o => o.Id == occurrenceId, ct);

    /// <inheritdoc />
    public Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForOrganizerAsync(
        Guid organizerId, BookingStatus? status, int page, int pageSize, CancellationToken ct = default) =>
        PageAsync(Graph().Where(b => b.OrganizerId == organizerId), status, page, pageSize, ct);

    /// <inheritdoc />
    public Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForVenuesAsync(
        IReadOnlyList<Guid> venueIds, BookingStatus? status, int page, int pageSize, CancellationToken ct = default) =>
        PageAsync(Graph().Where(b => venueIds.Contains(b.Room!.VenueId)), status, page, pageSize, ct);

    /// <inheritdoc />
    public Task SaveAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);

    private IQueryable<Booking> Graph() =>
        _db.Bookings
            .Include(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(b => b.Organizer)
            .Include(b => b.Occurrences);

    private static async Task<(IReadOnlyList<Booking> Items, int TotalCount)> PageAsync(
        IQueryable<Booking> query, BookingStatus? status, int page, int pageSize, CancellationToken ct)
    {
        if (status is { } s)
        {
            query = query.Where(b => b.Status == s);
        }

        var total = await query.CountAsync(ct).ConfigureAwait(false);
        var items = await query
            .OrderByDescending(b => b.CreatedAtUtc)
            .ThenByDescending(b => b.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return (items, total);
    }
}
