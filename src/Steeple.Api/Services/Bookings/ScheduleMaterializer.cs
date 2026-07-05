namespace Steeple.Api.Services.Bookings;
/// <summary>
/// Turns a venue-local schedule into the finite set of UTC instants a booking occupies
/// (SYSTEM_DESIGN §5): each occurrence date is resolved <b>per-date in the venue's timezone</b>,
/// so a "9am Tuesday" term straddling a DST transition keeps meaning 9am on the wall clock —
/// never start-plus-fixed-UTC-intervals. Pure and static so the DST edge cases are unit-testable
/// without a database.
/// </summary>
public static class ScheduleMaterializer
{
    /// <summary>
    /// Materializes every occurrence of the schedule, in date order. One-off schedules yield the
    /// single start date; recurring-weekly schedules yield each date whose weekday is in
    /// <paramref name="daysOfWeek"/> from <paramref name="startDate"/> through
    /// <paramref name="endDate"/> inclusive ("Tuesdays and Thursdays" is one schedule).
    /// </summary>
    public static IReadOnlyList<OccurrenceInstant> Materialize(
        ScheduleFrequency frequency,
        DateOnly startDate,
        DateOnly endDate,
        Weekdays? daysOfWeek,
        TimeOnly startTime,
        TimeOnly endTime,
        TimeZoneInfo venueZone)
    {
        var dates = frequency == ScheduleFrequency.RecurringWeekly
            ? WeeklyDates(
                startDate,
                endDate,
                daysOfWeek is { } days && days != Weekdays.None
                    ? days
                    : throw new ArgumentNullException(nameof(daysOfWeek), "A recurring schedule needs at least one weekday."))
            : [startDate];

        return dates
            .Select(date => new OccurrenceInstant(
                date,
                ToUtc(date, startTime, venueZone),
                ToUtc(date, endTime, venueZone)))
            .ToList();
    }

    /// <summary>The bit <see cref="Weekdays"/> uses for a date's weekday (Sunday = bit 0).</summary>
    public static Weekdays WeekdayBit(DateOnly date) => (Weekdays)(1 << (int)date.DayOfWeek);

    private static IEnumerable<DateOnly> WeeklyDates(DateOnly startDate, DateOnly endDate, Weekdays daysOfWeek)
    {
        // Day-by-day scan (≤ 366 iterations — terms are bounded) keeps multi-weekday output
        // provably date-ordered without merging per-weekday arithmetic sequences.
        for (var date = startDate; date <= endDate; date = date.AddDays(1))
        {
            if (daysOfWeek.HasFlag(WeekdayBit(date)))
            {
                yield return date;
            }
        }
    }

    /// <summary>
    /// Resolves a venue-local wall-clock moment to UTC, handling both DST edge cases
    /// deterministically: a time inside the spring-forward gap doesn't exist, so it shifts
    /// forward by the gap's length (2:30 → 3:30 where clocks jump 2→3); an ambiguous fall-back
    /// time resolves to its standard-time (second/later) instant, which is
    /// <see cref="TimeZoneInfo.ConvertTimeToUtc(DateTime, TimeZoneInfo)"/>'s documented behavior.
    /// </summary>
    private static DateTimeOffset ToUtc(DateOnly date, TimeOnly time, TimeZoneInfo venueZone)
    {
        var local = date.ToDateTime(time); // DateTimeKind.Unspecified — required by ConvertTimeToUtc
        if (venueZone.IsInvalidTime(local))
        {
            // The gap's length = how much the offset grows across the transition (usually 1h).
            var gap = venueZone.GetUtcOffset(local.AddDays(1)) - venueZone.GetUtcOffset(local.AddDays(-1));
            local = local.Add(gap);
        }

        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, venueZone), TimeSpan.Zero);
    }
}

/// <summary>One materialized occurrence: the venue-local date it renders as, plus its UTC range.</summary>
public readonly record struct OccurrenceInstant(DateOnly LocalDate, DateTimeOffset StartUtc, DateTimeOffset EndUtc);
