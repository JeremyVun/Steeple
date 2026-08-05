using System.Globalization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Steeple.Web.Services;
/// <summary>
/// Keeps the auth cookie's embedded API tokens fresh (SYSTEM_DESIGN §6 BFF pattern): the cookie
/// stores the access + refresh token server-side (encrypted by DataProtection); on each request
/// past the access token's expiry the BFF rotates the pair at the API and renews the cookie.
/// A failed rotation (revoked/expired family, "signed out everywhere") rejects the principal so
/// the browser is signed out instead of carrying a dead session.
/// </summary>
public sealed class SteepleCookieEvents : CookieAuthenticationEvents
{
    /// <summary>Token names inside the auth ticket.</summary>
    public const string AccessTokenName = "access_token";
    public const string RefreshTokenName = "refresh_token";
    public const string ExpiresAtName = "expires_at";

    /// <summary>Refresh this long before nominal expiry so in-flight requests don't race a dying token.</summary>
    private static readonly TimeSpan ExpirySkew = TimeSpan.FromMinutes(1);

    private readonly ISteepleApiClient _api;
    private readonly ILogger<SteepleCookieEvents> _logger;

    /// <summary>Creates the events handler.</summary>
    public SteepleCookieEvents(ISteepleApiClient api, ILogger<SteepleCookieEvents> logger)
    {
        _api = api;
        _logger = logger;
    }

    /// <inheritdoc />
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var expiresAtRaw = context.Properties.GetTokenValue(ExpiresAtName);
        var refreshToken = context.Properties.GetTokenValue(RefreshTokenName);

        if (refreshToken is null
            || !DateTimeOffset.TryParse(expiresAtRaw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var expiresAt))
        {
            // A cookie without tokens can't reach the API — treat as signed out.
            await RejectAsync(context);
            return;
        }

        if (DateTimeOffset.UtcNow < expiresAt - ExpirySkew)
        {
            return;
        }

        RefreshResponse? rotated;
        try
        {
            rotated = await _api.RefreshAsync(refreshToken, context.HttpContext.RequestAborted);
        }
        catch (HttpRequestException ex)
        {
            // API unreachable: keep the session (the actual API call this request makes will fail
            // visibly); signing everyone out on a blip would be worse.
            _logger.LogWarning(ex, "Token refresh skipped: API unreachable.");
            return;
        }

        if (rotated is null)
        {
            await RejectAsync(context);
            return;
        }

        StoreTokens(context.Properties, rotated.AccessToken, rotated.RefreshToken);
        context.ShouldRenew = true;
    }

    /// <summary>Writes a token pair (+ computed access expiry) into an auth ticket's properties.</summary>
    public static void StoreTokens(AuthenticationProperties properties, string accessToken, string refreshToken)
    {
        properties.StoreTokens(
        [
            new AuthenticationToken { Name = AccessTokenName, Value = accessToken },
            new AuthenticationToken { Name = RefreshTokenName, Value = refreshToken },
            // Nominal expiry mirrors the API's access-token lifetime; kept in the ticket so the
            // BFF doesn't have to parse its own JWT. A stale value only causes an early refresh.
            new AuthenticationToken
            {
                Name = ExpiresAtName,
                Value = DateTimeOffset.UtcNow.AddMinutes(14).ToString("o", CultureInfo.InvariantCulture),
            },
        ]);
    }

    private static async Task RejectAsync(CookieValidatePrincipalContext context)
    {
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }
}
