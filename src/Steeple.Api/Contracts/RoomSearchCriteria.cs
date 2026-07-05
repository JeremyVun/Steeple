
namespace Steeple.Api.Contracts;
/// <summary>
/// Resolved, repository-facing search criteria. Produced from a <see cref="ListingSearchQuery"/>
/// after the geofence policy has clamped the bounds and pagination has been computed.
/// </summary>
/// <param name="Bounds">The (already clamped) geographic bounds to search within.</param>
/// <param name="MinCapacity">Optional minimum room capacity.</param>
/// <param name="FreeOnly">When <c>true</c>, only free rooms.</param>
/// <param name="Activities">Activity types to filter by; <see cref="ActivityType.None"/> means no filter.</param>
/// <param name="Accessibility">Accessibility features to filter by; <see cref="AccessibilityFeature.None"/> means no filter.</param>
/// <param name="Suburb">Optional suburb/locality filter (case-insensitive exact match); <c>null</c>/blank means no filter.</param>
/// <param name="Skip">Number of results to skip (pagination offset).</param>
/// <param name="Take">Maximum number of results to return (page size).</param>
/// <param name="Center">Optional search center. When set, results are ordered nearest-first so
/// pagination returns the closest rooms rather than the alphabetically-first page.</param>
/// <param name="When">Optional time-first ("When") filter. When set, the repository applies a cheap
/// open-hours/blackout SQL prefilter; the service refines survivors against real free windows
/// (open hours − blackouts − confirmed bookings) and paginates afterwards.</param>
public record RoomSearchCriteria(
    BoundingBox Bounds,
    int? MinCapacity,
    bool FreeOnly,
    ActivityType Activities,
    AccessibilityFeature Accessibility,
    string? Suburb,
    int Skip,
    int Take,
    GeoPoint? Center = null,
    AvailabilityFilter? When = null);
