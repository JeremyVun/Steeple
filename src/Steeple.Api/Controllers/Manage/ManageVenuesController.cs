using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Services.Manage;

namespace Steeple.Api.Controllers.Manage;
/// <summary>
/// Provider self-service venue endpoints (CONTRACTS §6). All routes are venue-manager-scoped:
/// unknown and unmanaged ids answer identically with 404 (no existence leak).
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/manage/venues")]
public sealed class ManageVenuesController : ControllerBase
{
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IManageService _manage;

    /// <summary>Creates the controller over the venue-manager reads and manage use-cases.</summary>
    public ManageVenuesController(IVenueManagerRepository venueManagers, IManageService manage)
    {
        _venueManagers = venueManagers;
        _manage = manage;
    }

    /// <summary>Venues the caller manages (empty for non-providers — clients use this to show a provider surface).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ManagedVenueDto>>> Get(CancellationToken ct)
    {
        var venues = await _venueManagers.GetManagedVenuesAsync(User.GetUserId(), ct);
        return Ok(venues.Select(v => new ManagedVenueDto(v.Id, v.Name, v.Slug)).ToList());
    }

    /// <summary>Full editor view of one managed venue.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ManagedVenueDetailDto>> GetDetail(Guid id, CancellationToken ct)
    {
        var result = await _manage.GetVenueAsync(User.GetUserId(), id, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Creates a venue (geocoded + geofenced); the caller becomes its first manager.</summary>
    [HttpPost]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<ManagedVenueDetailDto>> Create([FromBody] SaveVenueRequest request, CancellationToken ct)
    {
        var result = await _manage.CreateVenueAsync(User.GetUserId(), request, ct);
        return result.Error is null
            ? CreatedAtAction(nameof(GetDetail), new { id = result.Value!.Id }, result.Value)
            : this.ToManageProblem(result.Error);
    }

    /// <summary>Applies non-null fields; address changes re-geocode (geofenced).</summary>
    [HttpPatch("{id:guid}")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<ManagedVenueDetailDto>> Update(Guid id, [FromBody] SaveVenueRequest request, CancellationToken ct)
    {
        var result = await _manage.UpdateVenueAsync(User.GetUserId(), id, request, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Submits ownership / lease-authority evidence for operator verification.</summary>
    [HttpPost("{id:guid}/verification")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<ManagedVenueDetailDto>> SubmitVerification(
        Guid id, [FromBody] SubmitVenueVerificationRequest request, CancellationToken ct)
    {
        var result = await _manage.SubmitVenueVerificationAsync(User.GetUserId(), id, request, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Creates a room in Draft under a managed venue.</summary>
    [HttpPost("{id:guid}/rooms")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<ManagedRoomDto>> CreateRoom(Guid id, [FromBody] SaveRoomRequest request, CancellationToken ct)
    {
        var result = await _manage.CreateRoomAsync(User.GetUserId(), id, request, ct);
        return result.Error is null
            ? CreatedAtAction(
                nameof(ManageRoomsController.GetRoom),
                "ManageRooms",
                new { id = result.Value!.Id },
                result.Value)
            : this.ToManageProblem(result.Error);
    }
}
