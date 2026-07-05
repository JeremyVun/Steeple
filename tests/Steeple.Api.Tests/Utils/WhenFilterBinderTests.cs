using Steeple.Api.Utils;

namespace Steeple.Api.Tests.Utils;
/// <summary>
/// Unit tests for <see cref="WhenFilterBinder"/> (CONTRACTS §3 "When filter"): the flag gate, the
/// active/inactive decision, band resolution, the date/duration parsing, and the full
/// <c>invalid_when</c> validation matrix. Pure and clock-free — "today" is passed in.
/// </summary>
public class WhenFilterBinderTests
{
    private static readonly DateOnly Today = new(2026, 7, 6); // Monday

    private static WhenFilterBinder.WhenQuery Q(
        string? date = null, string? timeOfDay = null, string? startTime = null, string? endTime = null,
        IReadOnlyList<string>? days = null, string? duration = null) =>
        new(date, timeOfDay, startTime, endTime, days ?? [], duration);

    private static WhenFilterBinder.WhenBindResult Resolve(WhenFilterBinder.WhenQuery q, bool flag = true) =>
        WhenFilterBinder.Resolve(q, Today, flag);

    // ----- flag gate & inactive ---------------------------------------------------------------

    [Fact]
    public void FlagOff_AllWhenParamsIgnored()
    {
        var result = Resolve(Q(date: "2026-07-13", timeOfDay: "morning"), flag: false);

        Assert.Null(result.Error);
        Assert.Null(result.Filter);
    }

    [Fact]
    public void NoWhenParams_NoFilterNoError()
    {
        var result = Resolve(Q());

        Assert.Null(result.Error);
        Assert.Null(result.Filter);
    }

    [Fact]
    public void LoneDuration_IsIgnored_NotAFilter()
    {
        var result = Resolve(Q(duration: "90"));

        Assert.Null(result.Error);
        Assert.Null(result.Filter);
    }

    // ----- happy paths ------------------------------------------------------------------------

    [Fact]
    public void DateAlone_ResolvesToOneOffAnyWindow_DefaultDuration()
    {
        var result = Resolve(Q(date: "2026-07-13"));

        Assert.Null(result.Error);
        var f = result.Filter!;
        Assert.False(f.IsRecurring);
        Assert.Equal(new DateOnly(2026, 7, 13), f.Date);
        Assert.Equal(WhenRangeKind.AnyWindow, f.RangeKind);
        Assert.Equal(WhenFilterBinder.DefaultDurationMinutes, f.DurationMinutes);
        Assert.Null(f.TimeOfDayBand);
    }

    [Theory]
    [InlineData("morning", "08:00", "12:00")]
    [InlineData("afternoon", "12:00", "17:00")]
    [InlineData("evening", "17:00", "22:00")]
    public void Band_ResolvesToItsRange(string band, string start, string end)
    {
        var result = Resolve(Q(date: "2026-07-13", timeOfDay: band));

        var f = result.Filter!;
        Assert.Equal(WhenRangeKind.Band, f.RangeKind);
        Assert.Equal(TimeOnly.Parse(start), f.RangeStart);
        Assert.Equal(TimeOnly.Parse(end), f.RangeEnd);
        Assert.Equal(band, f.TimeOfDayBand);
    }

    [Fact]
    public void ExplicitRange_ResolvesToExplicit()
    {
        var result = Resolve(Q(date: "2026-07-13", startTime: "18:00", endTime: "20:00"));

        var f = result.Filter!;
        Assert.Equal(WhenRangeKind.Explicit, f.RangeKind);
        Assert.Equal(new TimeOnly(18, 0), f.RangeStart);
        Assert.Equal(new TimeOnly(20, 0), f.RangeEnd);
    }

    [Fact]
    public void Recurring_DaysOfWeek_ResolvesToMask()
    {
        var result = Resolve(Q(days: ["tuesday", "thursday"]));

        var f = result.Filter!;
        Assert.True(f.IsRecurring);
        Assert.Equal(Weekdays.Tuesday | Weekdays.Thursday, f.Weekdays);
        Assert.Null(f.Date);
    }

    [Theory]
    [InlineData("15", 30)]   // clamped up to min
    [InlineData("5000", 720)] // clamped down to max
    [InlineData("90", 90)]
    public void Duration_IsClamped(string raw, int expected)
    {
        var result = Resolve(Q(date: "2026-07-13", duration: raw));

        Assert.Equal(expected, result.Filter!.DurationMinutes);
    }

    // ----- invalid_when matrix ----------------------------------------------------------------

    [Fact]
    public void DateAndDaysOfWeekTogether_Invalid()
    {
        var result = Resolve(Q(date: "2026-07-13", days: ["tuesday"]));
        AssertInvalid(result);
    }

    [Fact]
    public void TimeOfDayAndExplicitRangeTogether_Invalid()
    {
        var result = Resolve(Q(date: "2026-07-13", timeOfDay: "morning", startTime: "09:00", endTime: "11:00"));
        AssertInvalid(result);
    }

    [Fact]
    public void TimeFilterWithoutDateOrDays_Invalid()
    {
        AssertInvalid(Resolve(Q(timeOfDay: "morning")));
        AssertInvalid(Resolve(Q(startTime: "09:00", endTime: "11:00")));
    }

    [Fact]
    public void MalformedDate_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "13-07-2026")));
        AssertInvalid(Resolve(Q(date: "not-a-date")));
    }

    [Fact]
    public void PastDate_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "2026-07-05"))); // day before Today
    }

    [Fact]
    public void EndBeforeOrEqualStart_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "2026-07-13", startTime: "20:00", endTime: "18:00")));
        AssertInvalid(Resolve(Q(date: "2026-07-13", startTime: "18:00", endTime: "18:00")));
    }

    [Fact]
    public void OnlyOneOfStartEnd_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "2026-07-13", startTime: "18:00")));
        AssertInvalid(Resolve(Q(date: "2026-07-13", endTime: "20:00")));
    }

    [Fact]
    public void MalformedTime_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "2026-07-13", startTime: "6pm", endTime: "8pm")));
    }

    [Fact]
    public void UnknownBand_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "2026-07-13", timeOfDay: "midnight")));
    }

    [Fact]
    public void UnknownWeekday_Invalid()
    {
        AssertInvalid(Resolve(Q(days: ["tuesday", "funday"])));
    }

    [Fact]
    public void NonIntegerDuration_Invalid()
    {
        AssertInvalid(Resolve(Q(date: "2026-07-13", duration: "two hours")));
    }

    private static void AssertInvalid(WhenFilterBinder.WhenBindResult result)
    {
        Assert.NotNull(result.Error);
        Assert.Null(result.Filter);
    }
}
