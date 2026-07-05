namespace Steeple.Api.Contracts;
/// <summary>
/// How the requested time-of-day constrains a <see cref="AvailabilityFilter"/>.
/// </summary>
public enum WhenRangeKind
{
    /// <summary>No time constraint — any free window on the date/weekday that fits the duration.</summary>
    AnyWindow,

    /// <summary>A named band (morning/afternoon/evening): a duration-length free window inside the band.</summary>
    Band,

    /// <summary>An explicit <c>startTime</c>/<c>endTime</c>: that exact range must be free.</summary>
    Explicit,
}

/// <summary>
/// Resolved, validated time-first ("When") search criteria (CONTRACTS §3). Produced by
/// <see cref="Steeple.Api.Utils.WhenFilterBinder"/> after flag-gating, parsing and validation, then
/// carried on <see cref="RoomSearchCriteria"/>. A room matches when it has a free window
/// (open hours − blackouts − <b>confirmed</b> bookings) satisfying the constraint on the relevant
/// venue-local dates: for a one-off, on <see cref="Date"/>; for a recurring filter, on <b>every</b>
/// date matching <see cref="Weekdays"/> within the next 28 days.
/// </summary>
/// <param name="IsRecurring">True for a recurring (weekday-mask) filter; false for a one-off (dated) filter.</param>
/// <param name="Date">The venue-local target date for a one-off filter; null when recurring.</param>
/// <param name="Weekdays">The requested weekday mask for a recurring filter; <see cref="Weekdays.None"/> when one-off.</param>
/// <param name="RangeKind">Whether/how a time-of-day range constrains the match.</param>
/// <param name="RangeStart">Band/explicit lower bound (venue-local); ignored when <see cref="RangeKind"/> is <see cref="WhenRangeKind.AnyWindow"/>.</param>
/// <param name="RangeEnd">Band/explicit upper bound (venue-local); ignored when <see cref="RangeKind"/> is <see cref="WhenRangeKind.AnyWindow"/>.</param>
/// <param name="DurationMinutes">Minimum free-window length a match must fit (default 120, clamped 30..720). Ignored for an explicit range (the range itself defines the duration).</param>
/// <param name="TimeOfDayBand">The normalized band token ("morning"/"afternoon"/"evening") when a band was used; null otherwise (analytics + display).</param>
public sealed record AvailabilityFilter(
    bool IsRecurring,
    DateOnly? Date,
    Weekdays Weekdays,
    WhenRangeKind RangeKind,
    TimeOnly RangeStart,
    TimeOnly RangeEnd,
    int DurationMinutes,
    string? TimeOfDayBand);
