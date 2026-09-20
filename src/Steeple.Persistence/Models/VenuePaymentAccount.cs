
namespace Steeple.Persistence.Models;
/// <summary>
/// Payout-side onboarding state for a venue (docs/contracts/payments.md). One row per venue that
/// started payout onboarding; the provider (mock today, Stripe Connect later) owns KYC and the
/// money — this row only mirrors readiness plus the host's explicit opt-in.
/// </summary>
public class VenuePaymentAccount
{
    /// <summary>Primary key and FK — one account per venue.</summary>
    public Guid VenueId { get; set; }

    /// <summary>The provider's connected-account id (mock: <c>acct_mock_…</c>; Stripe: <c>acct_…</c>).</summary>
    public string? ProviderAccountId { get; set; }

    /// <summary>Stable identity used to recover an ambiguous provider-side create.</summary>
    public Guid ProvisioningKey { get; set; }

    /// <summary>Provider that owns this row's account identity.</summary>
    public string Provider { get; set; } = "mock";

    /// <summary>Whether the host completed the provider's onboarding form.</summary>
    public bool DetailsSubmitted { get; set; }

    /// <summary>Whether the provider will accept charges destined for this account.</summary>
    public bool ChargesEnabled { get; set; }

    /// <summary>Whether the provider will pay out to the venue's bank.</summary>
    public bool PayoutsEnabled { get; set; }

    /// <summary>Provider requirements currently blocking or awaiting completion.</summary>
    public string[] RequirementsDue { get; set; } = [];

    /// <summary>Provider reason that account capabilities are disabled, when present.</summary>
    public string? DisabledReason { get; set; }

    /// <summary>When the host explicitly opted the venue into in-app payments; null = not opted in.</summary>
    public DateTimeOffset? OptedInAtUtc { get; set; }

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Last state-change timestamp (UTC).</summary>
    public DateTimeOffset UpdatedAtUtc { get; set; }

    /// <summary>Navigation to the venue.</summary>
    public Venue? Venue { get; set; }
}
