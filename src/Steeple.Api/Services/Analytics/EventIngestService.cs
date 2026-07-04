using System.Text;
using System.Text.Json;
using Steeple.Api.Contracts.Analytics;

namespace Steeple.Api.Services.Analytics;
/// <summary>
/// Default <see cref="IEventIngestService"/>. Drop rules (CONTRACTS §7 — all silent, no error
/// ever reaches the client): unknown event names, batches over <see cref="MaxBatchSize"/> events,
/// names over <see cref="MaxNameLength"/> chars, and events whose <c>props</c> serialize to more
/// than <see cref="MaxPropsBytes"/> bytes.
/// </summary>
public sealed class EventIngestService : IEventIngestService
{
    /// <summary>
    /// The only event names a client may submit — the CONTRACTS §7 taxonomy rows sourced from the
    /// client. Every server-authoritative event (search_performed, application_submitted, etc.) is
    /// emitted server-side only and must never be accepted here.
    /// </summary>
    public static readonly IReadOnlyCollection<string> AllowedEventNames = new HashSet<string>(StringComparer.Ordinal)
    {
        "map_interacted",
        "application_started",
        "sso_started",
        "notification_opened",
    };

    private const int MaxBatchSize = 50;
    private const int MaxNameLength = 64;
    private const int MaxPropsBytes = 2048;

    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly ILogger<EventIngestService> _logger;

    /// <summary>Creates the service over its sink port and clock.</summary>
    public EventIngestService(IAnalyticsSink analytics, TimeProvider clock, ILogger<EventIngestService> logger)
    {
        _analytics = analytics;
        _clock = clock;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task IngestAsync(IngestEventsRequest? request, Guid? userId, string? userAgent, CancellationToken ct = default)
    {
        try
        {
            var events = request?.Events;
            if (events is null || events.Count == 0 || events.Count > MaxBatchSize)
            {
                return;
            }

            var receivedAt = _clock.GetUtcNow();
            var uaClass = ClassifyUserAgent(userAgent);

            foreach (var item in events)
            {
                if (!IsAcceptable(item))
                {
                    continue;
                }

                var enriched = BuildEnrichedProps(item.Props, userId, uaClass, request!.SessionId, item.OccurredAt, receivedAt);

                try
                {
                    await _analytics.TrackAsync(item.Name!, enriched, request.SessionId, ct).ConfigureAwait(false);
                }
                catch
                {
                    // Best-effort: one bad sink write must not sink the rest of the batch.
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Analytics ingest failed for a batch.");
        }
    }

    private static bool IsAcceptable(IngestEventItem item)
    {
        if (string.IsNullOrEmpty(item.Name)
            || item.Name.Length > MaxNameLength
            || !AllowedEventNames.Contains(item.Name))
        {
            return false;
        }

        return !item.Props.HasValue
            || Encoding.UTF8.GetByteCount(item.Props.Value.GetRawText()) <= MaxPropsBytes;
    }

    private static Dictionary<string, object?> BuildEnrichedProps(
        JsonElement? clientProps, Guid? userId, string uaClass, string? sessionId, DateTimeOffset? occurredAt, DateTimeOffset receivedAt)
    {
        var result = new Dictionary<string, object?>();

        if (clientProps.HasValue && clientProps.Value.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in clientProps.Value.EnumerateObject())
            {
                result[prop.Name] = prop.Value;
            }
        }

        result["userId"] = userId;
        result["uaClass"] = uaClass;
        result["sessionId"] = sessionId;
        result["occurredAt"] = occurredAt;
        result["receivedAt"] = receivedAt;
        return result;
    }

    /// <summary>Cheap User-Agent sniff (no package): a handful of substring checks, defaulting to desktop.</summary>
    private static string ClassifyUserAgent(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent))
        {
            return "desktop";
        }

        var ua = userAgent.ToLowerInvariant();
        if (ua.Contains("bot") || ua.Contains("spider") || ua.Contains("crawl")
            || ua.Contains("curl") || ua.Contains("wget") || ua.Contains("headless"))
        {
            return "bot";
        }

        if (ua.Contains("mobi") || ua.Contains("android") || ua.Contains("iphone") || ua.Contains("ipad"))
        {
            return "mobile";
        }

        return "desktop";
    }
}
