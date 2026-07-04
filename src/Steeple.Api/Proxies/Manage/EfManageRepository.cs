using Microsoft.EntityFrameworkCore;
using Steeple.Persistence.Queries;

namespace Steeple.Api.Proxies.Manage;
/// <summary>EF adapter for <see cref="IManageRepository"/>.</summary>
public sealed class EfManageRepository : IManageRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the scoped DbContext.</summary>
    public EfManageRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public Task<Venue?> GetVenueWithRoomsAsync(Guid venueId, CancellationToken ct = default) =>
        _db.Venues
            .Include(v => v.Rooms)
            .ThenInclude(r => r.Photos)
            .FirstOrDefaultAsync(v => v.Id == venueId, ct);

    /// <inheritdoc />
    public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) =>
        _db.Rooms
            .Include(r => r.Venue)
            .Include(r => r.Photos)
            .FirstOrDefaultAsync(r => r.Id == roomId, ct);

    /// <inheritdoc />
    public async Task AddVenueWithManagerAsync(Venue venue, Guid managerUserId, CancellationToken ct = default)
    {
        _db.Venues.Add(venue);
        _db.VenueManagers.Add(new VenueManager
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            UserId = managerUserId,
            CreatedAtUtc = venue.CreatedAtUtc,
        });

        // One SaveChanges = one transaction: a venue never exists without its first manager.
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task AddRoomAsync(Room room, CancellationToken ct = default)
    {
        _db.Rooms.Add(room);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task SaveChangesAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);

    /// <inheritdoc />
    public Task<bool> VenueSlugExistsAsync(string slug, CancellationToken ct = default) =>
        _db.Venues.AnyAsync(v => v.Slug == slug, ct);

    /// <inheritdoc />
    public Task<bool> RoomSlugExistsAsync(Guid venueId, string slug, CancellationToken ct = default) =>
        _db.Rooms.AnyAsync(r => r.VenueId == venueId && r.Slug == slug, ct);

    /// <inheritdoc />
    public Task<bool> HasFutureConfirmedOccurrencesAsync(Guid roomId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        _db.HasFutureConfirmedOccurrenceAsync(roomId, nowUtc, ct);

    /// <inheritdoc />
    public Task<bool> HasPublishedRoomsAsync(Guid venueId, CancellationToken ct = default) =>
        _db.Rooms.AnyAsync(r => r.VenueId == venueId && r.Status == RoomStatus.Published, ct);
}
