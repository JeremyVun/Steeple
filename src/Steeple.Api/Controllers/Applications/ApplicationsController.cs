using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Applications;
using Steeple.Api.Services.Applications;

namespace Steeple.Api.Controllers.Applications;
/// <summary>
/// The apply → ask → decide loop (CONTRACTS §5): submission, both parties' inboxes, the thread,
/// the provider decision, and withdrawal. All endpoints are authenticated; the writable ones sit
/// behind the per-account/per-IP rate limiter, and submit additionally behind Turnstile (inside
/// the service).
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1")]
public sealed class ApplicationsController : ControllerBase
{
    /// <summary>The Idempotency-Key request header (CONTRACTS §2).</summary>
    private const string IdempotencyKeyHeader = "Idempotency-Key";

    private readonly IApplicationService _applications;

    public ApplicationsController(IApplicationService applications) => _applications = applications;

    /// <summary>Submits an application for a room. Replays with the same Idempotency-Key return the original.</summary>
    [HttpPost("listings/{roomId:guid}/applications")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<ActionResult<ApplicationDto>> Submit(
        Guid roomId, [FromBody] SubmitApplicationRequest request, CancellationToken ct)
    {
        Guid? idempotencyKey = Request.Headers.TryGetValue(IdempotencyKeyHeader, out var raw)
            && Guid.TryParse(raw.ToString(), out var parsed) ? parsed : null;

        var result = await _applications.SubmitAsync(
            roomId, User.GetUserId(), request, idempotencyKey, HttpContext.Connection.RemoteIpAddress?.ToString(), ct);

        if (result.Error is not null)
        {
            return ToProblem(result.Error);
        }

        var outcome = result.Value!;
        return outcome.Created
            ? CreatedAtAction(nameof(Get), new { id = outcome.Application.Id }, outcome.Application)
            : Ok(outcome.Application);
    }

    /// <summary>The organizer's applications, newest first (<c>?status=</c> filters by wire token).</summary>
    [HttpGet("me/applications")]
    public async Task<ActionResult<ApplicationListResult>> Mine(
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken ct = default)
    {
        var result = await _applications.GetForOrganizerAsync(User.GetUserId(), status, page, pageSize, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>The provider inbox: applications for every venue the caller manages.</summary>
    [HttpGet("manage/applications")]
    public async Task<ActionResult<ApplicationListResult>> Manage(
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken ct = default)
    {
        var result = await _applications.GetForManagerAsync(User.GetUserId(), status, page, pageSize, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Full application incl. the thread. Party-scoped — anyone else 404s.</summary>
    [HttpGet("applications/{id:guid}")]
    public async Task<ActionResult<ApplicationDto>> Get(Guid id, CancellationToken ct)
    {
        var result = await _applications.GetAsync(id, User.GetUserId(), ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Posts a thread message (either party, while undecided).</summary>
    [HttpPost("applications/{id:guid}/messages")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<ActionResult<ApplicationDto>> AddMessage(
        Guid id, [FromBody] ApplicationMessageRequest request, CancellationToken ct)
    {
        var result = await _applications.AddMessageAsync(id, User.GetUserId(), request, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Approves or declines (venue managers only).</summary>
    [HttpPost("applications/{id:guid}/decision")]
    public async Task<ActionResult<ApplicationDto>> Decide(
        Guid id, [FromBody] ApplicationDecisionRequest request, CancellationToken ct)
    {
        var result = await _applications.DecideAsync(id, User.GetUserId(), request, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Withdraws the application (organizer only).</summary>
    [HttpPost("applications/{id:guid}/withdraw")]
    public async Task<ActionResult<ApplicationDto>> Withdraw(Guid id, CancellationToken ct)
    {
        var result = await _applications.WithdrawAsync(id, User.GetUserId(), ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Proposes a counter-offer schedule (venue managers only; behind <c>booking.counter_offers</c>).</summary>
    [HttpPost("applications/{id:guid}/counter-offer")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<ActionResult<ApplicationDto>> CounterOffer(
        Guid id, [FromBody] CounterOfferRequest request, CancellationToken ct)
    {
        var result = await _applications.CounterOfferAsync(id, User.GetUserId(), request, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Accepts or declines the open counter-offer (organizer only; behind <c>booking.counter_offers</c>).</summary>
    [HttpPost("applications/{id:guid}/counter-offer/respond")]
    [EnableRateLimiting(RateLimitPolicies.Apply)]
    public async Task<ActionResult<ApplicationDto>> RespondToCounterOffer(
        Guid id, [FromBody] CounterOfferResponseRequest request, CancellationToken ct)
    {
        var result = await _applications.RespondToCounterOfferAsync(id, User.GetUserId(), request, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Maps a stable applications error code onto the RFC 9457 envelope (CONTRACTS §2).</summary>
    private ObjectResult ToProblem(ApplicationError error)
    {
        var status = error.Code switch
        {
            ApplicationErrorCodes.TurnstileFailed => StatusCodes.Status403Forbidden,
            ApplicationErrorCodes.NotVenueManager => StatusCodes.Status403Forbidden,
            ApplicationErrorCodes.InvalidState => StatusCodes.Status409Conflict,
            ApplicationErrorCodes.SlotTaken => StatusCodes.Status409Conflict,
            ApplicationErrorCodes.ScheduleUnavailable => StatusCodes.Status409Conflict,
            ApplicationErrorCodes.InvalidApplication => StatusCodes.Status400BadRequest,
            _ => StatusCodes.Status404NotFound,
        };

        // The stable code always rides on `code`; a coded error may carry extra payload fields
        // (e.g. schedule_unavailable's available/totalOccurrences/conflicts) that ride alongside.
        var extensions = new Dictionary<string, object?> { ["code"] = error.Code };
        if (error.Extensions is not null)
        {
            foreach (var (key, value) in error.Extensions)
            {
                extensions[key] = value;
            }
        }

        return Problem(detail: error.Detail, statusCode: status, extensions: extensions);
    }
}
