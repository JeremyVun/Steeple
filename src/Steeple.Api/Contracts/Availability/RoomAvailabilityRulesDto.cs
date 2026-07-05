
namespace Steeple.Api.Contracts.Availability;
/// <summary>
/// One bookable window inside a day, in venue-local wall-clock <c>HH:mm</c> (24h) strings —
/// same time language as <see cref="Applications.ScheduleDto"/>. End is exclusive and must be
/// after start; windows never cross midnight (CONTRACTS §6a).
/// </summary>
public record OpenWindowDto(string StartTime, string EndTime);

/// <summary>
/// A weekday's open windows. <paramref name="DayOfWeek"/> is a §2.1 weekday token
/// (<c>sunday</c>…<c>saturday</c>); an empty <paramref name="Windows"/> list means closed that day.
/// </summary>
public record DayOpenHoursDto(string DayOfWeek, IReadOnlyList<OpenWindowDto> Windows);

/// <summary>A date the room is closed regardless of open hours (venue-local date).</summary>
public record BlackoutDateDto(DateOnly Date, string? Reason);

/// <summary>
/// A room's full availability rule set. Reads emit all seven days Sunday-first (closed days
/// included with empty windows) so form clients render without filling gaps; blackouts are
/// future-dated only and sorted ascending.
/// </summary>
public record RoomAvailabilityRulesDto(
    Guid RoomId,
    string Timezone,
    IReadOnlyList<DayOpenHoursDto> Days,
    IReadOnlyList<BlackoutDateDto> Blackouts);

/// <summary>
/// Replace-all write of a room's availability rules (<c>PUT</c> semantics: the saved state is
/// exactly this payload). Days may be sparse — an omitted weekday is closed. Limits: ≤6 windows
/// per day, no intra-day overlaps (adjacent <c>[)</c> windows are fine), ≤200 blackouts, no
/// past blackout dates.
/// </summary>
public record SaveAvailabilityRulesRequest(
    IReadOnlyList<DayOpenHoursDto>? Days,
    IReadOnlyList<BlackoutDateDto>? Blackouts);
