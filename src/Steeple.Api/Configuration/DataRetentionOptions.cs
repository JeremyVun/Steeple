namespace Steeple.Api.Configuration;

/// <summary>Bounded background deletion settings for each approved retention class.</summary>
public sealed class DataRetentionOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "DataRetention";

    /// <summary>Whether the scheduled worker runs. The scoped sweep remains directly resolvable.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Delay between bounded passes.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromDays(1);

    /// <summary>Maximum rows handled for any one retention class in one pass.</summary>
    public int BatchSize { get; set; } = 500;

    /// <summary>Time terminal refresh-token rows remain after revocation or expiry.</summary>
    public TimeSpan RefreshTokenRetention { get; set; } = TimeSpan.FromDays(30);

    /// <summary>Time inbox notifications remain after creation.</summary>
    public TimeSpan NotificationRetention { get; set; } = TimeSpan.FromDays(365);

    /// <summary>Time spent idempotency keys remain replayable.</summary>
    public TimeSpan IdempotencyRetention { get; set; } = TimeSpan.FromDays(30);

    /// <summary>Time private user-authored correspondence remains after closure.</summary>
    public TimeSpan CorrespondenceRetention { get; set; } = TimeSpan.FromDays(730);

    /// <summary>Time delivered or terminally failed outbox rows remain after their terminal stamp.</summary>
    public TimeSpan NotificationOutboxRetention { get; set; } = TimeSpan.FromDays(30);
}
