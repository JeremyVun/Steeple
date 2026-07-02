
namespace Steeple.Api.Utils;
/// <summary>
/// Pure geographic math helpers used by search distance computation and radius-to-bbox expansion.
/// </summary>
public static class GeoMath
{
    /// <summary>Mean earth radius in metres (sphere approximation).</summary>
    private const double EarthRadiusMeters = 6_371_000d;

    /// <summary>Approximate metres per degree of latitude (constant across the globe).</summary>
    private const double MetersPerDegreeLatitude = 111_320d;

    /// <summary>
    /// Great-circle distance between two coordinates in metres, via the haversine formula.
    /// </summary>
    /// <param name="lat1">First latitude (decimal degrees).</param>
    /// <param name="lng1">First longitude (decimal degrees).</param>
    /// <param name="lat2">Second latitude (decimal degrees).</param>
    /// <param name="lng2">Second longitude (decimal degrees).</param>
    public static double DistanceMeters(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLng = ToRadians(lng2 - lng1);

        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                Math.Sin(dLng / 2) * Math.Sin(dLng / 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return EarthRadiusMeters * c;
    }

    /// <summary>
    /// Builds an axis-aligned bounding box that encloses a circle of <paramref name="radiusMeters"/>
    /// around the given center. Latitude uses a fixed metres-per-degree; longitude is scaled by the
    /// cosine of the center latitude to account for meridian convergence.
    /// </summary>
    /// <param name="centerLat">Center latitude (decimal degrees).</param>
    /// <param name="centerLng">Center longitude (decimal degrees).</param>
    /// <param name="radiusMeters">Radius in metres.</param>
    public static BoundingBox FromRadius(double centerLat, double centerLng, double radiusMeters)
    {
        var latDelta = radiusMeters / MetersPerDegreeLatitude;

        // Guard against the poles where cos(lat) -> 0 producing an unbounded longitude span.
        var cosLat = Math.Cos(ToRadians(centerLat));
        var lngDelta = Math.Abs(cosLat) < 1e-12
            ? 180d
            : radiusMeters / (MetersPerDegreeLatitude * cosLat);

        return new BoundingBox(
            MinLatitude: centerLat - latDelta,
            MaxLatitude: centerLat + latDelta,
            MinLongitude: centerLng - lngDelta,
            MaxLongitude: centerLng + lngDelta);
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180d;
}
