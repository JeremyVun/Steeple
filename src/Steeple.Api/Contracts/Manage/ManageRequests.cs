namespace Steeple.Api.Contracts.Manage;
/// <summary>
/// Create/update payload for a managed venue (CONTRACTS §6). One shape serves POST and PATCH:
/// on create the service requires name/description/address/suburb/postcode; on update, null
/// means "unchanged". Address-affecting changes re-geocode server-side (geofenced).
/// </summary>
public record SaveVenueRequest(
    string? Name,
    string? Description,
    string? VenueType,
    string? AddressLine,
    string? Suburb,
    string? Postcode,
    string? ContactEmail,
    string? ParkingInfo,
    string? TransitInfo);

/// <summary>One document link supplied with a venue verification request.</summary>
public record VenueVerificationDocumentRequest(string? Label, string? Url);

/// <summary>
/// Host-submitted proof that they own the venue or are authorized to lease/list its rooms.
/// The API stores labels and external/signed links only, not raw document contents.
/// </summary>
public record SubmitVenueVerificationRequest(
    string? ContactName,
    string? ContactEmail,
    string? EvidenceSummary,
    bool AttestedAuthority,
    IReadOnlyList<VenueVerificationDocumentRequest>? Documents);

/// <summary>
/// Create/update payload for a managed room (CONTRACTS §6). Null means "unchanged" on PATCH;
/// a non-positive <paramref name="PricePerHour"/> means free (matching the public IsFree rule).
/// <paramref name="Status"/> accepts <c>draft | published | unlisted</c>; asking for
/// <c>published</c> on a never-approved room records a publish request instead (moderation gate).
/// </summary>
public record SaveRoomRequest(
    string? Name,
    string? Description,
    int? Capacity,
    decimal? PricePerHour,
    string? HouseRules,
    string? Status,
    IReadOnlyList<string>? Activities,
    IReadOnlyList<string>? Amenities,
    IReadOnlyList<string>? Accessibility);

/// <summary>Metadata update for an uploaded photo (CONTRACTS §6). Null means "unchanged".</summary>
public record UpdatePhotoRequest(string? Caption, bool? IsPrimary, int? SortOrder);
