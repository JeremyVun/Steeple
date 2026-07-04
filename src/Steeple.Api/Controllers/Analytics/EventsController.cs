using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Analytics;
using Steeple.Api.Services.Analytics;

namespace Steeple.Api.Controllers.Analytics;
/// <summary>
/// Client-sourced analytics ingest (CONTRACTS §7). Anonymous — the funnel events it carries
/// (map interactions, apply/SSO started, notification opened) happen before or without sign-in —
/// but a valid bearer token still enriches the batch with <c>userId</c>. Always answers 202: the
/// service drops anything invalid silently and never throws.
/// </summary>
[ApiController]
[Route("api/v1/events")]
[EnableRateLimiting(RateLimitPolicies.Events)]
public sealed class EventsController : ControllerBase
{
    /// <summary>Defensive cap on the request body — well above any legitimate ≤50-event batch.</summary>
    private const long MaxBodyBytes = 64 * 1024;

    private readonly IEventIngestService _ingest;

    public EventsController(IEventIngestService ingest) => _ingest = ingest;

    /// <summary>Accepts a batch of client events for fire-and-forget ingest.</summary>
    [HttpPost]
    [RequestSizeLimit(MaxBodyBytes)]
    public IActionResult Ingest([FromBody] IngestEventsRequest request)
    {
        var userId = User.Identity?.IsAuthenticated == true ? User.GetUserId() : (Guid?)null;

        // Deliberately not awaited: ingest validates/enriches/emits on its own time, and the
        // caller always gets 202 immediately (CONTRACTS §7). CancellationToken.None so an
        // aborted request doesn't cancel a batch already decided on.
        _ = _ingest.IngestAsync(request, userId, Request.Headers.UserAgent.ToString(), CancellationToken.None);

        return Accepted();
    }
}
