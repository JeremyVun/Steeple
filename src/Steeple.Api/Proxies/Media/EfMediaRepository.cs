namespace Steeple.Api.Proxies.Media;
/// <summary>EF adapter for <see cref="IMediaRepository"/>.</summary>
public sealed class EfMediaRepository : IMediaRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the scoped DbContext.</summary>
    public EfMediaRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<RoomPhoto?> GetPhotoAsync(Guid photoId, CancellationToken ct = default) =>
        await _db.Set<RoomPhoto>().FindAsync([photoId], ct).ConfigureAwait(false);

    /// <inheritdoc />
    public void AddPhoto(RoomPhoto photo) => _db.Set<RoomPhoto>().Add(photo);

    /// <inheritdoc />
    public void RemovePhoto(RoomPhoto photo) => _db.Set<RoomPhoto>().Remove(photo);

    /// <inheritdoc />
    public Task SaveChangesAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);
}
