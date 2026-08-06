
namespace Steeple.Api.Contracts.Identity;
/// <summary>
/// <c>POST /api/v1/auth/sessions</c> body: a provider ID token to exchange for Steeple's own
/// access + refresh tokens (CONTRACTS §4).
/// </summary>
/// <param name="Provider">Wire token: <c>google</c> or <c>apple</c>.</param>
/// <param name="IdToken">The provider-signed ID token (JWT) obtained by the client.</param>
/// <param name="Nonce">
/// The raw nonce the client bound into the SSO request (mobile + Apple web); must match the
/// token's <c>nonce</c> claim when either side supplies one.
/// </param>
/// <param name="TurnstileToken">Cloudflare Turnstile response token (required where Turnstile is enabled).</param>
/// <param name="DisplayName">
/// Optional display-name hint, honored only when the account is first created. Exists because
/// Apple sends the user's name once, in the authorization response, never in the ID token.
/// </param>
/// <param name="Device">Optional device descriptor recorded on the refresh-token session row.</param>
/// <param name="RefreshTransport">
/// How the client wants the refresh token delivered: <c>body</c> (default — the token is in the
/// JSON, which is what native clients need) or <c>cookie</c> (the token is set as an httpOnly
/// cookie and omitted from the JSON, which is the only way a browser can hold it out of reach of
/// script). See <see cref="RefreshTransports"/>.
/// </param>
public record CreateSessionRequest(
    string Provider,
    string IdToken,
    string? Nonce,
    string? TurnstileToken,
    string? DisplayName,
    DeviceInfoDto? Device,
    string? RefreshTransport = null);

/// <summary>The wire tokens for <c>refreshTransport</c> (CONTRACTS — identity).</summary>
public static class RefreshTransports
{
    /// <summary>The refresh token travels in the JSON body — the default, and what mobile uses.</summary>
    public const string Body = "body";

    /// <summary>The refresh token travels as an httpOnly cookie and never appears in the JSON.</summary>
    public const string Cookie = "cookie";

    /// <summary>True when the caller asked for cookie transport (case-insensitive).</summary>
    public static bool IsCookie(string? transport) =>
        string.Equals(transport, Cookie, StringComparison.OrdinalIgnoreCase);
}

/// <summary>The signing-in device, for the account page's session list.</summary>
/// <param name="Platform">Wire token: <c>ios</c>, <c>android</c> or <c>web</c>.</param>
/// <param name="Label">Human label, e.g. "iPhone 15".</param>
public record DeviceInfoDto(string Platform, string? Label);
