
namespace Steeple.Api.Configuration;
/// <summary>
/// Payments module config (docs/contracts/payments.md). The behavioral switch is the
/// <c>payments.enabled</c> feature flag, not this section — these are the tuning knobs the
/// sweeper and charge planner read (intervals configurable so tests can shrink them).
/// </summary>
public sealed class PaymentsOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Payments";

    /// <summary>The client-side key for the payment form (mock placeholder until Stripe).</summary>
    public string PublishableKey { get; set; } = "pk_mock_steeple";

    /// <summary>How often the <see cref="Services.Payments.PaymentSweeper"/> wakes (payments.md §5).</summary>
    public double SweepIntervalSeconds { get; set; } = 300;

    /// <summary>Minimum age of a failed attempt before the sweeper retries the charge.</summary>
    public double RetryIntervalSeconds { get; set; } = 3600;

    /// <summary>An occurrence enters the charge window this many hours before its start.</summary>
    public double ChargeWindowHours { get; set; } = 48;

    /// <summary>Still unpaid this many hours before start → the occurrence auto-cancels.</summary>
    public double CancelDeadlineHours { get; set; } = 24;
}
