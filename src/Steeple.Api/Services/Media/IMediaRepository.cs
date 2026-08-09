namespace Steeple.Api.Services.Media;
/// <summary>
/// Persistence port for the Media module's own data (<c>room_photos</c>). Shares the scoped
/// DbContext with the Manage reads, so one SaveChanges commits photo + room mutations together.
/// </summary>
public interface IMediaRepository
{
    /// <summary>The photo row, or null when unknown.</summary>
    Task<RoomPhoto?> GetPhotoAsync(Guid photoId, CancellationToken ct = default);

    /// <summary>Reads the next display position and whether it is the room's first photo.</summary>
    Task<PhotoPlacement> GetNextPlacementAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>Tracks a new photo row (persisted by <see cref="SaveChangesAsync"/>).</summary>
    void AddPhoto(RoomPhoto photo);

    /// <summary>Removes a photo row (persisted by <see cref="SaveChangesAsync"/>).</summary>
    void RemovePhoto(RoomPhoto photo);

    /// <summary>
    /// Persists an added photo and other pending aggregate changes. Returns false after detaching
    /// the photo when another upload won its sort-order/primary position concurrently.
    /// </summary>
    Task<bool> TrySaveAddedPhotoAsync(RoomPhoto photo, CancellationToken ct = default);

    /// <summary>Persists pending mutations on tracked entities.</summary>
    Task SaveChangesAsync(CancellationToken ct = default);
}

/// <summary>Database-derived placement for a new room photo.</summary>
public readonly record struct PhotoPlacement(int SortOrder, bool IsPrimary);
