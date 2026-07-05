
namespace Steeple.Api.Contracts.Availability;
/// <summary>A room stub for calendar grouping/filtering.</summary>
public record CalendarRoomDto(Guid Id, string Name);

/// <summary>One confirmed occurrence on the venue calendar (venue-local wall-clock).</summary>
public record CalendarOccurrenceDto(
    Guid BookingId,
    Guid RoomId,
    string OrganizerName,
    DateOnly LocalDate,
    string StartTime,
    string EndTime,
    string Status);

/// <summary>
/// A pending application projected onto the calendar: the dates its schedule would occupy if
/// approved (an overlay, not a commitment — rendered dashed, per DESIGN_SYSTEM).
/// </summary>
public record CalendarPendingDto(
    Guid ApplicationId,
    Guid RoomId,
    string OrganizerName,
    string StartTime,
    string EndTime,
    IReadOnlyList<DateOnly> Dates);

/// <summary>
/// <c>GET /api/v1/manage/venues/{id}/calendar?from&amp;to</c> — manager-scoped, range ≤ 92 days
/// (`400 invalid_range`). Confirmed occurrences plus pending overlays across the venue's rooms.
/// </summary>
public record VenueCalendarDto(
    Guid VenueId,
    string Timezone,
    DateOnly From,
    DateOnly To,
    IReadOnlyList<CalendarRoomDto> Rooms,
    IReadOnlyList<CalendarOccurrenceDto> Occurrences,
    IReadOnlyList<CalendarPendingDto> Pending);

/// <summary>Another undecided application whose projected dates intersect this one's.</summary>
public record PendingOverlapDto(Guid ApplicationId, string OrganizerName, int OverlappingDateCount);

/// <summary>
/// Manager-detail-only conflict digest for reviewing an application: how the requested schedule
/// fares against rules + confirmed bookings, plus competing pending demand. Never exposed to
/// the organizer side (pending demand and other organizers' identities stay host-only).
/// </summary>
public record ApplicationConflictsDto(
    int TotalOccurrences,
    IReadOnlyList<ScheduleConflictDto> Conflicts,
    IReadOnlyList<PendingOverlapDto> PendingOverlaps);
