using System.Text.Json.Serialization;

namespace Steeple.Api.Contracts.Identity;
/// <summary>
/// <c>POST /api/v1/auth/refresh</c> body. Both fields are optional: a browser on cookie transport
/// presents nothing at all and the token is read from the httpOnly cookie instead.
/// </summary>
/// <param name="RefreshToken">The rotating token, when the client holds it itself (mobile).</param>
/// <param name="RefreshTransport">
/// How the rotated token should come back — see <see cref="RefreshTransports"/>. A token that
/// arrived by cookie always answers by cookie; this field exists so a client holding a body token
/// can move itself onto cookie transport in one rotation.
/// </param>
public record RefreshRequest(string? RefreshToken = null, string? RefreshTransport = null);

/// <summary>
/// The rotated token pair returned by a successful refresh. <see cref="RefreshToken"/> is absent on
/// cookie transport — the new token is in the <c>Set-Cookie</c> header and nowhere script can read it.
/// </summary>
public record RefreshResponse(
    string AccessToken,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? RefreshToken);
