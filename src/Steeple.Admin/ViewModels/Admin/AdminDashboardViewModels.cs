namespace Steeple.Admin.ViewModels.Admin;

public sealed record AdminShellViewModel(
    string ActiveSection,
    IReadOnlyList<AdminMetric> Metrics,
    IReadOnlyList<AdminActivity> Activity);

public sealed record AdminMetric(string Label, string Value, string Detail, string Tone);

public sealed record AdminActivity(DateTimeOffset At, string Actor, string Event, string Detail);

public sealed record AdminUserRow(
    Guid Id,
    string Name,
    string Email,
    string Role,
    string TrustLevel,
    string Status,
    int Bookings,
    DateTimeOffset LastSeenAt);

public sealed record AdminListingRow(
    Guid Id,
    string Venue,
    string Room,
    string Suburb,
    int Capacity,
    string Status,
    string Price,
    int PendingApplications,
    int ActiveBookings);

public sealed record AdminBookingRow(
    Guid Id,
    string Listing,
    string Organizer,
    string When,
    string Status,
    string Intent);

public sealed record AdminApplicationRow(
    Guid Id,
    string Venue,
    string Room,
    string Organizer,
    string Activity,
    int GroupSize,
    string When,
    string Status,
    int Messages,
    DateTimeOffset CreatedAt);

/// <summary>A room awaiting the founder's publish decision (Phase 5 moderation gate).</summary>
public sealed record AdminPublishRequestRow(
    Guid RoomId,
    string Venue,
    string Room,
    string Suburb,
    int Capacity,
    string Price,
    int PhotoCount,
    DateTimeOffset RequestedAt,
    string Description,
    IReadOnlyList<string> PhotoThumbUrls);

/// <summary>A live listing (room) or venue edited by its provider since the last operator review.</summary>
public sealed record AdminEditedListingRow(
    Guid Id,
    bool IsVenue,
    string Venue,
    string? Room,
    DateTimeOffset EditedAt);

public sealed record AdminModerationViewModel(
    IReadOnlyList<AdminPublishRequestRow> PublishRequests,
    IReadOnlyList<AdminEditedListingRow> EditedListings);

public sealed record AdminVenueManagerRow(
    Guid Id,
    string Venue,
    string UserName,
    string UserEmail,
    DateTimeOffset CreatedAt);

public sealed record AdminVenueOption(Guid Id, string Name);

public sealed record AdminAnalyticsRow(
    DateTimeOffset At,
    string Event,
    string Surface,
    string Subject,
    string Properties);

public sealed record AdminFeatureFlagRow(
    string Key,
    string Description,
    bool Enabled,
    bool IsPublic,
    string Audience,
    DateTimeOffset UpdatedAt);

public sealed record AdminAccountViewModel(
    string Username,
    bool MfaEnabled,
    IReadOnlyList<AdminTrustedDeviceRow> TrustedDevices,
    IReadOnlyList<AdminActivity> RecentActivity);

public sealed record AdminTrustedDeviceRow(
    Guid Id,
    string Browser,
    string SourceIp,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastSeenAt,
    DateTimeOffset ExpiresAt,
    bool IsCurrent);

public sealed record AdminWorkspaceViewModel(
    AdminShellViewModel Shell,
    IReadOnlyList<AdminUserRow> Users,
    IReadOnlyList<AdminListingRow> Listings,
    IReadOnlyList<AdminBookingRow> Bookings,
    IReadOnlyList<AdminApplicationRow> Applications,
    AdminModerationViewModel Moderation,
    IReadOnlyList<AdminVenueManagerRow> VenueManagers,
    IReadOnlyList<AdminVenueOption> VenueOptions,
    IReadOnlyList<AdminAnalyticsRow> Analytics,
    IReadOnlyList<AdminFeatureFlagRow> FeatureFlags,
    AdminAccountViewModel Account);
