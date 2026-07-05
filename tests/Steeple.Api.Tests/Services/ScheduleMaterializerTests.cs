namespace Steeple.Api.Tests.Services;
/// <summary>
/// The timezone-correctness invariant (SYSTEM_DESIGN §5): occurrences are resolved per-date in
/// the venue's IANA zone, so "9am Tuesday" stays 9am on the wall clock across DST — never
/// start-plus-fixed-UTC-intervals. America/New_York in 2026: spring forward Mar 8 (2:00→3:00),
/// fall back Nov 1 (2:00→1:00). Recurring schedules carry a weekday *set* ("Tuesdays and
/// Thursdays" is one schedule); a single-day mask must behave exactly like the old single-day
/// materializer did.
/// </summary>
public class ScheduleMaterializerTests
{
    private static readonly TimeZoneInfo NewYork = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    [Fact]
    public void OneOff_YieldsSingleOccurrence_AtVenueLocalTime()
    {
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.OneOff,
            new DateOnly(2026, 7, 15), new DateOnly(2026, 7, 15), daysOfWeek: null,
            new TimeOnly(9, 0), new TimeOnly(11, 30), NewYork);

        var occurrence = Assert.Single(instants);
        Assert.Equal(new DateOnly(2026, 7, 15), occurrence.LocalDate);
        // July = EDT (UTC-4): 9:00 local is 13:00Z.
        Assert.Equal(new DateTimeOffset(2026, 7, 15, 13, 0, 0, TimeSpan.Zero), occurrence.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 7, 15, 15, 30, 0, TimeSpan.Zero), occurrence.EndUtc);
    }

    [Fact]
    public void Weekly_StartsOnFirstMatchingWeekday_AndEndsInsideTheBound()
    {
        // Sep 1, 2026 is a Tuesday; asking for Thursdays must start Sep 3 and step 7 days.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), Weekdays.Thursday,
            new TimeOnly(18, 0), new TimeOnly(20, 0), NewYork);

        Assert.Equal(
            [new DateOnly(2026, 9, 3), new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 17), new DateOnly(2026, 9, 24)],
            instants.Select(i => i.LocalDate).ToArray());
        Assert.All(instants, i => Assert.Equal(DayOfWeek.Thursday, i.LocalDate.DayOfWeek));
    }

    [Fact]
    public void MultiWeekday_YieldsAllMatchingDates_InDateOrder()
    {
        // Tuesdays and Thursdays over two weeks starting Wed Sep 2, 2026: the first Tuesday is
        // Sep 8, and Thursday Sep 3 comes before it — the output must interleave in date order,
        // not per-weekday blocks.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 2), new DateOnly(2026, 9, 15), Weekdays.Tuesday | Weekdays.Thursday,
            new TimeOnly(18, 0), new TimeOnly(20, 0), NewYork);

        Assert.Equal(
            [new DateOnly(2026, 9, 3), new DateOnly(2026, 9, 8), new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 15)],
            instants.Select(i => i.LocalDate).ToArray());
    }

    [Fact]
    public void MultiWeekday_AcrossSpringForward_EachDayKeepsWallClock()
    {
        // Sat+Sun 9:00 straddling Mar 8, 2026 (EST→EDT): Sat Mar 7 is still EST (14:00Z),
        // Sun Mar 8 and later are EDT (13:00Z). Per-date resolution, per weekday.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 3, 7), new DateOnly(2026, 3, 8), Weekdays.Saturday | Weekdays.Sunday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork);

        Assert.Equal(2, instants.Count);
        Assert.Equal(new DateTimeOffset(2026, 3, 7, 14, 0, 0, TimeSpan.Zero), instants[0].StartUtc); // EST
        Assert.Equal(new DateTimeOffset(2026, 3, 8, 13, 0, 0, TimeSpan.Zero), instants[1].StartUtc); // EDT
    }

    [Fact]
    public void Weekly_AcrossFallBack_KeepsWallClockTime_SoUtcShifts()
    {
        // Tuesdays 9:00 across Nov 1, 2026 (EDT→EST): the wall clock stays 9:00, so UTC moves
        // from 13:00Z to 14:00Z. Adding fixed UTC intervals would get this wrong — the test
        // pins the per-date materialization rule.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 10, 27), new DateOnly(2026, 11, 3), Weekdays.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(11, 0), NewYork);

        Assert.Equal(2, instants.Count);
        Assert.Equal(new DateTimeOffset(2026, 10, 27, 13, 0, 0, TimeSpan.Zero), instants[0].StartUtc); // EDT
        Assert.Equal(new DateTimeOffset(2026, 11, 3, 14, 0, 0, TimeSpan.Zero), instants[1].StartUtc);  // EST
    }

    [Fact]
    public void SpringForwardGap_NonexistentTime_ShiftsForwardByTheGap()
    {
        // 2:30 AM on Mar 8, 2026 doesn't exist in New York (clocks jump 2:00→3:00): it resolves
        // to 3:30 EDT = 7:30Z rather than throwing.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.OneOff,
            new DateOnly(2026, 3, 8), new DateOnly(2026, 3, 8), daysOfWeek: null,
            new TimeOnly(2, 30), new TimeOnly(4, 0), NewYork);

        var occurrence = Assert.Single(instants);
        Assert.Equal(new DateTimeOffset(2026, 3, 8, 7, 30, 0, TimeSpan.Zero), occurrence.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 3, 8, 8, 0, 0, TimeSpan.Zero), occurrence.EndUtc);
    }

    [Fact]
    public void FallBackAmbiguity_ResolvesToStandardTime()
    {
        // 1:30 AM on Nov 1, 2026 happens twice in New York; the materializer resolves the
        // ambiguity to the standard-time (second) instant: 1:30 EST = 6:30Z.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.OneOff,
            new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 1), daysOfWeek: null,
            new TimeOnly(1, 30), new TimeOnly(3, 0), NewYork);

        var occurrence = Assert.Single(instants);
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 6, 30, 0, TimeSpan.Zero), occurrence.StartUtc);
    }

    [Fact]
    public void Weekly_StartDateOnTheWeekday_IncludesTheStartDateItself()
    {
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 8), Weekdays.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork);

        Assert.Equal(new DateOnly(2026, 9, 1), instants[0].LocalDate);
        Assert.Equal(2, instants.Count);
    }

    [Theory]
    [InlineData(DayOfWeek.Sunday)]
    [InlineData(DayOfWeek.Monday)]
    [InlineData(DayOfWeek.Tuesday)]
    [InlineData(DayOfWeek.Wednesday)]
    [InlineData(DayOfWeek.Thursday)]
    [InlineData(DayOfWeek.Friday)]
    [InlineData(DayOfWeek.Saturday)]
    public void SingleDayMask_MatchesTheOldSingleWeekdayBehavior(DayOfWeek day)
    {
        // Regression pin for the mask migration: a mask of exactly one weekday must produce the
        // old algorithm's output — first matching weekday on/after start, stepping 7 days.
        var start = new DateOnly(2026, 9, 1);
        var end = new DateOnly(2026, 10, 15);
        var mask = (Weekdays)(1 << (int)day);

        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly, start, end, mask,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork);

        var offsetToFirst = ((int)day - (int)start.DayOfWeek + 7) % 7;
        var expected = new List<DateOnly>();
        for (var date = start.AddDays(offsetToFirst); date <= end; date = date.AddDays(7))
        {
            expected.Add(date);
        }

        Assert.Equal(expected, instants.Select(i => i.LocalDate).ToList());
    }

    [Fact]
    public void Weekly_WithoutWeekdays_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), daysOfWeek: null,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork));

        Assert.Throws<ArgumentNullException>(() => ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), Weekdays.None,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork));
    }
}
