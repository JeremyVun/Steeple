using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Api.Services.Bookings;

namespace Steeple.Api.Proxies.Bookings;
/// <summary>
/// EF Core adapter for <see cref="IBookingRepository"/>. Loads carry the full display graph
/// (room + venue, organizer, occurrences) — terms are bounded at ≤53 occurrences, so eager
/// loading beats a query per row. The one Postgres-specific translation lives here: the
/// btree_gist exclusion constraint's violation (SQLSTATE 23P01) becomes a <c>false</c> return
/// from <see cref="TrySaveNewAsync"/>.
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
        try
        {
            // A single SaveChanges is one database transaction: the booking, its occurrences,
            // and any tracked mutations riding along (the application's Approved flip) commit
            // or abort together — the exclusion constraint makes overlap-approval impossible.
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation })
        {
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
