using Microsoft.EntityFrameworkCore;

namespace Steeple.Api.Proxies.Availability;
/// <summary>EF adapter for <see cref="IAvailabilityRepository"/>.</summary>
public sealed class EfAvailabilityRepository : IAvailabilityRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the scoped DbContext.</summary>
    public EfAvailabilityRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) =>
        _db.Rooms
            .Include(r => r.Venue)
            .FirstOrDefaultAsync(r => r.Id == roomId, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<RoomOpenHours>> GetOpenHoursAsync(Guid roomId, CancellationToken ct = default) =>
        await _db.RoomOpenHours
            .Where(h => h.RoomId == roomId)
            .OrderBy(h => h.DayOfWeek)
            .ThenBy(h => h.StartTime)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<IReadOnlyList<RoomBlackoutDate>> GetBlackoutsAsync(Guid roomId, CancellationToken ct = default) =>
        await _db.RoomBlackoutDates
            .Where(b => b.RoomId == roomId)
            .OrderBy(b => b.Date)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default) =>
        _db.RoomOpenHours.AnyAsync(h => h.RoomId == roomId, ct);

    /// <inheritdoc />
    public async Task ReplaceRulesAsync(
        Guid roomId,
        IReadOnlyList<RoomOpenHours> openHours,
        IReadOnlyList<RoomBlackoutDate> blackouts,
        CancellationToken ct = default)
    {
        var existingHours = await _db.RoomOpenHours.Where(h => h.RoomId == roomId).ToListAsync(ct).ConfigureAwait(false);
        var existingBlackouts = await _db.RoomBlackoutDates.Where(b => b.RoomId == roomId).ToListAsync(ct).ConfigureAwait(false);

        _db.RoomOpenHours.RemoveRange(existingHours);
        _db.RoomBlackoutDates.RemoveRange(existingBlackouts);
        _db.RoomOpenHours.AddRange(openHours);
        _db.RoomBlackoutDates.AddRange(blackouts);

        // One SaveChanges = one transaction: the delete and the insert land together.
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
