namespace Steeple.Api.Contracts;
/// <summary>
/// A room projected as a search-result card.
/// </summary>
/// <param name="RoomId">Room identifier.</param>
/// <param name="VenueId">Owning venue identifier.</param>
/// <param name="RoomSlug">URL-friendly room identifier.</param>
/// <param name="VenueSlug">URL-friendly venue identifier.</param>
/// <param name="VenueName">Owning venue name.</param>
/// <param name="Suburb">Venue suburb, for card display.</param>
/// <param name="RoomName">Room display name.</param>
/// <param name="PrimaryPhotoUrl">URL of the primary photo, if any.</param>
/// <param name="Capacity">Maximum occupancy.</param>
/// <param name="PricePerHour">Hourly price (always positive).</param>
/// <param name="Currency">ISO currency code for the price.</param>
/// <param name="Latitude">Latitude in decimal degrees.</param>
/// <param name="Longitude">Longitude in decimal degrees.</param>
/// <param name="Activities">Accepted activity types as string tokens.</param>
/// <param name="Accessibility">Accessibility features as string tokens.</param>
/// <param name="DistanceMeters">Distance from the search center in metres, if computed.</param>
/// <param name="Rating">Venue-level visible star-rating aggregate, if any ratings are revealed.</param>
/// <param name="MatchedWindow">The free window that satisfied a time-first ("When") search; present
/// only on searches with a When filter (CONTRACTS §3), null otherwise.</param>
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
    decimal PricePerHour,
    string Currency,
    double Latitude,
    double Longitude,
    IReadOnlyList<string> Activities,
    IReadOnlyList<string> Accessibility,
    double? DistanceMeters,
    RatingSummaryDto? Rating,
    MatchedWindowDto? MatchedWindow = null);
