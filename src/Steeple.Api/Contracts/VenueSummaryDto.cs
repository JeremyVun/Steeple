namespace Steeple.Api.Contracts;
/// <summary>
/// A venue projected for listing/detail presentation (no rooms collection).
/// </summary>
/// <param name="VenueId">Venue identifier.</param>
/// <param name="Name">Display name.</param>
/// <param name="Slug">URL-friendly identifier.</param>
/// <param name="VenueType">Venue type as a string token.</param>
/// <param name="AddressLine">Street address line.</param>
/// <param name="Suburb">Suburb / locality.</param>
/// <param name="Postcode">Postal code.</param>
/// <param name="ContactEmail">Public contact email for enquiries, if the venue published one.</param>
/// <param name="ParkingInfo">Lister-supplied parking guidance (empty when not provided).</param>
/// <param name="TransitInfo">Lister-supplied public-transport guidance (empty when not provided).</param>
/// <param name="IsIdentityVerified">Whether the operator's identity is verified.</param>
/// <param name="Latitude">Latitude in decimal degrees.</param>
/// <param name="Longitude">Longitude in decimal degrees.</param>
public record VenueSummaryDto(
    Guid VenueId,
    string Name,
    string Slug,
    string VenueType,
    string AddressLine,
    string Suburb,
    string Postcode,
    string? ContactEmail,
    string ParkingInfo,
    string TransitInfo,
    bool IsIdentityVerified,
    double Latitude,
    double Longitude);
