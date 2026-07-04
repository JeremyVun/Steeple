namespace Steeple.Api.Tests.Services;
/// <summary>
/// The timezone-correctness invariant (SYSTEM_DESIGN §5): occurrences are resolved per-date in
/// the venue's IANA zone, so "9am Tuesday" stays 9am on the wall clock across DST — never
/// start-plus-fixed-UTC-intervals. America/New_York in 2026: spring forward Mar 8 (2:00→3:00),
/// fall back Nov 1 (2:00→1:00).
/// </summary>
public class ScheduleMaterializerTests
{
    private static readonly TimeZoneInfo NewYork = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    [Fact]
    public void OneOff_YieldsSingleOccurrence_AtVenueLocalTime()
    {
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.OneOff,
            new DateOnly(2026, 7, 15), new DateOnly(2026, 7, 15), dayOfWeek: null,
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
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), DayOfWeek.Thursday,
            new TimeOnly(18, 0), new TimeOnly(20, 0), NewYork);

        Assert.Equal(
            [new DateOnly(2026, 9, 3), new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 17), new DateOnly(2026, 9, 24)],
            instants.Select(i => i.LocalDate).ToArray());
        Assert.All(instants, i => Assert.Equal(DayOfWeek.Thursday, i.LocalDate.DayOfWeek));
    }

    [Fact]
    public void Weekly_AcrossFallBack_KeepsWallClockTime_SoUtcShifts()
    {
        // Tuesdays 9:00 across Nov 1, 2026 (EDT→EST): the wall clock stays 9:00, so UTC moves
        // from 13:00Z to 14:00Z. Adding fixed UTC intervals would get this wrong — the test
        // pins the per-date materialization rule.
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 10, 27), new DateOnly(2026, 11, 3), DayOfWeek.Tuesday,
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
            new DateOnly(2026, 3, 8), new DateOnly(2026, 3, 8), dayOfWeek: null,
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
            new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 1), dayOfWeek: null,
            new TimeOnly(1, 30), new TimeOnly(3, 0), NewYork);

        var occurrence = Assert.Single(instants);
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 6, 30, 0, TimeSpan.Zero), occurrence.StartUtc);
    }

    [Fact]
    public void Weekly_StartDateOnTheWeekday_IncludesTheStartDateItself()
    {
        var instants = ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 8), DayOfWeek.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork);

        Assert.Equal(new DateOnly(2026, 9, 1), instants[0].LocalDate);
        Assert.Equal(2, instants.Count);
    }

    [Fact]
    public void Weekly_WithoutDayOfWeek_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => ScheduleMaterializer.Materialize(
            ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), dayOfWeek: null,
            new TimeOnly(9, 0), new TimeOnly(10, 0), NewYork));
    }
}
