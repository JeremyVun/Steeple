namespace Steeple.Api.Contracts;
/// <summary>
/// Full room detail for the listing detail page, including its venue.
/// </summary>
/// <param name="RoomId">Room identifier.</param>
/// <param name="RoomSlug">URL-friendly room identifier.</param>
/// <param name="RoomName">Room display name.</param>
/// <param name="Description">Free-text room description.</param>
/// <param name="Capacity">Maximum occupancy.</param>
/// <param name="PricePerHour">Hourly price (always positive).</param>
/// <param name="Currency">ISO currency code for the price.</param>
/// <param name="HouseRules">House rules and usage conditions.</param>
/// <param name="Amenities">Amenities as string tokens.</param>
/// <param name="Accessibility">Accessibility features as string tokens.</param>
/// <param name="Activities">Accepted activity types as string tokens.</param>
/// <param name="Photos">Room photos.</param>
/// <param name="Venue">The owning venue.</param>
/// <param name="Rating">Venue-level visible star-rating aggregate, if any ratings are revealed.</param>
/// <param name="OpenHours">
/// The room's weekly open windows (all seven days, Sunday-first; closed days have empty windows),
/// in venue-local wall-clock. Null for pre-gate legacy rooms with no declared hours.
/// </param>
public record RoomDetailDto(
    Guid RoomId,
    string RoomSlug,
    string RoomName,
    string Description,
    int Capacity,
    decimal PricePerHour,
    string Currency,
    string HouseRules,
    IReadOnlyList<string> Amenities,
    IReadOnlyList<string> Accessibility,
    IReadOnlyList<string> Activities,
    IReadOnlyList<RoomPhotoDto> Photos,
    VenueSummaryDto Venue,
    RatingSummaryDto? Rating,
    IReadOnlyList<DayOpenHoursDto>? OpenHours = null);
