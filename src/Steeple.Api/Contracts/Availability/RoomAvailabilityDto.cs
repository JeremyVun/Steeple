
namespace Steeple.Api.Contracts.Availability;
/// <summary>
/// One calendar day of a room's computed availability: open hours minus blackouts minus
/// <b>confirmed</b> booked time (pending demand is never leaked). Windows are venue-local
/// <c>HH:mm</c> <c>[)</c> intervals; an open day fully booked out has <c>isBlackout: false</c>
/// and empty <paramref name="FreeWindows"/>; a closed weekday is the same shape (clients read
/// "closed vs booked out" off the room's <c>openHours</c> when they need the distinction).
/// </summary>
public record AvailabilityDayDto(DateOnly Date, bool IsBlackout, IReadOnlyList<OpenWindowDto> FreeWindows);

/// <summary>
/// <c>GET /api/v1/listings/{roomId}/availability?from&amp;to</c> — the guest calendar feed.
/// Anonymous, published-gated (Draft/Unlisted → 404), <c>from</c> ≥ today, range ≤ 92 days.
/// </summary>
public record RoomAvailabilityDto(
    Guid RoomId,
    string Timezone,
    DateOnly From,
    DateOnly To,
    IReadOnlyList<AvailabilityDayDto> Days);

/// <summary>
/// <c>POST /api/v1/listings/{roomId}/availability/check</c> body — an advisory dry-run of a
/// schedule against the room's rules and confirmed bookings. Same shape the apply form submits.
/// </summary>
public record CheckScheduleRequest(Applications.ScheduleDto? Schedule);

/// <summary>One occurrence that can't happen: <c>reason</c> ∈ <c>outsideOpenHours | blackout | booked</c>.</summary>
public record ScheduleConflictDto(DateOnly Date, string Reason);

/// <summary>
/// Advisory verdict (also the payload of the submit-time hard block's
/// <c>409 schedule_unavailable</c>): available means zero conflicts across all materialized
/// occurrences. Advisory only — the booking_occurrences exclusion constraint stays the authority.
/// </summary>
public record ScheduleCheckResultDto(
    bool Available,
    int TotalOccurrences,
    IReadOnlyList<ScheduleConflictDto> Conflicts);
