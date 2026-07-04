namespace Steeple.Persistence.Constants;
/// <summary>
/// State of a <see cref="Models.Booking"/>. Transitions (Confirmed → Completed | Cancelled) are
/// validated in the Bookings service; the wire representation is the camelCase token.
/// </summary>
public enum BookingStatus
{
    /// <summary>Live commitment: occurrences hold their slots.</summary>
    Confirmed = 0,

    /// <summary>The term ran its course (flipped lazily once the end date passes).</summary>
    Completed = 1,

    /// <summary>Cancelled by either party; freed occurrences no longer hold slots.</summary>
    Cancelled = 2,
}
