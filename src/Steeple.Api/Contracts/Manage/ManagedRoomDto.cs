namespace Steeple.Api.Contracts.Manage;
/// <summary>
/// A room as its venue's manager sees it (CONTRACTS §6). Unlike the public detail shape this
/// carries the moderation state; <c>Status</c> uses the manage-only token set
/// <c>draft | published | unlisted</c>.
/// </summary>
public record ManagedRoomDto(
    Guid Id,
    Guid VenueId,
    string VenueName,
    string VenueSlug,
    string Name,
    string Slug,
    string Description,
    int Capacity,
    decimal PricePerHour,
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

/// <summary>A room row inside <see cref="ManagedVenueDetailDto"/> — enough for the listings editor's list.</summary>
public record ManagedRoomSummaryDto(
    Guid Id,
    string Name,
    string Slug,
    string Status,
    DateTimeOffset? PublishRequestedAtUtc,
    int Capacity,
    decimal PricePerHour,
    string Currency,
    string? PrimaryPhotoUrl,
    int PhotoCount,
    DateTimeOffset UpdatedAtUtc);
