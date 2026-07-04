using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Steeple.Api.Controllers.Identity;
/// <summary>
/// Session lifecycle (CONTRACTS §4): exchange a provider ID token for the API's token pair,
/// rotate refresh tokens, and revoke the current session. Public + writable, so the endpoints
/// sit behind the per-IP rate limiter (and Turnstile inside the service).
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting(RateLimitPolicies.Auth)]
public sealed class AuthController : ControllerBase
{
    private readonly IIdentityService _identity;

    public AuthController(IIdentityService identity) => _identity = identity;

    /// <summary>Signs in: verifies the provider ID token and issues access + refresh tokens.</summary>
    [HttpPost("sessions")]
    public async Task<ActionResult<SessionResponse>> CreateSession([FromBody] CreateSessionRequest request, CancellationToken ct)
    {
        var result = await _identity.CreateSessionAsync(request, HttpContext.Connection.RemoteIpAddress?.ToString(), ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Rotates a refresh token. Reuse of a rotated token revokes the whole session family.</summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<RefreshResponse>> Refresh([FromBody] RefreshRequest request, CancellationToken ct)
    {
        var result = await _identity.RefreshAsync(request.RefreshToken, ct);
        return result.Error is null ? Ok(result.Value) : ToProblem(result.Error);
    }

    /// <summary>Signs out the current session (revokes its refresh-token family).</summary>
    [Authorize]
    [HttpDelete("sessions")]
    public async Task<IActionResult> RevokeSession(CancellationToken ct)
    {
        await _identity.RevokeSessionAsync(User.GetSessionId(), ct);
        return NoContent();
    }

    /// <summary>Maps a stable identity error code onto the RFC 9457 envelope (CONTRACTS §2).</summary>
    private ObjectResult ToProblem(IdentityError error)
    {
        var status = error.Code switch
        {
            IdentityErrorCodes.TurnstileFailed => StatusCodes.Status403Forbidden,
            IdentityErrorCodes.UseOriginalProvider => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status401Unauthorized,
        };

        return Problem(detail: error.Detail, statusCode: status, extensions: new Dictionary<string, object?>
        {
            ["code"] = error.Code,
        });
    }
}
