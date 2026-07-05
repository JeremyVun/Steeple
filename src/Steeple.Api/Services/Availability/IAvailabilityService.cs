using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Services.Availability;
/// <summary>
/// Availability rules use-cases (SYSTEM_DESIGN §17, CONTRACTS §6a): a room's weekly open hours and
/// blackout dates. Reads and writes are venue-manager-scoped exactly like the Manage room routes —
/// unknown room or non-manager caller both answer <c>not_found</c> (no existence leak). Open hours
/// and blackouts are advisory rules; the <c>booking_occurrences</c> exclusion constraint remains
/// the only double-booking authority. Results reuse the Manage envelope (<see cref="ManageResult{T}"/>).
/// </summary>
public interface IAvailabilityService
{
    /// <summary>
    /// The room's full rule set, or <c>not_found</c> when the caller doesn't manage its venue.
    /// Emits all seven days Sunday-first (closed days with empty windows); blackouts ascending.
    /// </summary>
    Task<ManageResult<RoomAvailabilityRulesDto>> GetRulesAsync(Guid callerId, Guid roomId, CancellationToken ct = default);

    /// <summary>
    /// Replaces the room's entire rule set (PUT semantics). Validates weekday tokens, time formats,
    /// window counts/overlap, and blackout limits/past-dates; <c>invalid_availability</c> on the
    /// first problem. Returns the saved rule set on success.
    /// </summary>
    Task<ManageResult<RoomAvailabilityRulesDto>> SaveRulesAsync(
        Guid callerId, Guid roomId, SaveAvailabilityRulesRequest request, CancellationToken ct = default);

    /// <summary>Whether the room has any open-hours rows — the flag-gated publish check.</summary>
    Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>
    /// The public seven-day (Sunday-first) open-hours shape for a listing detail page, or null when
    /// the room has no declared hours (pre-gate legacy). No scoping — public read path.
    /// </summary>
    Task<IReadOnlyList<DayOpenHoursDto>?> GetPublicOpenHoursAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>
    /// The guest calendar feed: per-day free windows (open hours − blackouts − <b>confirmed</b>
    /// booked time) for a published room over <c>[from, to]</c> (venue-local dates). A
    /// <c>NotFound</c> result (unknown or not-<c>Published</c> room) 404s exactly like every public
    /// listing read; <c>invalid_range</c> covers <c>from</c> before venue-local today, <c>to</c>
    /// before <c>from</c>, or a span over 92 days.
    /// </summary>
    Task<AvailabilityReadResult<RoomAvailabilityDto>> GetPublicAvailabilityAsync(
        Guid roomId, DateOnly from, DateOnly to, CancellationToken ct = default);

    /// <summary>
    /// Advisory dry-run of a proposed schedule against the room's rules and confirmed bookings —
    /// the same computation the submit-time hard block runs. Materializes the schedule with the
    /// booking <see cref="Bookings.ScheduleMaterializer"/> and classifies each occurrence. A
    /// <c>NotFound</c> result 404s like the calendar feed; bad schedule input answers
    /// <c>invalid_application</c> (matching apply). A room with <b>no</b> availability rules reports
    /// every occurrence available (classification skipped).
    /// </summary>
    Task<AvailabilityReadResult<ScheduleCheckResultDto>> CheckScheduleAsync(
        Guid roomId, ScheduleDto? schedule, CancellationToken ct = default);
}

/// <summary>
/// Outcome of a public availability read: a value, a stable <c>invalid_*</c> error code the
/// controller maps to <c>400</c>, or "not found" (no value, no error) which the controller 404s —
/// the no-existence-leak stance shared by every public listing read.
/// </summary>
public sealed record AvailabilityReadResult<T>(T? Value, string? ErrorCode, string? ErrorDetail) where T : class
{
    /// <summary>Successful read.</summary>
    public static AvailabilityReadResult<T> Ok(T value) => new(value, null, null);

    /// <summary>Unknown or not-published room — the controller answers 404 (no existence leak).</summary>
    public static AvailabilityReadResult<T> NotFound() => new(null, null, null);

    /// <summary>A validation failure carrying the wire error code and human detail (400).</summary>
    public static AvailabilityReadResult<T> Fail(string code, string detail) => new(null, code, detail);

    /// <summary>True when the room was not found/visible (distinct from a validation failure).</summary>
    public bool IsNotFound => Value is null && ErrorCode is null;
}

/// <summary>The stable error codes the public availability reads return (CONTRACTS §6).</summary>
public static class AvailabilityErrorCodes
{
    /// <summary><c>from</c>/<c>to</c> failed the range rules (past, reversed, or over 92 days).</summary>
    public const string InvalidRange = "invalid_range";

    /// <summary>The proposed schedule failed validation (bad token / malformed or unbounded schedule).</summary>
    public const string InvalidApplication = "invalid_application";
}
