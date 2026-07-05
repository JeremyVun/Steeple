using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Steeple.Api.Controllers.Manage;
/// <summary>
/// Provider self-service availability rules (CONTRACTS §6a): a room's weekly open hours and
/// blackout dates. Venue-manager-scoped like the other manage room routes; the PUT is replace-all.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/manage")]
public sealed class ManageAvailabilityController : ControllerBase
{
    private readonly IAvailabilityService _availability;

    /// <summary>Creates the controller over the availability use-cases.</summary>
    public ManageAvailabilityController(IAvailabilityService availability) => _availability = availability;

    /// <summary>The room's full availability rule set (all seven days, Sunday-first).</summary>
    [HttpGet("rooms/{id:guid}/availability")]
    public async Task<ActionResult<RoomAvailabilityRulesDto>> GetAvailability(Guid id, CancellationToken ct)
    {
        var result = await _availability.GetRulesAsync(User.GetUserId(), id, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Replaces the room's entire rule set; returns the saved state.</summary>
    [HttpPut("rooms/{id:guid}/availability")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<RoomAvailabilityRulesDto>> SaveAvailability(
        Guid id, [FromBody] SaveAvailabilityRulesRequest request, CancellationToken ct)
    {
        var result = await _availability.SaveRulesAsync(User.GetUserId(), id, request, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>
    /// The venue calendar: confirmed occurrences + pending-application overlays across the venue's
    /// rooms over <c>[from, to]</c> (venue-local; defaults to today .. +27 days). Manager-scoped —
    /// an unknown venue or a non-manager caller both 404. <c>invalid_range</c> when <c>to</c> is
    /// before <c>from</c> or the span exceeds 92 days.
    /// </summary>
    [HttpGet("venues/{id:guid}/calendar")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<VenueCalendarDto>> GetCalendar(
        Guid id, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var result = await _availability.GetVenueCalendarAsync(User.GetUserId(), id, from, to, ct);
        if (result.Value is { } dto)
        {
            return Ok(dto);
        }

        // Reuse the Manage problem mapping: not_found → 404, invalid_range → 400 (both carry `code`).
        var error = result.IsNotFound
            ? new ManageError(ManageErrorCodes.NotFound, "No such venue.")
            : new ManageError(result.ErrorCode!, result.ErrorDetail!);
        return this.ToManageProblem(error);
    }
}
