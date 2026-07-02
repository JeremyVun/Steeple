namespace Steeple.Persistence.Models;
/// <summary>
/// An immutable WGS84 geographic coordinate (decimal degrees).
/// </summary>
/// <param name="Latitude">Latitude in decimal degrees (north positive).</param>
/// <param name="Longitude">Longitude in decimal degrees (east positive).</param>
public readonly record struct GeoPoint(double Latitude, double Longitude);
