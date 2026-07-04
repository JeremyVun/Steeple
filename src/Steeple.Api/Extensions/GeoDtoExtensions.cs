namespace Steeple.Api.Extensions;
/// <summary>
/// Mapping helpers from the Persistence geo value objects to their self-contained wire DTOs
/// (<see cref="GeoPointDto"/>/<see cref="BoundingBoxDto"/>). Keeps <c>Steeple.Persistence.Models</c>
/// out of response contracts (see CONTRACTS.md §1) — the one deliberate exception is
/// <see cref="RoomSearchCriteria"/>, an internal repo-facing type that never reaches the wire.
/// </summary>
public static class GeoDtoExtensions
{
    /// <summary>Projects a <see cref="GeoPoint"/> to its wire DTO.</summary>
    public static GeoPointDto ToDto(this GeoPoint point) =>
        new(point.Latitude, point.Longitude);

    /// <summary>Projects a <see cref="BoundingBox"/> to its wire DTO.</summary>
    public static BoundingBoxDto ToDto(this BoundingBox box) =>
        new(box.MinLatitude, box.MaxLatitude, box.MinLongitude, box.MaxLongitude);
}
