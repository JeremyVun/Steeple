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
    IReadOnlyList<AdminAnalyticsRow> Analytics,
    IReadOnlyList<AdminFeatureFlagRow> FeatureFlags,
    AdminAccountViewModel Account);
