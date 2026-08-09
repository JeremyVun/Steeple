namespace Steeple.Api.Contracts.Manage;

/// <summary>Stable wire states for a managed venue's verification posture.</summary>
public static class VenueVerificationTokens
{
    public const string Unverified = "unverified";
    public const string Pending = "pending";
    public const string Declined = "declined";
    public const string Verified = "verified";

    public static readonly IReadOnlyList<string> All =
    [
        Unverified,
        Pending,
        Declined,
        Verified,
    ];
}
