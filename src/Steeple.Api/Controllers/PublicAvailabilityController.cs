using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Applications;
using Steeple.Api.Contracts.Availability;

namespace Steeple.Api.Controllers;
/// <summary>
/// Anonymous guest availability reads for a listing (CONTRACTS §6 "Guest availability reads"): the
/// per-day free-window calendar feed and the advisory schedule dry-run. Both sit behind the per-IP
/// <c>availability</c> rate-limit policy and the <c>listing.availability</c> feature flag — with the
/// flag off, both endpoints 404, indistinguishable from an unknown room (no existence leak, the same
/// stance as every public listing read). Analytics are emitted here so the submit-time reuse of the
/// same service math never double-counts <c>availability_checked</c>.
/// </summary>
/// <remarks><see cref="ApiControllerAttribute"/> lets bare <c>NotFound()</c> results become
/// ProblemDetails via <c>UseStatusCodePages()</c> (see <see cref="ListingsApiController"/>).</remarks>
[ApiController]
[Route("api/v1")]
public sealed class PublicAvailabilityController : ControllerBase
{
    /// <summary>Feature flag gating the whole guest availability surface (off → 404).</summary>
    private const string AvailabilityFlag = "listing.availability";

    private readonly IAvailabilityService _availability;
    private readonly IFeatureFlags _flags;
    private readonly IAnalyticsSink _analytics;

    /// <summary>Creates the controller over the availability use-cases, flags, and analytics sink.</summary>
    public PublicAvailabilityController(IAvailabilityService availability, IFeatureFlags flags, IAnalyticsSink analytics)
    {
        _availability = availability;
        _flags = flags;
        _analytics = analytics;
    }

    /// <summary>The guest calendar feed: per-day free windows over <c>[from, to]</c> (venue-local dates).</summary>
    [HttpGet("listings/{roomId:guid}/availability")]
    [EnableRateLimiting(RateLimitPolicies.Availability)]
    public async Task<ActionResult<RoomAvailabilityDto>> Get(
        Guid roomId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        if (!_flags.IsEnabled(AvailabilityFlag))
        {
            return NotFound();
        }

        var result = await _availability.GetPublicAvailabilityAsync(roomId, from, to, ct);
        if (result.Value is { } dto)
        {
            await TrackSafelyAsync("availability_viewed", new { roomId, dayCount = dto.Days.Count }, ct);
            return Ok(dto);
        }

        return result.IsNotFound ? NotFound() : ToProblem(result.ErrorCode!, result.ErrorDetail!);
    }

    /// <summary>Advisory dry-run of a proposed schedule against the room's rules and confirmed bookings.</summary>
    [HttpPost("listings/{roomId:guid}/availability/check")]
    [EnableRateLimiting(RateLimitPolicies.Availability)]
    public async Task<ActionResult<ScheduleCheckResultDto>> Check(
        Guid roomId, [FromBody] CheckScheduleRequest request, CancellationToken ct)
    {
        if (!_flags.IsEnabled(AvailabilityFlag))
        {
            return NotFound();
        }

        var result = await _availability.CheckScheduleAsync(roomId, request?.Schedule, ct);
        if (result.Value is { } dto)
        {
            await TrackSafelyAsync(
                "availability_checked", new { roomId, available = dto.Available, conflictCount = dto.Conflicts.Count }, ct);
            return Ok(dto);
        }

        return result.IsNotFound ? NotFound() : ToProblem(result.ErrorCode!, result.ErrorDetail!);
    }

    /// <summary>Maps an availability validation error onto the RFC 9457 envelope (400 + <c>code</c>).</summary>
    private ObjectResult ToProblem(string code, string detail) =>
        Problem(detail: detail, statusCode: StatusCodes.Status400BadRequest, extensions: new Dictionary<string, object?>
        {
            ["code"] = code,
        });

    /// <summary>Best-effort analytics — never a reason to fail the read.</summary>
    private async Task TrackSafelyAsync(string eventType, object payload, CancellationToken ct)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload, sessionId: null, ct);
        }
        catch
        {
            // Best-effort: analytics must never fail the request.
        }
    }
}
