
namespace Steeple.Api.Extensions;
/// <summary>
/// Pure projection helpers mapping Domain entities to presentation DTOs for the discovery slice.
/// Flag enums are projected to stable camelCase wire tokens via <see cref="FlagEnumExtensions"/>;
/// the primary photo is resolved from the explicit cover flag, falling back to the lowest sort order.
/// </summary>
public static class ListingMappings
{
    /// <summary>
    /// Maps a <see cref="Room"/> to a search-result card. Latitude/Longitude are taken from the
    /// room's <see cref="Room.Venue"/>; <paramref name="distanceMeters"/> is supplied by the caller
    /// when a search center is present.
    /// </summary>
    public static RoomSummaryDto ToSummaryDto(this Room room, double? distanceMeters = null)
    {
        var venue = room.Venue;
        return new RoomSummaryDto(
            RoomId: room.Id,
            RoomSlug: room.Slug,
            VenueSlug: venue?.Slug ?? "",
            VenueName: venue?.Name ?? "",
            RoomName: room.Name,
            PrimaryPhotoUrl: ResolvePrimaryPhotoUrl(room.Photos),
            Capacity: room.Capacity,
            IsFree: room.IsFree,
            PricePerHour: room.PricePerHour,
            Currency: room.Currency,
            Latitude: venue?.Latitude ?? 0d,
            Longitude: venue?.Longitude ?? 0d,
            Activities: room.AcceptedActivityTypes.ToNameList(),
            Accessibility: room.AccessibilityFeatures.ToNameList(),
            DistanceMeters: distanceMeters);
    }

    /// <summary>
    /// Maps a <see cref="Room"/> (with its venue and photos loaded) to the full detail DTO.
    /// </summary>
    public static RoomDetailDto ToDetailDto(this Room room) =>
        new(
            RoomId: room.Id,
            RoomSlug: room.Slug,
            RoomName: room.Name,
            Description: room.Description,
            Capacity: room.Capacity,
            IsFree: room.IsFree,
            PricePerHour: room.PricePerHour,
            Currency: room.Currency,
            HouseRules: room.HouseRules,
            Amenities: room.Amenities.ToNameList(),
            Accessibility: room.AccessibilityFeatures.ToNameList(),
            Activities: room.AcceptedActivityTypes.ToNameList(),
            Photos: room.Photos
                .OrderByDescending(p => p.IsPrimary)
                .ThenBy(p => p.SortOrder)
                .Select(p => p.ToDto())
                .ToList(),
            Venue: room.Venue is { } venue
                ? venue.ToSummaryDto()
                : throw new InvalidOperationException($"Room {room.Id} has no loaded venue for detail mapping."));

    /// <summary>Maps a <see cref="Venue"/> to its presentation summary (no rooms collection).</summary>
    public static VenueSummaryDto ToSummaryDto(this Venue venue) =>
        new(
            VenueId: venue.Id,
            Name: venue.Name,
            Slug: venue.Slug,
            VenueType: FlagEnumExtensions.ToCamelCaseToken(venue.Type.ToString()),
            AddressLine: venue.AddressLine,
            Suburb: venue.Suburb,
            Postcode: venue.Postcode,
            ContactEmail: venue.ContactEmail,
            ParkingInfo: venue.ParkingInfo,
            TransitInfo: venue.TransitInfo,
            IsIdentityVerified: venue.IsIdentityVerified,
            Latitude: venue.Latitude,
            Longitude: venue.Longitude);

    /// <summary>Maps a <see cref="RoomPhoto"/> to its presentation DTO.</summary>
    public static RoomPhotoDto ToDto(this RoomPhoto photo) =>
        new(
            Url: photo.Url,
            Caption: photo.Caption,
            IsPrimary: photo.IsPrimary,
            SortOrder: photo.SortOrder);

    /// <summary>
    /// Resolves the cover image URL: the <see cref="RoomPhoto.IsPrimary"/> photo when present,
    /// otherwise the photo with the lowest <see cref="RoomPhoto.SortOrder"/>, otherwise <c>null</c>.
    /// </summary>
    private static string? ResolvePrimaryPhotoUrl(IEnumerable<RoomPhoto> photos)
    {
        RoomPhoto? best = null;

        foreach (var photo in photos)
        {
            if (photo.IsPrimary)
            {
                return photo.Url;
            }

            if (best is null || photo.SortOrder < best.SortOrder)
            {
                best = photo;
            }
        }

        return best?.Url;
    }
}
