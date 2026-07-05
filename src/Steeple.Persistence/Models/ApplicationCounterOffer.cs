namespace Steeple.Persistence.Models;
/// <summary>
/// A venue manager's alternative schedule proposed on a pending <see cref="Application"/>.
/// Counters never hold slots; accepting one runs the normal booking transaction on the counter
/// schedule, so the exclusion constraint still arbitrates races. At most one
/// <see cref="CounterOfferStatus.Open"/> counter exists per application; superseded and
/// answered rows remain as thread history.
/// </summary>
public class ApplicationCounterOffer
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the application being countered.</summary>
    public Guid ApplicationId { get; set; }

    /// <summary>The venue manager who proposed this counter.</summary>
    public Guid ProposedByUserId { get; set; }

    /// <summary>How often the counter schedule repeats.</summary>
    public ScheduleFrequency Frequency { get; set; }

    /// <summary>Venue-local wall-clock start date.</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>Venue-local wall-clock end date; mandatory when recurring (bounded recurrence).</summary>
    public DateOnly? EndDate { get; set; }

    /// <summary>Weekdays of a recurring counter schedule; null for one-offs.</summary>
    public Weekdays? DaysOfWeek { get; set; }

    /// <summary>Venue-local wall-clock start time.</summary>
    public TimeOnly StartTime { get; set; }

    /// <summary>Venue-local wall-clock end time.</summary>
    public TimeOnly EndTime { get; set; }

    /// <summary>Optional host note shown with the counter ("The hall is free an hour later").</summary>
    public string? Message { get; set; }

    /// <summary>Current lifecycle state.</summary>
    public CounterOfferStatus Status { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>When the organizer accepted/declined; null while open or lapsed unanswered.</summary>
    public DateTimeOffset? RespondedAtUtc { get; set; }

    /// <summary>Navigation to the application.</summary>
    public Application? Application { get; set; }

    /// <summary>Navigation to the proposing manager.</summary>
    public User? ProposedBy { get; set; }
}
