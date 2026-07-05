using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Extensions;
/// <summary>Projections from domain entities to the manager-facing DTOs (CONTRACTS §6).</summary>
public static class ManageMappings
{
    /// <summary>Maps a venue (rooms + photos loaded) to the editor detail shape.</summary>
    public static ManagedVenueDetailDto ToManagedDetailDto(this Venue venue) =>
        new(
            Id: venue.Id,
            Name: venue.Name,
            Slug: venue.Slug,
            Description: venue.Description,
            VenueType: FlagEnumExtensions.ToCamelCaseToken(venue.Type.ToString()),
            AddressLine: venue.AddressLine,
            Suburb: venue.Suburb,
            Postcode: venue.Postcode,
            ContactEmail: venue.ContactEmail,
            ParkingInfo: venue.ParkingInfo,
            TransitInfo: venue.TransitInfo,
            Latitude: venue.Latitude,
            Longitude: venue.Longitude,
            Timezone: venue.Timezone,
            IsIdentityVerified: venue.IsIdentityVerified,
            VerificationStatus: VerificationStatus(venue),
            VerificationRequestedAtUtc: venue.VerificationRequests
                .OrderByDescending(r => r.RequestedAtUtc)
                .FirstOrDefault()
                ?.RequestedAtUtc,
            Rooms: venue.Rooms
                .OrderBy(r => r.Name)
                .Select(r => r.ToManagedSummaryDto())
                .ToList());

    /// <summary>Maps a room to its row in the venue editor's room list.</summary>
    public static ManagedRoomSummaryDto ToManagedSummaryDto(this Room room) =>
        new(
            Id: room.Id,
            Name: room.Name,
            Slug: room.Slug,
            Status: FlagEnumExtensions.ToCamelCaseToken(room.Status.ToString()),
            PublishRequestedAtUtc: room.PublishRequestedAtUtc,
            Capacity: room.Capacity,
            IsFree: room.IsFree,
            PricePerHour: room.PricePerHour,
            Currency: room.Currency,
            // Same cover-selection rule as public listings; thumb-sized for the manage list.
            PrimaryPhotoUrl: room.Photos.CoverPhoto() is { } cover ? cover.ThumbUrl ?? cover.Url : null,
            PhotoCount: room.Photos.Count,
            UpdatedAtUtc: room.UpdatedAtUtc);

    /// <summary>Maps a room (venue + photos loaded) to the manager's full room shape.</summary>
    public static ManagedRoomDto ToManagedDto(this Room room) =>
        new(
            Id: room.Id,
            VenueId: room.VenueId,
            VenueName: room.Venue?.Name ?? "",
            VenueSlug: room.Venue?.Slug ?? "",
            Name: room.Name,
            Slug: room.Slug,
            Description: room.Description,
            Capacity: room.Capacity,
            PricePerHour: room.PricePerHour,
            Currency: room.Currency,
            HouseRules: room.HouseRules,
            Status: FlagEnumExtensions.ToCamelCaseToken(room.Status.ToString()),
            PublishRequestedAtUtc: room.PublishRequestedAtUtc,
            FirstPublishedAtUtc: room.FirstPublishedAtUtc,
            Activities: room.AcceptedActivityTypes.ToNameList(),
            Amenities: room.Amenities.ToNameList(),
            Accessibility: room.AccessibilityFeatures.ToNameList(),
            Photos: room.Photos
                .OrderByDescending(p => p.IsPrimary)
                .ThenBy(p => p.SortOrder)
                .Select(p => p.ToDto())
                .ToList(),
            UpdatedAtUtc: room.UpdatedAtUtc);

    private static string VerificationStatus(Venue venue)
    {
        if (venue.IsIdentityVerified)
        {
            return "verified";
        }

        return venue.VerificationRequests
            .OrderByDescending(r => r.RequestedAtUtc)
            .FirstOrDefault()
            ?.Status switch
            {
                VenueVerificationStatus.Pending => "pending",
                VenueVerificationStatus.Declined => "declined",
                VenueVerificationStatus.Approved => "verified",
                _ => "unverified",
            };
    }
}
