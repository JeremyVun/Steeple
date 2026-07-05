namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="AvailabilityCalculator"/>: the pure venue-local interval math behind
/// guest availability. Covers window subtraction (empty/full/partial/merging busy, and <c>[)</c>
/// adjacency where busy ending exactly at a slot's start is not a conflict) and occurrence
/// classification precedence (blackout ▸ outsideOpenHours ▸ booked, and the "must fit one window"
/// rule for a slot spanning two touching open windows). No clock, no database — DST conversion is
/// the caller's job.
/// </summary>
public class AvailabilityCalculatorTests
{
    private static (TimeOnly, TimeOnly) W(string start, string end) => (TimeOnly.Parse(start), TimeOnly.Parse(end));

    private static (string, string)[] Free(
        IReadOnlyList<(TimeOnly Start, TimeOnly End)> open, IReadOnlyList<(TimeOnly Start, TimeOnly End)> busy) =>
        AvailabilityCalculator.SubtractWindows(open, busy)
            .Select(w => (w.Start.ToString("HH\\:mm"), w.End.ToString("HH\\:mm")))
            .ToArray();

    // ----- SubtractWindows ---------------------------------------------------------------------

    [Fact]
    public void SubtractWindows_NoBusy_ReturnsOpenUnchanged() =>
        Assert.Equal([("09:00", "17:00")], Free([W("09:00", "17:00")], []));

    [Fact]
    public void SubtractWindows_BusyFullyCoversOpen_ReturnsNothing() =>
        Assert.Empty(Free([W("09:00", "17:00")], [W("08:00", "18:00")]));

    [Fact]
    public void SubtractWindows_BusyExactlyEqualsOpen_ReturnsNothing() =>
        Assert.Empty(Free([W("09:00", "17:00")], [W("09:00", "17:00")]));

    [Fact]
    public void SubtractWindows_BusyOverlapsStart_TrimsFront() =>
        Assert.Equal([("10:00", "17:00")], Free([W("09:00", "17:00")], [W("08:00", "10:00")]));

    [Fact]
    public void SubtractWindows_BusyOverlapsEnd_TrimsBack() =>
        Assert.Equal([("09:00", "15:00")], Free([W("09:00", "17:00")], [W("15:00", "18:00")]));

    [Fact]
    public void SubtractWindows_BusyInMiddle_SplitsIntoTwo() =>
        Assert.Equal([("09:00", "12:00"), ("13:00", "17:00")], Free([W("09:00", "17:00")], [W("12:00", "13:00")]));

    [Fact]
    public void SubtractWindows_MultipleOverlappingBusy_MergedBeforeSubtracting() =>
        Assert.Equal(
            [("09:00", "10:00"), ("13:00", "17:00")],
            Free([W("09:00", "17:00")], [W("10:00", "12:00"), W("11:00", "13:00")])); // 10–12 & 11–13 merge to 10–13

    [Fact]
    public void SubtractWindows_BusyEndingExactlyAtSlotStart_IsNotAConflict() =>
        // [08:00,09:00) busy, open [09:00,17:00): the touching endpoint frees the whole window.
        Assert.Equal([("09:00", "17:00")], Free([W("09:00", "17:00")], [W("08:00", "09:00")]));

    [Fact]
    public void SubtractWindows_BusyStartingExactlyAtSlotEnd_IsNotAConflict() =>
        Assert.Equal([("09:00", "17:00")], Free([W("09:00", "17:00")], [W("17:00", "19:00")]));

    [Fact]
    public void SubtractWindows_AdjacentOpenWindowsNoBusy_MergeIntoOne() =>
        Assert.Equal([("09:00", "15:00")], Free([W("09:00", "12:00"), W("12:00", "15:00")], []));

    [Fact]
    public void SubtractWindows_TwoOpenWindowsWithGap_StaySeparate() =>
        Assert.Equal(
            [("09:00", "12:00"), ("13:00", "17:00")],
            Free([W("09:00", "12:00"), W("13:00", "17:00")], []));

    // ----- ClassifyOccurrence ------------------------------------------------------------------

    private static readonly DateOnly Sunday = new(2026, 7, 5); // a Sunday

    private static AvailabilityRules Rules(
        IReadOnlyList<(TimeOnly, TimeOnly)>? sunday = null, params DateOnly[] blackouts) =>
        new(
            blackouts.ToHashSet(),
            sunday is null
                ? new Dictionary<DayOfWeek, IReadOnlyList<(TimeOnly, TimeOnly)>>()
                : new Dictionary<DayOfWeek, IReadOnlyList<(TimeOnly, TimeOnly)>> { [DayOfWeek.Sunday] = sunday });

    [Fact]
    public void ClassifyOccurrence_FitsOpenNoBusy_ReturnsNull() =>
        Assert.Null(AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("10:00"), TimeOnly.Parse("11:00"), Rules([W("09:00", "17:00")]), []));

    [Fact]
    public void ClassifyOccurrence_BlackoutBeatsOutsideOpenHoursAndBooked()
    {
        // Blackout date, slot also outside open hours, also overlapping busy: blackout wins.
        var reason = AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("20:00"), TimeOnly.Parse("21:00"),
            Rules([W("09:00", "17:00")], Sunday),
            [W("20:00", "21:00")]);
        Assert.Equal("blackout", reason);
    }

    [Fact]
    public void ClassifyOccurrence_OutsideOpenHoursBeatsBooked()
    {
        // Not a blackout; slot outside open hours AND overlapping busy → outsideOpenHours wins.
        var reason = AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("18:00"), TimeOnly.Parse("19:00"),
            Rules([W("09:00", "17:00")]),
            [W("18:00", "19:00")]);
        Assert.Equal("outsideOpenHours", reason);
    }

    [Fact]
    public void ClassifyOccurrence_InsideOpenButOverlapsBusy_ReturnsBooked() =>
        Assert.Equal("booked", AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("10:00"), TimeOnly.Parse("11:00"),
            Rules([W("09:00", "17:00")]), [W("10:30", "11:30")]));

    [Fact]
    public void ClassifyOccurrence_BusyEndingAtSlotStart_ReturnsNull() =>
        // [09:00,10:00) busy, slot [10:00,11:00): [) adjacency means available.
        Assert.Null(AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("10:00"), TimeOnly.Parse("11:00"),
            Rules([W("09:00", "17:00")]), [W("09:00", "10:00")]));

    [Fact]
    public void ClassifyOccurrence_SlotSpanningTwoTouchingOpenWindows_IsOutsideOpenHours() =>
        // Open [09:00,12:00)+[12:00,15:00) touch, but a 11:00–13:00 slot fits neither single window.
        Assert.Equal("outsideOpenHours", AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("11:00"), TimeOnly.Parse("13:00"),
            Rules([W("09:00", "12:00"), W("12:00", "15:00")]), []));

    [Fact]
    public void ClassifyOccurrence_NoOpenWindowsForWeekday_IsOutsideOpenHours() =>
        Assert.Equal("outsideOpenHours", AvailabilityCalculator.ClassifyOccurrence(
            Sunday, TimeOnly.Parse("10:00"), TimeOnly.Parse("11:00"), Rules(sunday: null), []));
}
