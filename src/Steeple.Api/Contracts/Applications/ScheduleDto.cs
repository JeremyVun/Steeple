
namespace Steeple.Api.Contracts.Applications;
/// <summary>
/// A proposed usage schedule in <b>venue-local wall-clock</b> terms (CONTRACTS §2 "Local times"):
/// dates as <c>yyyy-MM-dd</c>, times as <c>HH:mm</c> strings. "9am Tuesday" means 9am in the
/// venue's timezone across DST; conversion to UTC happens only when a booking is materialized
/// (Phase 3).
/// </summary>
/// <param name="Frequency">Wire token: <c>oneOff</c> or <c>recurringWeekly</c>.</param>
/// <param name="StartDate">First (or only) date.</param>
/// <param name="EndDate">Last date — mandatory when recurring (recurrence is always bounded).</param>
/// <param name="DaysOfWeek">Wire tokens (<c>monday</c>…<c>sunday</c>), one or more, required when
/// recurring ("Tuesdays and Thursdays" is one schedule); emitted sorted Sunday-first.</param>
/// <param name="StartTime">Venue-local start, <c>HH:mm</c> (24h).</param>
/// <param name="EndTime">Venue-local end, <c>HH:mm</c> (24h), after <paramref name="StartTime"/>.</param>
public record ScheduleDto(
    string Frequency,
    DateOnly StartDate,
    DateOnly? EndDate,
    IReadOnlyList<string>? DaysOfWeek,
    string StartTime,
    string EndTime);
