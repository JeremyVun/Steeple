using System.Text.Json;

namespace Steeple.Web.Services;
/// <summary>
/// Web-surface analytics events (funnel steps only the BFF can see, e.g. the apply form opening
/// or the SSO gate firing). Emits the same one-line <c>analytics_event</c> log shape as the API's
/// <c>StdoutLogAnalyticsSink</c>, so the deployed Promtail → Loki pipeline picks both up the same
/// way; only the category differs. Client-side batching + <c>POST /api/v1/events</c> replaces the
/// interaction-event half of this when the Ingest module lands (CONTRACTS §7).
/// </summary>
public interface IWebAnalytics
{
    /// <summary>Records one event, best-effort (never throws).</summary>
    void Track(string eventType, object? payload = null, string? sessionId = null);
}

/// <summary>Default <see cref="IWebAnalytics"/> over <see cref="ILogger"/> (stdout → Promtail → Loki).</summary>
public sealed class WebAnalytics : IWebAnalytics
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ILogger<WebAnalytics> _logger;

    /// <summary>Creates the sink over the given logger.</summary>
    public WebAnalytics(ILogger<WebAnalytics> logger) => _logger = logger;

    /// <inheritdoc />
    public void Track(string eventType, object? payload = null, string? sessionId = null)
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
        catch
        {
            // Best-effort: analytics must never break a page.
        }
    }
}
