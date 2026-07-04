using System.Text.Json;

namespace Steeple.Api.Proxies;
/// <summary>
/// Writes analytics events to stdout as a single structured log line via <see cref="ILogger"/>.
/// Per <c>docs/ANALYTICS.md</c>, the deployed container's stdout is tailed by Promtail and shipped
/// to Loki, so this adapter has no runtime coupling to the analytics backend — a Loki outage never
/// touches a request. Tracking is best-effort: failures are swallowed (falling back to a warning
/// log where possible) so analytics never breaks the request path.
/// </summary>
/// <remarks>
/// <para>
/// Log shape: every event logs at Information under the dedicated category
/// <c>Steeple.Api.Proxies.StdoutLogAnalyticsSink</c> (nothing else logs under this category, so
/// filtering by category alone isolates the analytics stream) using the message template
/// <c>analytics_event {EventType} {OccurredAtUtc} {SessionId} {PayloadJson}</c>. In Production the
/// JSON console formatter (see <c>Program.cs</c>) turns each line into one JSON object whose
/// <c>State</c> object carries those four properties by name.
/// </para>
/// <para>
/// Example LogQL: <c>{container="steeple-api"} | json | Category = "Steeple.Api.Proxies.StdoutLogAnalyticsSink" | State_EventType = "search_performed"</c>.
/// </para>
/// </remarks>
public class StdoutLogAnalyticsSink : IAnalyticsSink
{
    private readonly ILogger<StdoutLogAnalyticsSink> _logger;

    /// <summary>Creates the sink over the given logger.</summary>
    public StdoutLogAnalyticsSink(ILogger<StdoutLogAnalyticsSink> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc />
    public Task TrackAsync(
        string eventType,
        object? payload = null,
        string? sessionId = null,
        CancellationToken ct = default)
    {
        try
        {
            var payloadJson = payload is null ? null : JsonSerializer.Serialize(payload, JsonOptions);

            _logger.LogInformation(
                "analytics_event {EventType} {OccurredAtUtc} {SessionId} {PayloadJson}",
                eventType,
                DateTimeOffset.UtcNow,
                sessionId,
                payloadJson);
        }
        catch (Exception ex)
        {
            // Best-effort: never let analytics failures surface to the caller.
            try
            {
                _logger.LogWarning(ex, "Failed to record analytics event {EventType}.", eventType);
            }
            catch
            {
                // Even logging the failure failed (e.g. logger disposed mid-shutdown) — swallow.
            }
        }

        return Task.CompletedTask;
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}
