namespace Steeple.Api.Services.Media;
/// <summary>
/// Persistence port for the Media module's own data (<c>room_photos</c>). Shares the scoped
/// DbContext with the Manage reads, so one SaveChanges commits photo + room mutations together.
/// </summary>
public interface IMediaRepository
{
    /// <summary>The photo row, or null when unknown.</summary>
    Task<RoomPhoto?> GetPhotoAsync(Guid photoId, CancellationToken ct = default);

    /// <summary>Tracks a new photo row (persisted by <see cref="SaveChangesAsync"/>).</summary>
    void AddPhoto(RoomPhoto photo);

    /// <summary>Removes a photo row (persisted by <see cref="SaveChangesAsync"/>).</summary>
    void RemovePhoto(RoomPhoto photo);

    /// <summary>Persists pending mutations on tracked entities.</summary>
    Task SaveChangesAsync(CancellationToken ct = default);
}
