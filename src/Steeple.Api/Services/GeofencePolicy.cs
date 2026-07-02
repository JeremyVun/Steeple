using Microsoft.Extensions.Options;

namespace Steeple.Api.Services;
/// <summary>
/// Default <see cref="IGeofencePolicy"/> implementation backed by <see cref="GeofenceOptions"/>.
/// The beachhead is the configured bounding box; all resolved search bounds are intersected
/// (clamped) into it so a query can never search outside the served area.
/// </summary>
public sealed class GeofencePolicy : IGeofencePolicy
{
    private readonly GeofenceOptions _options;

    /// <summary>Creates the policy from the bound geofence options.</summary>
    public GeofencePolicy(IOptions<GeofenceOptions> options)
    {
        _options = options.Value;
        Beachhead = new BoundingBox(
            MinLatitude: _options.MinLatitude,
            MaxLatitude: _options.MaxLatitude,
            MinLongitude: _options.MinLongitude,
            MaxLongitude: _options.MaxLongitude);
        Center = new GeoPoint(_options.CenterLatitude, _options.CenterLongitude);
    }

    /// <inheritdoc />
    public BoundingBox Beachhead { get; }

    /// <inheritdoc />
    public GeoPoint Center { get; }

    /// <inheritdoc />
    public string AreaName => _options.AreaName;

    /// <inheritdoc />
    public bool IsWithinBeachhead(double latitude, double longitude) =>
        Beachhead.Contains(latitude, longitude);

    /// <inheritdoc />
    public BoundingBox ResolveSearchBounds(ListingSearchQuery query)
    {
        // 1. Explicit viewport: all four edges supplied -> intersect with the beachhead.
        if (query.MinLat is double minLat && query.MaxLat is double maxLat &&
            query.MinLng is double minLng && query.MaxLng is double maxLng)
        {
            var viewport = new BoundingBox(
                MinLatitude: Math.Min(minLat, maxLat),
                MaxLatitude: Math.Max(minLat, maxLat),
                MinLongitude: Math.Min(minLng, maxLng),
                MaxLongitude: Math.Max(minLng, maxLng));
            return Intersect(viewport, Beachhead);
        }

        // 2. Center + radius -> build a bbox from the radius then intersect with the beachhead.
        if (query.CenterLat is double centerLat && query.CenterLng is double centerLng &&
            query.RadiusMeters is double radius && radius > 0)
        {
            var radiusBox = GeoMath.FromRadius(centerLat, centerLng, radius);
            return Intersect(radiusBox, Beachhead);
        }

        // 3. No spatial filter -> the full beachhead.
        return Beachhead;
    }

    /// <summary>
    /// Clamps each edge of <paramref name="box"/> into <paramref name="bounds"/>. The result is always
    /// contained by <paramref name="bounds"/>; a disjoint input collapses to a degenerate (empty) box
    /// pinned to the nearest edge, which yields zero matches rather than leaking outside the beachhead.
    /// </summary>
    private static BoundingBox Intersect(BoundingBox box, BoundingBox bounds) =>
        new(
            MinLatitude: Math.Clamp(box.MinLatitude, bounds.MinLatitude, bounds.MaxLatitude),
            MaxLatitude: Math.Clamp(box.MaxLatitude, bounds.MinLatitude, bounds.MaxLatitude),
            MinLongitude: Math.Clamp(box.MinLongitude, bounds.MinLongitude, bounds.MaxLongitude),
            MaxLongitude: Math.Clamp(box.MaxLongitude, bounds.MinLongitude, bounds.MaxLongitude));
}
