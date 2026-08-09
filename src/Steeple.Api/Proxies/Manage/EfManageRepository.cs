using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Persistence.Queries;

namespace Steeple.Api.Proxies.Manage;
/// <summary>
/// EF adapter for <see cref="IManageRepository"/>. The one Postgres-specific translation lives
/// here: the idempotency ledger's primary-key violation (SQLSTATE 23505) becomes a <c>false</c>
/// return from the create methods, so a concurrent replay reads the original instead of erroring.
/// </summary>
public sealed class EfManageRepository : IManageRepository
{
    /// <summary>The idempotency ledger's composite primary key (016-idempotency.sql).</summary>
    private const string IdempotencyPrimaryKey = "PK_idempotency_records";

    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the scoped DbContext.</summary>
    public EfManageRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public Task<Venue?> GetVenueWithRoomsAsync(Guid venueId, CancellationToken ct = default) =>
        _db.Venues
            .Include(v => v.Rooms)
            .ThenInclude(r => r.Photos)
            .Include(v => v.VerificationRequests)
            .FirstOrDefaultAsync(v => v.Id == venueId, ct);

    /// <inheritdoc />
    public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) =>
        _db.Rooms
            .Include(r => r.Venue)
            .Include(r => r.Photos)
            .FirstOrDefaultAsync(r => r.Id == roomId, ct);

    /// <inheritdoc />
    public async Task<bool> AddVenueWithManagerAsync(
        Venue venue, Guid managerUserId, IdempotencyRecord? idempotency = null, CancellationToken ct = default)
    {
        var manager = new VenueManager
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            UserId = managerUserId,
            CreatedAtUtc = venue.CreatedAtUtc,
        };

        _db.Venues.Add(venue);
        _db.VenueManagers.Add(manager);

        // One SaveChanges = one transaction: a venue never exists without its first manager,
        // and never without the idempotency key that bought it.
        return await TrySaveWithIdempotencyAsync(idempotency, ct, venue, manager).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task AddVenueVerificationRequestAsync(VenueVerificationRequest request, CancellationToken ct = default)
    {
        _db.VenueVerificationRequests.Add(request);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<bool> AddRoomAsync(Room room, IdempotencyRecord? idempotency = null, CancellationToken ct = default)
    {
        _db.Rooms.Add(room);
        return await TrySaveWithIdempotencyAsync(idempotency, ct, room).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<Guid?> FindIdempotentResourceIdAsync(
        Guid userId, string scope, Guid key, CancellationToken ct = default)
    {
        var record = await _db.IdempotencyRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.UserId == userId && r.Scope == scope && r.Key == key, ct)
            .ConfigureAwait(false);

        return record?.ResourceId;
    }

    /// <summary>
    /// Commits the already-tracked <paramref name="added"/> entities together with the key that
    /// bought them. Returns false — having written nothing — when the key was spent concurrently.
    /// </summary>
    private async Task<bool> TrySaveWithIdempotencyAsync(
        IdempotencyRecord? idempotency, CancellationToken ct, params object[] added)
    {
        if (idempotency is not null)
        {
            _db.IdempotencyRecords.Add(idempotency);
        }

        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }
        // Named constraint, not just the SQLSTATE: a slug collision is also a 23505 and must
        // keep surfacing as the error it is rather than masquerading as a replay.
        catch (DbUpdateException ex) when (idempotency is not null
            && ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: IdempotencyPrimaryKey,
            })
        {
            // A concurrent request with the same key committed first, so this whole transaction
            // rolled back. Detach the stillborn entities so nothing retries the insert later in
            // the request scope; the caller resolves the winner's resource instead.
            foreach (var entity in added)
            {
                _db.Entry(entity).State = EntityState.Detached;
            }

            _db.Entry(idempotency!).State = EntityState.Detached;
            return false;
        }
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
    public Task<bool> HasFutureConfirmedVenueOccurrencesAsync(Guid venueId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
        _db.HasFutureConfirmedVenueOccurrenceAsync(venueId, nowUtc, ct);

    /// <inheritdoc />
    public Task<bool> HasPublishedRoomsAsync(Guid venueId, CancellationToken ct = default) =>
        _db.Rooms.AnyAsync(r => r.VenueId == venueId && r.Status == RoomStatus.Published, ct);

    /// <inheritdoc />
    public Task<bool> HasPendingVenueVerificationRequestAsync(Guid venueId, CancellationToken ct = default) =>
        _db.VenueVerificationRequests.AnyAsync(
            r => r.VenueId == venueId && r.Status == VenueVerificationStatus.Pending, ct);

    /// <inheritdoc />
    public Task<bool> IsTrustedHostAsync(Guid userId, CancellationToken ct = default) =>
        _db.Rooms.AnyAsync(
            r => r.FirstPublishedAtUtc != null
                && _db.VenueManagers.Any(m => m.VenueId == r.VenueId && m.UserId == userId),
            ct);

}
