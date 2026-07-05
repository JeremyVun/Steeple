namespace Steeple.Persistence.Models;
/// <summary>
/// A confirmed commitment created by approving an <see cref="Application"/> (1:0..1). Carries a
/// venue-local copy of the approved schedule for display and renewal; the protected UTC instants
/// are its <see cref="Occurrences"/>. Terms are always bounded — renewal is a new booking
/// re-checking availability (SYSTEM_DESIGN §5).
/// </summary>
public class Booking
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the approved application (unique — one booking per application).</summary>
    public Guid ApplicationId { get; set; }

    /// <summary>Foreign key to the booked room.</summary>
    public Guid RoomId { get; set; }

    /// <summary>Foreign key to the organizer holding the booking.</summary>
    public Guid OrganizerId { get; set; }

    /// <summary>Whether this is a single occurrence or a bounded series.</summary>
    public BookingType Type { get; set; }

    /// <summary>Venue-local first (or only) date.</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>Venue-local last date — always set (bounded recurrence).</summary>
    public DateOnly EndDate { get; set; }

    /// <summary>Weekday of a recurring booking; null for one-offs.</summary>
    public DayOfWeek? DayOfWeek { get; set; }

    /// <summary>Venue-local wall-clock start time.</summary>
    public TimeOnly StartTime { get; set; }

    /// <summary>Venue-local wall-clock end time.</summary>
    public TimeOnly EndTime { get; set; }

    /// <summary>Current lifecycle state.</summary>
    public BookingStatus Status { get; set; }

    /// <summary>User who cancelled the booking; null while not cancelled.</summary>
    public Guid? CancelledBy { get; set; }

    /// <summary>When the booking was cancelled.</summary>
    public DateTimeOffset? CancelledAtUtc { get; set; }

    /// <summary>The canceller's optional reason (shown to the other party).</summary>
    public string? CancelReason { get; set; }

    /// <summary>When the renewal-due nudge was sent; null until then (lazy sweep on read).</summary>
    public DateTimeOffset? RenewalNudgeSentAtUtc { get; set; }

    /// <summary>Creation (= approval) timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Navigation to the approved application.</summary>
    public Application? Application { get; set; }

    /// <summary>Navigation to the booked room.</summary>
    public Room? Room { get; set; }

    /// <summary>Navigation to the organizer.</summary>
    public User? Organizer { get; set; }

    /// <summary>The materialized occurrences of this booking.</summary>
    public ICollection<BookingOccurrence> Occurrences { get; set; } = new List<BookingOccurrence>();

    /// <summary>The two possible directional ratings for this booking.</summary>
    public ICollection<Rating> Ratings { get; set; } = new List<Rating>();
}
