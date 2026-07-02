namespace Steeple.Web.Models;

// Web's own view models — the shapes it deserializes the Steeple.Api JSON into and renders.
// The funnel shares no project with the server; this is its private mirror of the API's web
// contract, kept in sync by convention. Property names match the API's camelCase JSON.

/// <summary>An immutable WGS84 coordinate (decimal degrees).</summary>
public readonly record struct GeoPoint(double Latitude, double Longitude);

/// <summary>An axis-aligned geographic rectangle (decimal degrees), used to frame the map.</summary>
public readonly record struct BoundingBox(
    double MinLatitude,
    double MaxLatitude,
    double MinLongitude,
    double MaxLongitude);

/// <summary>Activity categories a room accepts / the funnel filters by (bitwise flags).</summary>
[Flags]
public enum ActivityType
{
    None = 0,
    Children = 1,
    Sports = 2,
    Community = 4,
    Religious = 8,
    Arts = 16,
    Education = 32,
    Music = 64,
}

/// <summary>Accessibility features a room provides / the funnel filters by (bitwise flags).</summary>
[Flags]
public enum AccessibilityFeature
{
    None = 0,
    StepFreeAccess = 1,
    AccessibleRestroom = 2,
    AccessibleParking = 4,
    HearingLoop = 8,
    LiftAccess = 16,
}

/// <summary>A room photo as rendered on a card / detail page.</summary>
public record RoomPhotoDto(string Url, string? Caption, bool IsPrimary, int SortOrder);

/// <summary>A room projected as a search-result card.</summary>
public record RoomSummaryDto(
    Guid RoomId,
    string RoomSlug,
    string VenueSlug,
    string VenueName,
    string RoomName,
    string? PrimaryPhotoUrl,
    int Capacity,
    bool IsFree,
    decimal? PricePerHour,
    string Currency,
    double Latitude,
    double Longitude,
    IReadOnlyList<string> Activities,
    IReadOnlyList<string> Accessibility,
    double? DistanceMeters);

/// <summary>A venue projected for listing/detail presentation.</summary>
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

/// <summary>Full room detail for the listing detail page, including its venue.</summary>
public record RoomDetailDto(
    Guid RoomId,
    string RoomSlug,
    string RoomName,
    string Description,
    int Capacity,
    bool IsFree,
    decimal? PricePerHour,
    string Currency,
    string HouseRules,
    IReadOnlyList<string> Amenities,
    IReadOnlyList<string> Accessibility,
    IReadOnlyList<string> Activities,
    IReadOnlyList<RoomPhotoDto> Photos,
    VenueSummaryDto Venue);

/// <summary>A single sitemap URL: a published listing's slug path plus a last-modified stamp.</summary>
public record SitemapEntry(string VenueSlug, string RoomSlug, DateTimeOffset LastModifiedUtc);

/// <summary>The outcome of a listing search: the page of results plus the geographic context.</summary>
public record ListingSearchResult(
    IReadOnlyList<RoomSummaryDto> Items,
    int TotalCount,
    bool IsZeroResult,
    BoundingBox AppliedBounds,
    GeoPoint Center,
    int Page,
    int PageSize);

/// <summary>Served-area context (name, center, beachhead box) for framing the map and copy.</summary>
public record GeofenceContextDto(string AreaName, GeoPoint Center, BoundingBox Beachhead);

/// <summary>Model-bindable search request captured from the query string (drives the sticky filter UI).</summary>
public class ListingSearchQuery
{
    public double? CenterLat { get; set; }
    public double? CenterLng { get; set; }
    public double? RadiusMeters { get; set; }
    public double? MinLat { get; set; }
    public double? MaxLat { get; set; }
    public double? MinLng { get; set; }
    public double? MaxLng { get; set; }
    public string? Suburb { get; set; }
    public int? MinCapacity { get; set; }
    public bool FreeOnly { get; set; } = false;
    public ActivityType Activities { get; set; } = ActivityType.None;
    public AccessibilityFeature Accessibility { get; set; } = AccessibilityFeature.None;
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 24;
}
