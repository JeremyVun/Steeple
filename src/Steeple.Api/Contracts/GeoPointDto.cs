namespace Steeple.Api.Contracts;
/// <summary>
/// Wire contract for a WGS84 coordinate (decimal degrees). A self-contained mirror of
/// <see cref="Steeple.Persistence.Models.GeoPoint"/> so response DTOs never leak the persistence
/// value object onto the wire.
/// </summary>
/// <param name="Latitude">Latitude in decimal degrees (north positive).</param>
/// <param name="Longitude">Longitude in decimal degrees (east positive).</param>
public record GeoPointDto(double Latitude, double Longitude);
