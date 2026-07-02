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

    /// <summary>Image URL.</summary>
    public string Url { get; set; } = "";

    /// <summary>Optional caption / alt text.</summary>
    public string? Caption { get; set; }

    /// <summary>Whether this is the room's primary (cover) photo.</summary>
    public bool IsPrimary { get; set; }

    /// <summary>Ordering index for display.</summary>
    public int SortOrder { get; set; }
}
