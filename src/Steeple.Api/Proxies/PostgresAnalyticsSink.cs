using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Steeple.Api.Proxies;
/// <summary>
/// Persists analytics events to Postgres via <see cref="SteepleDbContext"/>.
/// Tracking is best-effort: failures are logged and swallowed so analytics never
/// breaks the request path.
/// </summary>
public class PostgresAnalyticsSink : IAnalyticsSink
{
    private readonly SteepleDbContext _db;
    private readonly ILogger<PostgresAnalyticsSink> _logger;

    /// <summary>Creates the sink over the scoped context.</summary>
    public PostgresAnalyticsSink(SteepleDbContext db, ILogger<PostgresAnalyticsSink> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task TrackAsync(
        string eventType,
        object? payload = null,
        string? sessionId = null,
        CancellationToken ct = default)
    {
        try
        {
            var payloadJson = payload is null ? null : JsonSerializer.Serialize(payload);

            _db.AnalyticsEvents.Add(new AnalyticsEvent
            {
                EventType = eventType,
                OccurredAtUtc = DateTimeOffset.UtcNow,
                SessionId = sessionId,
                PayloadJson = payloadJson,
            });

            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Best-effort: never let analytics failures surface to the caller.
            _logger.LogWarning(ex, "Failed to record analytics event {EventType}.", eventType);
        }
    }
}
