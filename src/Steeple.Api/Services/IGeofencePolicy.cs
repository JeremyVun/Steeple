
namespace Steeple.Api.Services;
/// <summary>
/// The served-area policy: the one place that decides where steeple operates. Searches are
/// constrained to the served area and coordinates outside it are rejected or clamped. The
/// single-beachhead launch is an implementation detail of this port, not an assumption its
/// callers may make — serving more areas (or the world) is a new implementation behind this
/// interface plus additive wire changes (SYSTEM_DESIGN §17, 2026-08-07).
/// </summary>
public interface IGeofencePolicy
{
    /// <summary>The bounding box of the served area (currently the one configured beachhead).</summary>
    BoundingBox Bounds { get; }

    /// <summary>The default center point of the served area.</summary>
    GeoPoint Center { get; }

    /// <summary>Human-readable name of the served area.</summary>
    string AreaName { get; }

    /// <summary>
    /// The served area's IANA timezone, for reading "today" where no venue is in hand yet.
    /// Anything venue-scoped uses the venue's own timezone, never this.
    /// </summary>
    string TimezoneId { get; }

    /// <summary>Returns <c>true</c> when the coordinate lies within the served area.</summary>
    bool IsServed(double latitude, double longitude);

    /// <summary>
    /// Resolves the effective search bounds from a query by intersecting the requested
    /// viewport/radius with the served area. The result never exceeds the served area.
    /// </summary>
    BoundingBox ResolveSearchBounds(ListingSearchQuery query);
}
