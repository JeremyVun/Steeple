
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
public record CreateSessionRequest(
    string Provider,
    string IdToken,
    string? Nonce,
    string? TurnstileToken,
    string? DisplayName,
    DeviceInfoDto? Device);

/// <summary>The signing-in device, for the account page's session list.</summary>
/// <param name="Platform">Wire token: <c>ios</c>, <c>android</c> or <c>web</c>.</param>
/// <param name="Label">Human label, e.g. "iPhone 15".</param>
public record DeviceInfoDto(string Platform, string? Label);
