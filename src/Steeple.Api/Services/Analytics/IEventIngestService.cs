using Steeple.Api.Contracts.Analytics;

namespace Steeple.Api.Services.Analytics;
/// <summary>
/// Use-case for <c>POST /api/v1/events</c> (CONTRACTS §7): validates/drops the client-sourced
/// batch, enriches each accepted event (userId if authed, UA class, session, timestamps), and
/// fans it out through <see cref="IAnalyticsSink"/> — one <c>TrackAsync</c> call per event. Never
/// throws: the endpoint always answers 202 regardless of what this does.
/// </summary>
public interface IEventIngestService
{
    /// <summary>Validates, enriches, and emits every acceptable event in the batch.</summary>
    Task IngestAsync(IngestEventsRequest? request, Guid? userId, string? userAgent, CancellationToken ct = default);
}
