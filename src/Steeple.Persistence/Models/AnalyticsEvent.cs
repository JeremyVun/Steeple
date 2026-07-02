namespace Steeple.Persistence.Models;
/// <summary>
/// A lightweight analytics event persisted to Postgres (per the PRD's "events logged to Postgres" model).
/// </summary>
public class AnalyticsEvent
{
    /// <summary>Auto-increment primary key.</summary>
    public long Id { get; set; }

    /// <summary>Event type / name (e.g. "search", "listing_view").</summary>
    public string EventType { get; set; } = "";

    /// <summary>When the event occurred (UTC).</summary>
    public DateTimeOffset OccurredAtUtc { get; set; }

    /// <summary>Optional opaque session identifier for correlation.</summary>
    public string? SessionId { get; set; }

    /// <summary>Optional JSON-serialised event payload.</summary>
    public string? PayloadJson { get; set; }
}
