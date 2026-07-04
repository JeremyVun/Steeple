namespace Steeple.Persistence.Constants;
/// <summary>
/// State of a single <see cref="Models.BookingOccurrence"/>
/// (Scheduled → Occurred | NoShow | Cancelled). Only non-Cancelled rows participate in the
/// no-double-booking exclusion constraint — cancelling an occurrence is what frees its slot.
/// </summary>
public enum OccurrenceStatus
{
    /// <summary>Upcoming (or not yet swept): the slot is held.</summary>
    Scheduled = 0,

    /// <summary>The occurrence's time passed without incident (flipped lazily on read).</summary>
    Occurred = 1,

    /// <summary>One party marked the other a no-show (feeds ratings in Phase 6).</summary>
    NoShow = 2,

    /// <summary>Cancelled — the slot is free again.</summary>
    Cancelled = 3,
}
