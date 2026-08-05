using Microsoft.EntityFrameworkCore;
using Steeple.Api.Services.Reminders;

namespace Steeple.Api.Proxies.Reminders;
/// <summary>
/// EF Core adapter for <see cref="IBookingReminderRepository"/>. Bookings and occurrences are read
/// with no tracking — this module only ever reads them. The claim is raw SQL on purpose:
/// <c>INSERT … ON CONFLICT DO NOTHING</c> is a single atomic statement, so "did I win this
/// reminder?" is the database's answer, not a read-then-write the next sweep could interleave with.
/// </summary>
public class EfBookingReminderRepository : IBookingReminderRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the EF context.</summary>
    public EfBookingReminderRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<IReadOnlyList<Booking>> GetDueAsync(
        DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) =>
        await _db.Bookings
            .AsNoTracking()
            .Include(b => b.Room!).ThenInclude(r => r.Venue)
            .Include(b => b.Organizer)
            .Include(b => b.Occurrences)
            .Where(b => b.Status == BookingStatus.Confirmed
                && b.Occurrences.Any(o => o.Status == OccurrenceStatus.Scheduled
                    && o.StartUtc > fromUtc
                    && o.StartUtc <= toUtc))
            .OrderBy(b => b.CreatedAtUtc)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<bool> TryClaimAsync(
        Guid occurrenceId, BookingReminderKind kind, DateTimeOffset sentAtUtc, CancellationToken ct = default)
    {
        var rows = await _db.Database.ExecuteSqlInterpolatedAsync(
            $"""
             INSERT INTO booking_reminders ("Id", "OccurrenceId", "Kind", "SentAtUtc")
             VALUES ({Guid.NewGuid()}, {occurrenceId}, {(int)kind}, {sentAtUtc})
             ON CONFLICT ("OccurrenceId", "Kind") DO NOTHING
             """,
            ct).ConfigureAwait(false);

        return rows == 1;
    }

    /// <inheritdoc />
    public Task ReleaseClaimAsync(Guid occurrenceId, BookingReminderKind kind, CancellationToken ct = default) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"""
             DELETE FROM booking_reminders
             WHERE "OccurrenceId" = {occurrenceId} AND "Kind" = {(int)kind}
             """,
            ct);
}
