namespace Steeple.Api.Services.Flags;

/// <summary>
/// Every feature-flag name read by the API. The golden wire-token contract keeps this registry,
/// the public client allowlist, and each client mirror aligned with
/// <c>tests/fixtures/wire-tokens.json</c>.
/// </summary>
public static class FeatureFlagKeys
{
    public const string ListingAvailability = "listing.availability";
    public const string ManageFirstListingReviewRequired = "manage.first_listing_review_required";
    public const string ManageOpenHoursRequired = "manage.open_hours_required";
    public const string BookingCounterOffers = "booking.counter_offers";
    public const string PaymentsEnabled = "payments.enabled";
    public const string MobileApplyEnabled = "mobile.apply_enabled";
    public const string MobileManageEnabled = "mobile.manage_enabled";
    public const string MobileForceUpgrade = "mobile.force_upgrade";

    public static readonly IReadOnlyList<string> All =
    [
        ListingAvailability,
        ManageFirstListingReviewRequired,
        ManageOpenHoursRequired,
        BookingCounterOffers,
        PaymentsEnabled,
        MobileApplyEnabled,
        MobileManageEnabled,
        MobileForceUpgrade,
    ];

    public static readonly IReadOnlyList<string> Public =
    [
        PaymentsEnabled,
        MobileApplyEnabled,
        MobileManageEnabled,
        MobileForceUpgrade,
    ];
}
