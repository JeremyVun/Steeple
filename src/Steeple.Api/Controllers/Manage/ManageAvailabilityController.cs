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
}
