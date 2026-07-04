namespace Steeple.Api.Contracts;
/// <summary>
/// The served-area context the map/UI needs: the human-readable area name, the default map
/// center, and the fixed beachhead box used to frame the map. Served by the API so the geofence
/// config has a single home (the API enforces it; clients only display it).
/// </summary>
/// <param name="AreaName">Human-readable name of the served area.</param>
/// <param name="Center">Default map center for the served area.</param>
/// <param name="Beachhead">The fixed beachhead bounds (used to frame the map).</param>
public record GeofenceContextDto(string AreaName, GeoPointDto Center, BoundingBoxDto Beachhead);
