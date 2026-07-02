namespace Steeple.Api.Proxies;
/// <summary>
/// Port for recording analytics events. The Infrastructure adapter persists them to Postgres.
/// </summary>
public interface IAnalyticsSink
{
    /// <summary>
    /// Records an analytics event.
    /// </summary>
    /// <param name="eventType">Event type / name (e.g. "search", "listing_view").</param>
    /// <param name="payload">Optional payload, serialised by the adapter.</param>
    /// <param name="sessionId">Optional opaque session identifier for correlation.</param>
    /// <param name="ct">Cancellation token.</param>
    Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default);
}
