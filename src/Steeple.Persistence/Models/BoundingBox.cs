namespace Steeple.Persistence.Models;
/// <summary>
/// An axis-aligned geographic rectangle expressed in decimal degrees.
/// Bounds are inclusive on all four edges.
/// </summary>
/// <param name="MinLatitude">Southern edge (smallest latitude).</param>
/// <param name="MaxLatitude">Northern edge (largest latitude).</param>
/// <param name="MinLongitude">Western edge (smallest longitude).</param>
/// <param name="MaxLongitude">Eastern edge (largest longitude).</param>
public readonly record struct BoundingBox(
    double MinLatitude,
    double MaxLatitude,
    double MinLongitude,
    double MaxLongitude)
{
    /// <summary>
    /// Returns <c>true</c> when the given coordinate falls within this box.
    /// All edges are inclusive.
    /// </summary>
    public bool Contains(double latitude, double longitude) =>
        latitude >= MinLatitude && latitude <= MaxLatitude &&
        longitude >= MinLongitude && longitude <= MaxLongitude;

    /// <summary>
    /// Returns <c>true</c> when the given point falls within this box (inclusive edges).
    /// </summary>
    public bool Contains(GeoPoint point) =>
        Contains(point.Latitude, point.Longitude);
}
