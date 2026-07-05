
namespace Steeple.Persistence.Models;
/// <summary>
/// An organizer's intent-first request to use a <see cref="Room"/> on a proposed venue-local
/// schedule. Applications never hold slots; materialization to a booking happens on approval
/// (Phase 3, SYSTEM_DESIGN §5).
/// </summary>
public class Application
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the requested room.</summary>
    public Guid RoomId { get; set; }

    /// <summary>Foreign key to the requesting organizer.</summary>
    public Guid OrganizerId { get; set; }

    /// <summary>Single value (not a flags mask) describing what will happen in the room.</summary>
    public ActivityType ActivityType { get; set; }

    /// <summary>Expected number of attendees.</summary>
    public int GroupSize { get; set; }

    /// <summary>How often the proposed schedule repeats.</summary>
    public ScheduleFrequency Frequency { get; set; }

    /// <summary>Venue-local wall-clock start date.</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>Venue-local wall-clock end date; mandatory when recurring (bounded recurrence).</summary>
    public DateOnly? EndDate { get; set; }

    /// <summary>Weekday of the recurring schedule; null for one-off applications.</summary>
    public DayOfWeek? DayOfWeek { get; set; }

    /// <summary>Venue-local wall-clock start time.</summary>
    public TimeOnly StartTime { get; set; }

    /// <summary>Venue-local wall-clock end time.</summary>
    public TimeOnly EndTime { get; set; }

    /// <summary>The organizer's free-text ask.</summary>
    public string IntentText { get; set; } = "";

    /// <summary>Current lifecycle state.</summary>
    public ApplicationStatus Status { get; set; }

    /// <summary>
    /// Client-supplied Idempotency-Key (CONTRACTS §2); a replayed submit for the same
    /// (organizer, key) resolves to this application instead of creating a duplicate.
    /// </summary>
    public Guid? IdempotencyKey { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>When a venue manager decided the application; null while undecided.</summary>
    public DateTimeOffset? DecidedAtUtc { get; set; }

    /// <summary>When an undecided application lapses (lazy expiry sweep).</summary>
    public DateTimeOffset ExpiresAtUtc { get; set; }

    /// <summary>Navigation to the requested room.</summary>
    public Room? Room { get; set; }

    /// <summary>Navigation to the requesting organizer.</summary>
    public User? Organizer { get; set; }

    /// <summary>The ask/answer message thread on this application.</summary>
    public ICollection<ApplicationMessage> Messages { get; set; } = new List<ApplicationMessage>();

    /// <summary>The booking created when this application was approved; null otherwise.</summary>
    public Booking? Booking { get; set; }

    /// <summary>Host counter-offers on this application (at most one open; the rest history).</summary>
    public ICollection<ApplicationCounterOffer> CounterOffers { get; set; } = new List<ApplicationCounterOffer>();
}
