namespace Steeple.Persistence.Models;
/// <summary>
/// A whole venue-local date a <see cref="Room"/> is closed regardless of its open hours
/// (holiday, the venue's own event). One row per (room, date).
/// </summary>
public class RoomBlackoutDate
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the room.</summary>
    public Guid RoomId { get; set; }

    /// <summary>The venue-local date the room is closed.</summary>
    public DateOnly Date { get; set; }

    /// <summary>Optional host-facing note ("Holy Week").</summary>
    public string? Reason { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Navigation to the room.</summary>
    public Room? Room { get; set; }
}
