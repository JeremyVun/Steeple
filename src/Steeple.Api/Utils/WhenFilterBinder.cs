using System.Globalization;

namespace Steeple.Api.Utils;
/// <summary>
/// Resolves the raw time-first ("When") query params (CONTRACTS §3) into a validated
/// <see cref="AvailabilityFilter"/>, or a human <c>invalid_when</c> detail. Pure and clock-free —
/// the caller supplies venue-local "today" (the beachhead's single America/New_York timezone) so
/// the whole validation matrix is unit-testable without a controller or a clock. Bands resolve to
/// venue-local ranges: morning 08:00–12:00, afternoon 12:00–17:00, evening 17:00–22:00.
/// </summary>
public static class WhenFilterBinder
{
    /// <summary>Default minimum free-window length when <c>durationMinutes</c> is omitted (CONTRACTS §3).</summary>
    public const int DefaultDurationMinutes = 120;

    private const int MinDurationMinutes = 30;
    private const int MaxDurationMinutes = 720;

    /// <summary>
    /// The raw, already-flag-gated When query values. <paramref name="DayTokens"/> is the repeatable
    /// <c>daysOfWeek</c> collapsed to a token list (bound like the flags params); every other field is
    /// the single raw query value (null/blank = absent).
    /// </summary>
    public sealed record WhenQuery(
        string? Date,
        string? TimeOfDay,
        string? StartTime,
        string? EndTime,
        IReadOnlyList<string> DayTokens,
        string? DurationMinutes);

    /// <summary>The outcome: a resolved filter (possibly null = no When filter) or an <c>invalid_when</c> detail.</summary>
    public sealed record WhenBindResult(AvailabilityFilter? Filter, string? Error)
    {
        /// <summary>No When filter was requested (plain search).</summary>
        public static WhenBindResult None { get; } = new(null, null);

        /// <summary>A resolved When filter.</summary>
        public static WhenBindResult Ok(AvailabilityFilter filter) => new(filter, null);

        /// <summary>A validation failure carrying the human detail for the <c>invalid_when</c> 400.</summary>
        public static WhenBindResult Invalid(string detail) => new(null, detail);
    }

    /// <summary>
    /// Resolves the When filter. When <paramref name="flagEnabled"/> is false all When params are
    /// ignored (returns <see cref="WhenBindResult.None"/>). A filter is "active" only when a
    /// <c>date</c> (one-off) or <c>daysOfWeek</c> (recurring) is present; a lone time-of-day/range is
    /// an error, and a lone duration is ignored. <paramref name="todayLocal"/> is the venue-local
    /// (America/New_York) date the one-off <c>date</c> is validated against.
    /// </summary>
    public static WhenBindResult Resolve(WhenQuery query, DateOnly todayLocal, bool flagEnabled)
    {
        if (!flagEnabled)
        {
            return WhenBindResult.None;
        }

        var hasDate = !string.IsNullOrWhiteSpace(query.Date);
        var hasBand = !string.IsNullOrWhiteSpace(query.TimeOfDay);
        var hasStart = !string.IsNullOrWhiteSpace(query.StartTime);
        var hasEnd = !string.IsNullOrWhiteSpace(query.EndTime);
        var hasRange = hasStart || hasEnd;
        var hasDays = query.DayTokens.Count > 0;
        var hasDuration = !string.IsNullOrWhiteSpace(query.DurationMinutes);

        // A When filter needs an anchor (a date or weekdays). Without one a lone time constraint is a
        // mistake; a lone duration is meaningless and silently ignored (plain search).
        if (!hasDate && !hasDays)
        {
            return hasBand || hasRange
                ? WhenBindResult.Invalid("A time-of-day filter needs a date or days of the week.")
                : WhenBindResult.None;
        }

        if (hasDate && hasDays)
        {
            return WhenBindResult.Invalid("Search either a single date (one-off) or days of the week (recurring), not both.");
        }

        if (hasBand && hasRange)
        {
            return WhenBindResult.Invalid("Search either a time of day or an explicit start/end time, not both.");
        }

        var duration = DefaultDurationMinutes;
        if (hasDuration)
        {
            if (!int.TryParse(query.DurationMinutes, NumberStyles.Integer, CultureInfo.InvariantCulture, out duration))
            {
                return WhenBindResult.Invalid("durationMinutes must be a whole number of minutes.");
            }

            duration = Math.Clamp(duration, MinDurationMinutes, MaxDurationMinutes);
        }

        var (rangeKind, rangeStart, rangeEnd, band, rangeError) = ResolveRange(hasBand, hasRange, hasStart, hasEnd, query);
        if (rangeError is not null)
        {
            return WhenBindResult.Invalid(rangeError);
        }

        if (hasDate)
        {
            if (!DateOnly.TryParseExact(query.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return WhenBindResult.Invalid("date must be an ISO date (yyyy-MM-dd).");
            }

            if (date < todayLocal)
            {
                return WhenBindResult.Invalid("date can't be in the past (venue-local).");
            }

            return WhenBindResult.Ok(new AvailabilityFilter(
                IsRecurring: false, Date: date, Weekdays: Weekdays.None, rangeKind, rangeStart, rangeEnd, duration, band));
        }

        var days = FlagEnumExtensions.CombineTokens<Weekdays>(query.DayTokens, out var unknown);
        if (unknown.Count > 0)
        {
            return WhenBindResult.Invalid($"Unknown day of the week '{unknown[0]}'.");
        }

        if (days == Weekdays.None)
        {
            return WhenBindResult.Invalid("A recurring search needs at least one day of the week.");
        }

        return WhenBindResult.Ok(new AvailabilityFilter(
            IsRecurring: true, Date: null, Weekdays: days, rangeKind, rangeStart, rangeEnd, duration, band));
    }

    private static (WhenRangeKind Kind, TimeOnly Start, TimeOnly End, string? Band, string? Error) ResolveRange(
        bool hasBand, bool hasRange, bool hasStart, bool hasEnd, WhenQuery query)
    {
        if (hasBand)
        {
            return query.TimeOfDay!.Trim().ToLowerInvariant() switch
            {
                "morning" => (WhenRangeKind.Band, new TimeOnly(8, 0), new TimeOnly(12, 0), "morning", null),
                "afternoon" => (WhenRangeKind.Band, new TimeOnly(12, 0), new TimeOnly(17, 0), "afternoon", null),
                "evening" => (WhenRangeKind.Band, new TimeOnly(17, 0), new TimeOnly(22, 0), "evening", null),
                _ => (default, default, default, null, $"Unknown time of day '{query.TimeOfDay}' (use morning, afternoon or evening)."),
            };
        }

        if (hasRange)
        {
            if (!hasStart || !hasEnd)
            {
                return (default, default, default, null, "Both a start time and an end time are required for a time range.");
            }

            if (!TryParseTime(query.StartTime, out var start) || !TryParseTime(query.EndTime, out var end))
            {
                return (default, default, default, null, "Times must be HH:mm (24-hour), e.g. \"18:00\".");
            }

            if (end <= start)
            {
                return (default, default, default, null, "The end time must be after the start time.");
            }

            return (WhenRangeKind.Explicit, start, end, null, null);
        }

        return (WhenRangeKind.AnyWindow, default, default, null, null);
    }

    private static bool TryParseTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);
}
