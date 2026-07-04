namespace Steeple.Persistence.Models;
/// <summary>
/// A photo associated with a <see cref="Room"/> listing.
/// </summary>
public class RoomPhoto
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the owning room.</summary>
    public Guid RoomId { get; set; }

    /// <summary>Navigation to the owning room.</summary>
    public Room? Room { get; set; }

    /// <summary>Full-size image URL (legacy external URLs for seeded rows; the 1600w variant for uploads).</summary>
    public string Url { get; set; } = "";

    /// <summary>
    /// Object-store key prefix for uploaded photos (variants live at <c>{key}-{width}.jpg</c>);
    /// null for legacy external-URL rows.
    /// </summary>
    public string? StorageKey { get; set; }

    /// <summary>400w variant URL (card thumbnails); null for legacy rows — fall back to <see cref="Url"/>.</summary>
    public string? ThumbUrl { get; set; }

    /// <summary>800w variant URL (galleries); null for legacy rows — fall back to <see cref="Url"/>.</summary>
    public string? CardUrl { get; set; }

    /// <summary>Upload timestamp (UTC). Pre-pipeline rows default to the migration time.</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Optional caption / alt text.</summary>
    public string? Caption { get; set; }

    /// <summary>Whether this is the room's primary (cover) photo.</summary>
    public bool IsPrimary { get; set; }

    /// <summary>Ordering index for display.</summary>
    public int SortOrder { get; set; }
}
