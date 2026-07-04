using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Services.Manage;

namespace Steeple.Api.Controllers.Manage;
/// <summary>
/// Provider self-service room + photo endpoints (CONTRACTS §6). Venue-manager-scoped like the
/// venue routes; photo uploads run the Media pipeline (EXIF strip → variants → store).
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/manage")]
public sealed class ManageRoomsController : ControllerBase
{
    /// <summary>Upload cap (SYSTEM_DESIGN §9). Kestrel enforces it before the pipeline runs.</summary>
    private const long MaxUploadBytes = 10 * 1024 * 1024;

    private readonly IManageService _manage;
    private readonly IMediaService _media;

    /// <summary>Creates the controller over the manage and media use-cases.</summary>
    public ManageRoomsController(IManageService manage, IMediaService media)
    {
        _manage = manage;
        _media = media;
    }

    /// <summary>Manager view of one room (moderation state included).</summary>
    [HttpGet("rooms/{id:guid}")]
    public async Task<ActionResult<ManagedRoomDto>> GetRoom(Guid id, CancellationToken ct)
    {
        var result = await _manage.GetRoomAsync(User.GetUserId(), id, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>
    /// Applies non-null fields, including status transitions (moderation gate; unpublish honors
    /// bookings — CONTRACTS §6).
    /// </summary>
    [HttpPatch("rooms/{id:guid}")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<ManagedRoomDto>> UpdateRoom(Guid id, [FromBody] SaveRoomRequest request, CancellationToken ct)
    {
        var result = await _manage.UpdateRoomAsync(User.GetUserId(), id, request, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Uploads a photo (multipart <c>file</c> + optional <c>caption</c>, ≤10 MB).</summary>
    [HttpPost("rooms/{id:guid}/photos")]
    [EnableRateLimiting(RateLimitPolicies.Media)]
    [RequestSizeLimit(MaxUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadBytes)]
    public async Task<ActionResult<RoomPhotoDto>> UploadPhoto(
        Guid id, IFormFile? file, [FromForm] string? caption, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return this.ToManageProblem(new ManageError(MediaErrorCodes.InvalidImage, "Attach a photo file."));
        }

        await using var content = file.OpenReadStream();
        var result = await _media.UploadPhotoAsync(User.GetUserId(), id, content, caption, ct);
        return result.Error is null ? StatusCode(StatusCodes.Status201Created, result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Updates photo metadata (caption / cover / order).</summary>
    [HttpPatch("photos/{photoId:guid}")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<ActionResult<RoomPhotoDto>> UpdatePhoto(Guid photoId, [FromBody] UpdatePhotoRequest request, CancellationToken ct)
    {
        var result = await _media.UpdatePhotoAsync(User.GetUserId(), photoId, request, ct);
        return result.Error is null ? Ok(result.Value) : this.ToManageProblem(result.Error);
    }

    /// <summary>Deletes a photo (row first, stored variants best-effort).</summary>
    [HttpDelete("photos/{photoId:guid}")]
    [EnableRateLimiting(RateLimitPolicies.Manage)]
    public async Task<IActionResult> DeletePhoto(Guid photoId, CancellationToken ct)
    {
        var result = await _media.DeletePhotoAsync(User.GetUserId(), photoId, ct);
        return result.Error is null ? NoContent() : this.ToManageProblem(result.Error);
    }
}
