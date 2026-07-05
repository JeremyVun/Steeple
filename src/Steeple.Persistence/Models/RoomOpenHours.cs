namespace Steeple.Persistence.Models;
/// <summary>
/// One weekly open window of a <see cref="Room"/>, venue-local wall clock ("Tuesdays
/// 18:00–21:00"). Multiple windows per weekday may exist. Open hours are advisory rules for
/// availability computation and submit-time validation — the booking_occurrences exclusion
/// constraint remains the only double-booking authority.
/// </summary>
public class RoomOpenHours
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the room.</summary>
    public Guid RoomId { get; set; }

    /// <summary>Weekday of the window (0 = Sunday … 6 = Saturday, .NET convention).</summary>
    public DayOfWeek DayOfWeek { get; set; }

    /// <summary>Venue-local wall-clock window start.</summary>
    public TimeOnly StartTime { get; set; }

    /// <summary>Venue-local wall-clock window end; never crosses midnight in v1.</summary>
    public TimeOnly EndTime { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Navigation to the room.</summary>
    public Room? Room { get; set; }
}
