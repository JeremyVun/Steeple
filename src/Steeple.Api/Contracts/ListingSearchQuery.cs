
namespace Steeple.Api.Contracts;
/// <summary>
/// Model-bindable search request captured from the query string.
/// Either a center+radius or an explicit viewport (min/max lat/lng) may be supplied;
/// the geofence policy resolves and clamps these into the beachhead bounds.
/// </summary>
/// <remarks>
/// Day/time availability and recurrence filtering are intentionally deferred to the
/// future booking slice and are not modelled here.
/// </remarks>
public class ListingSearchQuery
{
    /// <summary>Optional search center latitude (decimal degrees).</summary>
    public double? CenterLat { get; set; }

    /// <summary>Optional search center longitude (decimal degrees).</summary>
    public double? CenterLng { get; set; }

    /// <summary>Optional search radius in metres around the center.</summary>
    public double? RadiusMeters { get; set; }

    /// <summary>Optional viewport southern edge (decimal degrees).</summary>
    public double? MinLat { get; set; }

    /// <summary>Optional viewport northern edge (decimal degrees).</summary>
    public double? MaxLat { get; set; }

    /// <summary>Optional viewport western edge (decimal degrees).</summary>
    public double? MinLng { get; set; }

    /// <summary>Optional viewport eastern edge (decimal degrees).</summary>
    public double? MaxLng { get; set; }

    /// <summary>
    /// Optional suburb/locality filter (case-insensitive exact match on the venue's suburb).
    /// Selecting a suburb both narrows the results and re-frames the map onto that locality.
    /// </summary>
    public string? Suburb { get; set; }

    /// <summary>Optional minimum room capacity filter.</summary>
    public int? MinCapacity { get; set; }

    /// <summary>When <c>true</c>, only free rooms are returned.</summary>
    public bool FreeOnly { get; set; } = false;

    /// <summary>Activity types to filter by (bitwise flags); <see cref="ActivityType.None"/> means no filter.</summary>
    public ActivityType Activities { get; set; } = ActivityType.None;

    /// <summary>Accessibility features to filter by (bitwise flags); <see cref="AccessibilityFeature.None"/> means no filter.</summary>
    public AccessibilityFeature Accessibility { get; set; } = AccessibilityFeature.None;

    /// <summary>1-based page number.</summary>
    public int Page { get; set; } = 1;

    /// <summary>Page size (results per page).</summary>
    public int PageSize { get; set; } = 24;
}
