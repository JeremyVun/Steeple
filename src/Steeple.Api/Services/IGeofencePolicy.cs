
namespace Steeple.Api.Services;
/// <summary>
/// Enforces the hyperlocal beachhead: searches are constrained to the served area and
/// coordinates outside it are rejected or clamped.
/// </summary>
public interface IGeofencePolicy
{
    /// <summary>The fixed bounding box of the served area.</summary>
    BoundingBox Beachhead { get; }

    /// <summary>The default center point of the served area.</summary>
    GeoPoint Center { get; }

    /// <summary>Human-readable name of the served area.</summary>
    string AreaName { get; }

    /// <summary>Returns <c>true</c> when the coordinate lies within the beachhead.</summary>
    bool IsWithinBeachhead(double latitude, double longitude);

    /// <summary>
    /// Resolves the effective search bounds from a query by intersecting the requested
    /// viewport/radius with the beachhead. The result never exceeds the beachhead.
    /// </summary>
    BoundingBox ResolveSearchBounds(ListingSearchQuery query);
}
