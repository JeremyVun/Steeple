using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Controllers.Identity;
/// <summary>
/// Session lifecycle (CONTRACTS §4): exchange a provider ID token for the API's token pair,
/// rotate refresh tokens, and revoke the current session. Public + writable, so the endpoints
/// sit behind the per-IP rate limiter (and Turnstile inside the service).
///
/// The refresh token reaches the client one of two ways — in the JSON body (native clients) or as
/// an httpOnly cookie (browsers) — chosen by <c>refreshTransport</c> and honoured consistently:
/// whichever way a token arrived is the way its successor leaves. See <see cref="RefreshTokenCookie"/>.
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting(RateLimitPolicies.Auth)]
public sealed class AuthController : ControllerBase
{
    private readonly IIdentityService _identity;
    private readonly AuthOptions _options;

    public AuthController(IIdentityService identity, IOptions<AuthOptions> options)
    {
        _identity = identity;
        _options = options.Value;
    }

    /// <summary>Signs in: verifies the provider ID token and issues access + refresh tokens.</summary>
    [HttpPost("sessions")]
    public async Task<ActionResult<SessionResponse>> CreateSession([FromBody] CreateSessionRequest request, CancellationToken ct)
    {
        var result = await _identity.CreateSessionAsync(request, HttpContext.Connection.RemoteIpAddress?.ToString(), ct);
        if (result.Error is not null)
        {
            return ToProblem(result.Error);
        }

        var session = result.Value!;
        if (!RefreshTransports.IsCookie(request.RefreshTransport))
        {
            return Ok(session);
        }

        RefreshTokenCookie.Write(HttpContext, _options, session.RefreshToken!);
        return Ok(session with { RefreshToken = null });
    }

    /// <summary>
    /// Rotates a refresh token, presented either in the body or as the httpOnly cookie. Reuse of a
    /// rotated token revokes the whole session family — except inside the rotation grace window,
    /// where a second tab racing the first is answered with the pair the first was given.
    /// </summary>
    [EnableRateLimiting(RateLimitPolicies.Refresh)]
    [HttpPost("refresh")]
    public async Task<ActionResult<RefreshResponse>> Refresh(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RefreshRequest? request,
        CancellationToken ct)
    {
        var fromCookie = RefreshTokenCookie.Read(Request, _options);
        var presented = request?.RefreshToken is { Length: > 0 } fromBody ? fromBody : fromCookie;
        // A body token plus refreshTransport:"cookie" is a client moving itself onto the cookie in
        // one rotation — the migration path off a token already sitting in localStorage.
        var answerByCookie = presented is not null
            && (presented == fromCookie || RefreshTransports.IsCookie(request?.RefreshTransport));

        if (presented is null)
        {
            return ToProblem(new IdentityError(
                IdentityErrorCodes.InvalidRefreshToken, "No refresh token was presented."));
        }

        var result = await _identity.RefreshAsync(presented, ct);
        if (result.Error is not null)
        {
            // The cookie names a session that is over; leaving it would make every later request
            // carry a credential the API has already refused.
            if (fromCookie is not null)
            {
                RefreshTokenCookie.Expire(HttpContext, _options);
            }

            return ToProblem(result.Error);
        }

        var pair = result.Value!;
        if (!answerByCookie)
        {
            return Ok(pair);
        }

        RefreshTokenCookie.Write(HttpContext, _options, pair.RefreshToken!);
        return Ok(pair with { RefreshToken = null });
    }

    /// <summary>
    /// Signs out the current session (revokes its refresh-token family).
    ///
    /// Deliberately not <c>[Authorize]</c>: the access token lives fifteen minutes and the refresh
    /// cookie ninety days, so the common sign-out — a tab left open over lunch — arrives with a
    /// stale bearer. Authenticating the revocation with the refresh token itself means "sign out"
    /// actually revokes something instead of failing silently.
    /// </summary>
    [AllowAnonymous]
    [HttpDelete("sessions")]
    public async Task<IActionResult> RevokeSession(CancellationToken ct)
    {
        var cookie = RefreshTokenCookie.Read(Request, _options);
        if (cookie is not null)
        {
            RefreshTokenCookie.Expire(HttpContext, _options);
        }

        if (User.Identity?.IsAuthenticated == true)
        {
            await _identity.RevokeSessionAsync(User.GetSessionId(), ct);
            return NoContent();
        }

        if (cookie is not null)
        {
            await _identity.RevokeSessionByRefreshTokenAsync(cookie, ct);
            return NoContent();
        }

        return Unauthorized();
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
