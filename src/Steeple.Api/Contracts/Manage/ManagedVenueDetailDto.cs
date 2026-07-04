namespace Steeple.Api.Contracts.Manage;
/// <summary>
/// A managed venue with everything the provider's editor needs
/// (<c>GET /api/v1/manage/venues/{id}</c>, CONTRACTS §6).
/// </summary>
public record ManagedVenueDetailDto(
    Guid Id,
    string Name,
    string Slug,
    string Description,
    string VenueType,
    string AddressLine,
    string Suburb,
    string Postcode,
    string? ContactEmail,
    string ParkingInfo,
    string TransitInfo,
    double Latitude,
    double Longitude,
    string Timezone,
    bool IsIdentityVerified,
    IReadOnlyList<ManagedRoomSummaryDto> Rooms);
