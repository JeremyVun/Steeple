using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Steeple.Api.Proxies.Media;
/// <summary>EF adapter for <see cref="IMediaRepository"/>.</summary>
public sealed class EfMediaRepository : IMediaRepository
{
    private const string SortOrderConstraint = "IX_room_photos_RoomId_SortOrder";
    private const string PrimaryConstraint = "IX_room_photos_RoomId_IsPrimary";

    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the scoped DbContext.</summary>
    public EfMediaRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<RoomPhoto?> GetPhotoAsync(Guid photoId, CancellationToken ct = default) =>
        await _db.Set<RoomPhoto>().FindAsync([photoId], ct).ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<PhotoPlacement> GetNextPlacementAsync(Guid roomId, CancellationToken ct = default)
    {
        var maxSortOrder = await _db.Set<RoomPhoto>()
            .AsNoTracking()
            .Where(photo => photo.RoomId == roomId)
            .Select(photo => (int?)photo.SortOrder)
            .MaxAsync(ct)
            .ConfigureAwait(false);

        return maxSortOrder is null
            ? new PhotoPlacement(0, true)
            : new PhotoPlacement(checked(maxSortOrder.Value + 1), false);
    }

    /// <inheritdoc />
    public void AddPhoto(RoomPhoto photo) => _db.Set<RoomPhoto>().Add(photo);

    /// <inheritdoc />
    public void RemovePhoto(RoomPhoto photo) => _db.Set<RoomPhoto>().Remove(photo);

    /// <inheritdoc />
    public async Task<bool> TrySaveAddedPhotoAsync(RoomPhoto photo, CancellationToken ct = default)
    {
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (DbUpdateException exception) when (IsPlacementConflict(exception))
        {
            // SaveChanges rolled its transaction back. Detach only the losing insert; the tracked
            // room timestamp remains pending and commits with the retried photo.
            _db.Entry(photo).State = EntityState.Detached;
            return false;
        }
    }

    /// <inheritdoc />
    public Task SaveChangesAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);

    private static bool IsPlacementConflict(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: SortOrderConstraint or PrimaryConstraint,
        };
}
