namespace Steeple.Api.Services.Retention;

/// <summary>Runs one bounded pass across every approved data-retention class.</summary>
public interface IDataRetentionService
{
    /// <summary>Deletes or redacts rows older than their configured cutoffs.</summary>
    Task<DataRetentionSweepResult> RunOnceAsync(DateTimeOffset now, CancellationToken ct = default);
}

/// <summary>Per-class row counts from one retention pass.</summary>
public sealed record DataRetentionSweepResult(
    int RefreshTokens,
    int Notifications,
    int IdempotencyRecords,
    int Correspondence,
    int NotificationOutbox)
{
    /// <summary>Total rows deleted or redacted in the pass.</summary>
    public int Total => RefreshTokens + Notifications + IdempotencyRecords + Correspondence + NotificationOutbox;
}
