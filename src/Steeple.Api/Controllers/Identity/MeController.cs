using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Controllers.Identity;
/// <summary>
/// The signed-in user's own account (CONTRACTS §4): profile + agreements, legal-doc acceptance,
/// sign-out-everywhere, account deletion (anonymization — Apple 5.1.1(v)), and push-device
/// registration.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/me")]
public sealed class MeController : ControllerBase
{
    private readonly IIdentityService _identity;
    private readonly IDeviceRegistry _devices;

    public MeController(IIdentityService identity, IDeviceRegistry devices)
    {
        _identity = identity;
        _devices = devices;
    }

    /// <summary>Profile plus recorded ToS/Privacy acceptances.</summary>
    [HttpGet]
    public async Task<ActionResult<MeResponse>> Get(CancellationToken ct)
    {
        var me = await _identity.GetMeAsync(User.GetUserId(), ct);
        return me is null ? NotFound() : Ok(me);
    }

    /// <summary>Deletes the account: anonymizes the user row and revokes every session.</summary>
    [HttpDelete]
    public async Task<IActionResult> Delete(CancellationToken ct)
    {
        await _identity.DeleteMeAsync(User.GetUserId(), ct);
        return NoContent();
    }

    /// <summary>Records acceptance of a legal document version (idempotent).</summary>
    [HttpPost("agreements")]
    public async Task<IActionResult> AcceptAgreement([FromBody] AcceptAgreementRequest request, CancellationToken ct)
    {
        var recorded = await _identity.RecordAgreementAsync(User.GetUserId(), request, ct);
        return recorded
            ? NoContent()
            : Problem(
                detail: $"Unknown document type '{request.DocType}'.",
                statusCode: StatusCodes.Status400BadRequest,
                extensions: new Dictionary<string, object?> { ["code"] = "unknown_doc_type" });
    }

    /// <summary>Signs out everywhere: revokes every session the user holds.</summary>
    [HttpDelete("sessions")]
    public async Task<IActionResult> RevokeAllSessions(CancellationToken ct)
    {
        await _identity.RevokeAllSessionsAsync(User.GetUserId(), ct);
        return NoContent();
    }

    /// <summary>Registers (or refreshes) a push device for the current user — upsert by <c>fcmToken</c>.</summary>
    [HttpPost("devices")]
    public async Task<IActionResult> RegisterDevice([FromBody] RegisterDeviceRequest request, CancellationToken ct)
    {
        var registered = await _devices.RegisterAsync(User.GetUserId(), request.FcmToken, request.Platform, ct);
        return registered
            ? NoContent()
            : Problem(
                detail: "The device platform must be 'ios', 'android' or 'web', and fcmToken must be 1-512 characters.",
                statusCode: StatusCodes.Status400BadRequest,
                extensions: new Dictionary<string, object?> { ["code"] = "invalid_device" });
    }

    /// <summary>Removes a push-device registration (e.g. on sign-out). Deletes only if owned by the caller; 204 either way.</summary>
    [HttpDelete("devices/{token}")]
    public async Task<IActionResult> UnregisterDevice(string token, CancellationToken ct)
    {
        await _devices.UnregisterAsync(User.GetUserId(), token, ct);
        return NoContent();
    }
}
