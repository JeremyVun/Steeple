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
}
