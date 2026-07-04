using System.Security.Claims;

namespace Steeple.Api.Extensions;
/// <summary>
/// Reads the API's own access-token claims. JwtBearer is configured with
/// <c>MapInboundClaims = false</c>, so the raw JWT claim names (<c>sub</c>, <c>sid</c>) survive.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    /// <summary>The authenticated user id (<c>sub</c>). Throws when called without authentication.</summary>
    public static Guid GetUserId(this ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out var id)
            ? id
            : throw new InvalidOperationException("The current principal has no 'sub' claim.");

    /// <summary>The session (refresh-token family) id (<c>sid</c>).</summary>
    public static Guid GetSessionId(this ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sid"), out var id)
            ? id
            : throw new InvalidOperationException("The current principal has no 'sid' claim.");
}
