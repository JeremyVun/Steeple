namespace Steeple.Api.Configuration;

/// <summary>Polling, lease, and bounded-retry settings for durable notification delivery.</summary>
public sealed class NotificationOutboxOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "NotificationOutbox";

    /// <summary>Whether the delivery worker runs. Enqueueing remains active when disabled.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Delay between bounded polling passes.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Maximum rows leased by one worker scope/pass.</summary>
    public int BatchSize { get; set; } = 50;

    /// <summary>Total provider attempts before a row becomes terminal.</summary>
    public int MaxAttempts { get; set; } = 5;

    /// <summary>Delay after the first provider failure; later failures back off exponentially.</summary>
    public TimeSpan BaseRetryDelay { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>Upper bound on exponential retry delay.</summary>
    public TimeSpan MaxRetryDelay { get; set; } = TimeSpan.FromHours(1);

    /// <summary>
    /// Time before claimed-but-unstamped work becomes eligible again after process loss. This must
    /// exceed provider timeouts; duplicate delivery remains possible at the provider/stamp seam.
    /// </summary>
    public TimeSpan ClaimLease { get; set; } = TimeSpan.FromMinutes(2);
}
