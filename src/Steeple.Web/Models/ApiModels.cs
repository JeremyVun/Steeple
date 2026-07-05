namespace Steeple.Web.Models;

// Web's own view models — the shapes it deserializes the Steeple.Api JSON into and renders.
// The funnel shares no project with the server; this is its private mirror of the API's web
// contract, kept in sync by convention. Property names match the API's camelCase JSON.
//
// Enum-derived string values (Activities/Accessibility/Amenities/VenueType) are stable camelCase
// wire tokens (e.g. "stepFreeAccess", "publicSpace"), not pre-humanized display strings — see
// DiscoveryViewModel.Humanize for turning them into sentence-case labels for display.

/// <summary>An immutable WGS84 coordinate (decimal degrees).</summary>
public readonly record struct GeoPoint(double Latitude, double Longitude);

/// <summary>An axis-aligned geographic rectangle (decimal degrees), used to frame the map.</summary>
public readonly record struct BoundingBox(
    double MinLat,
    double MaxLat,
    double MinLng,
    double MaxLng);

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
public record RoomPhotoDto(Guid Id, string Url, string? ThumbUrl, string? CardUrl, string? Caption, bool IsPrimary, int SortOrder);

/// <summary>Visible star-rating aggregate for a venue/listing surface.</summary>
public record RatingSummaryDto(double AverageStars, int Count);

/// <summary>One public, revealed venue review comment.</summary>
public record VenueReviewDto(int Stars, string? Comment, string RaterName, DateTimeOffset CreatedAtUtc);

/// <summary>Paginated public reviews for a venue.</summary>
public record VenueReviewPageDto(
    IReadOnlyList<VenueReviewDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>A room projected as a search-result card.</summary>
public record RoomSummaryDto(
    Guid RoomId,
    Guid VenueId,
    string RoomSlug,
    string VenueSlug,
    string VenueName,
    string Suburb,
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
    double? DistanceMeters,
    RatingSummaryDto? Rating);

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
    VenueSummaryDto Venue,
    RatingSummaryDto? Rating);

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

// --- Identity (CONTRACTS §4). The BFF exchanges provider ID tokens at the API and keeps the
// --- returned token pair server-side inside the encrypted auth cookie; these are its mirrors.

/// <summary><c>POST /api/v1/auth/sessions</c> request body.</summary>
public record CreateSessionRequest(
    string Provider,
    string IdToken,
    string? Nonce,
    string? TurnstileToken,
    string? DisplayName,
    DeviceInfoDto? Device);

/// <summary>The signing-in device, recorded on the API-side session.</summary>
public record DeviceInfoDto(string Platform, string? Label);

/// <summary>A freshly issued session: the API's token pair plus the resolved user.</summary>
public record SessionResponse(string AccessToken, string RefreshToken, SessionUserDto User, bool IsNewUser);

/// <summary>The signed-in user as returned at session creation.</summary>
public record SessionUserDto(Guid Id, string DisplayName, string? Email, DateTimeOffset CreatedAtUtc);

/// <summary>The rotated token pair returned by <c>POST /api/v1/auth/refresh</c>.</summary>
public record RefreshResponse(string AccessToken, string RefreshToken);

/// <summary><c>GET /api/v1/me</c>: profile plus recorded legal-document acceptances.</summary>
public record MeResponse(
    Guid Id,
    string DisplayName,
    string? Email,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyList<AgreementDto> Agreements);

/// <summary>One recorded acceptance of a legal document version (docType: "tos" | "privacy").</summary>
public record AgreementDto(string DocType, string Version, DateTimeOffset AcceptedAtUtc);

/// <summary><c>POST /api/v1/me/agreements</c> request body.</summary>
public record AcceptAgreementRequest(string DocType, string Version);

// --- Applications (CONTRACTS §5) ---

/// <summary>
/// A proposed usage schedule in <b>venue-local wall-clock</b> terms (CONTRACTS §2 "Local times"):
/// dates as <c>yyyy-MM-dd</c>, times as <c>HH:mm</c> strings. "9am Tuesday" means 9am in the
/// venue's timezone across DST; conversion to UTC happens only when a booking is materialized
/// (Phase 3).
/// </summary>
/// <param name="Frequency">Wire token: <c>oneOff</c> or <c>recurringWeekly</c>.</param>
/// <param name="StartDate">First (or only) date.</param>
/// <param name="EndDate">Last date — mandatory when recurring (recurrence is always bounded).</param>
/// <param name="DayOfWeek">Wire token (<c>monday</c>…<c>sunday</c>) — required when recurring.</param>
/// <param name="StartTime">Venue-local start, <c>HH:mm</c> (24h).</param>
/// <param name="EndTime">Venue-local end, <c>HH:mm</c> (24h), after <paramref name="StartTime"/>.</param>
public record ScheduleDto(
    string Frequency,
    DateOnly StartDate,
    DateOnly? EndDate,
    string? DayOfWeek,
    string StartTime,
    string EndTime);

/// <summary>
/// <c>POST /api/v1/listings/{roomId}/applications</c> body (CONTRACTS §5): an intent-first
/// application — what will happen, for how many, when — sent to the room's venue for a decision.
/// </summary>
/// <param name="ActivityType">Single activity wire token (e.g. <c>children</c>).</param>
/// <param name="GroupSize">Expected number of people.</param>
/// <param name="Schedule">Proposed venue-local schedule.</param>
/// <param name="IntentText">The organizer's own words — the application's heart (≤2000 chars).</param>
/// <param name="TurnstileToken">Cloudflare Turnstile response token (required where enabled).</param>
public record SubmitApplicationRequest(
    string ActivityType,
    int GroupSize,
    ScheduleDto Schedule,
    string IntentText,
    string? TurnstileToken);

/// <summary>The applying organizer as shown to the provider.</summary>
public record OrganizerDto(Guid Id, string DisplayName, OrganizerRatingSummaryDto? RatingSummary);

/// <summary>Organizer reputation summary shown to venue managers once at least one rating is revealed.</summary>
public record OrganizerRatingSummaryDto(
    double AverageStars,
    int RatingCount,
    int NoShowCount,
    int CompletedBookings);

/// <summary>One message on the application's ask/answer thread.</summary>
public record ApplicationMessageDto(Guid Id, Guid SenderId, string Body, DateTimeOffset SentAtUtc);

/// <summary>
/// An application as both parties see it (CONTRACTS §5). List endpoints omit the message thread
/// (<see cref="Messages"/> empty, <see cref="MessageCount"/> populated); the detail endpoint
/// carries the full thread.
/// </summary>
public record ApplicationDto(
    Guid Id,
    Guid RoomId,
    string RoomName,
    string VenueName,
    string VenueSlug,
    string RoomSlug,
    OrganizerDto Organizer,
    string ActivityType,
    int GroupSize,
    ScheduleDto Schedule,
    string IntentText,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? DecidedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    Guid? BookingId,
    int MessageCount,
    IReadOnlyList<ApplicationMessageDto> Messages);

/// <summary>A page of applications (CONTRACTS §2 pagination envelope).</summary>
public record ApplicationListResult(
    IReadOnlyList<ApplicationDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary><c>POST /api/v1/applications/{id}/messages</c> body — one thread message.</summary>
public record ApplicationMessageRequest(string Body);

/// <summary>
/// <c>POST /api/v1/applications/{id}/decision</c> body (provider only).
/// </summary>
/// <param name="Decision">Wire token: <c>approve</c> or <c>decline</c>.</param>
/// <param name="Message">Optional note posted onto the thread with the decision.</param>
public record ApplicationDecisionRequest(string Decision, string? Message);

/// <summary>
/// A venue the caller manages (<c>GET /api/v1/manage/venues</c>, CONTRACTS §6). Deliberately
/// slim — enough for a provider surface to label itself and route; full CRUD arrives in Phase 5.
/// </summary>
public record ManagedVenueDto(Guid Id, string Name, string Slug);

// --- Manage (provider self-service CRUD, CONTRACTS §6 Phase 5) ---

/// <summary>A room summarized on the provider's venue-management screen.</summary>
public record ManagedRoomSummaryDto(
    Guid Id,
    string Name,
    string Slug,
    string Status,
    DateTimeOffset? PublishRequestedAtUtc,
    int Capacity,
    bool IsFree,
    decimal? PricePerHour,
    string Currency,
    string? PrimaryPhotoUrl,
    int PhotoCount,
    DateTimeOffset UpdatedAtUtc);

/// <summary>Full venue detail for the provider's manage screens, including its rooms.</summary>
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
    string VerificationStatus,
    DateTimeOffset? VerificationRequestedAtUtc,
    IReadOnlyList<ManagedRoomSummaryDto> Rooms);

/// <summary>Full room detail for the provider's manage screens.</summary>
public record ManagedRoomDto(
    Guid Id,
    Guid VenueId,
    string VenueName,
    string VenueSlug,
    string Name,
    string Slug,
    string Description,
    int Capacity,
    decimal? PricePerHour,
    string Currency,
    string HouseRules,
    string Status,
    DateTimeOffset? PublishRequestedAtUtc,
    DateTimeOffset? FirstPublishedAtUtc,
    IReadOnlyList<string> Activities,
    IReadOnlyList<string> Amenities,
    IReadOnlyList<string> Accessibility,
    IReadOnlyList<RoomPhotoDto> Photos,
    DateTimeOffset UpdatedAtUtc);

/// <summary><c>POST /api/v1/manage/venues</c> / <c>PATCH /api/v1/manage/venues/{id}</c> body.</summary>
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

/// <summary><c>POST /api/v1/manage/venues/{id}/verification</c> body.</summary>
public record SubmitVenueVerificationRequest(
    string? ContactName,
    string? ContactEmail,
    string? EvidenceSummary,
    bool AttestedAuthority,
    IReadOnlyList<VenueVerificationDocumentRequest>? Documents);

/// <summary><c>POST /api/v1/manage/venues/{venueId}/rooms</c> / <c>PATCH /api/v1/manage/rooms/{id}</c> body.</summary>
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

/// <summary><c>PATCH /api/v1/manage/photos/{id}</c> body.</summary>
public record UpdatePhotoRequest(string? Caption, bool? IsPrimary, int? SortOrder);

// --- Bookings (CONTRACTS §5) ---

/// <summary>
/// A booking as both parties see it (CONTRACTS §5). List endpoints omit the occurrence set
/// (<see cref="Occurrences"/> empty) but always carry <see cref="NextOccurrence"/>; the detail
/// endpoint carries every occurrence. Schedule fields are venue-local wall-clock; the venue's
/// IANA <see cref="VenueTimezone"/> travels with them (CONTRACTS §2 "Local times").
/// </summary>
public record BookingDto(
    Guid Id,
    Guid ApplicationId,
    Guid RoomId,
    string RoomName,
    string VenueName,
    string VenueSlug,
    string RoomSlug,
    string VenueTimezone,
    Guid OrganizerId,
    string OrganizerName,
    string Type,
    DateOnly StartDate,
    DateOnly EndDate,
    ScheduleDto Schedule,
    string Status,
    DateTimeOffset CreatedAtUtc,
    Guid? CancelledBy,
    DateTimeOffset? CancelledAtUtc,
    string? CancelReason,
    OccurrenceDto? NextOccurrence,
    IReadOnlyList<OccurrenceDto> Occurrences,
    BookingRatingsDto? Ratings);

/// <summary>Viewer-scoped rating state for a booking.</summary>
public record BookingRatingsDto(
    SubmittedRatingDto? ByOrganizer,
    SubmittedRatingDto? ByVenue,
    bool CanRate,
    DateTimeOffset? RateByUtc);

/// <summary>A submitted rating visible to the current caller.</summary>
public record SubmittedRatingDto(int Stars, string? Comment, DateTimeOffset CreatedAtUtc);

/// <summary>One materialized occurrence of a booking.</summary>
public record OccurrenceDto(
    Guid Id,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc,
    DateOnly LocalDate,
    string Status,
    Guid? NoShowMarkedBy);

/// <summary>A page of bookings (CONTRACTS §2 pagination envelope).</summary>
public record BookingListResult(
    IReadOnlyList<BookingDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary><c>POST /api/v1/bookings/{id}/cancel</c> body.</summary>
/// <param name="Reason">Optional reason shown to the other party (≤500 chars).</param>
public record CancelBookingRequest(string? Reason);

/// <summary><c>POST /api/v1/bookings/{id}/ratings</c> body.</summary>
public record SubmitRatingRequest(int Stars, string? Comment = null);

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
