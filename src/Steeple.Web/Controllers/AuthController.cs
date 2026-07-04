using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Steeple.Web.Controllers;

/// <summary>
/// The BFF's SSO endpoints (SYSTEM_DESIGN §6). The browser completes the provider dance
/// (Google Identity Services button; Apple's redirect + form_post), lands the provider ID token
/// here, and the BFF exchanges it at the API — keeping the API token pair server-side inside the
/// encrypted auth cookie. The browser never sees a token.
///
/// CSRF: the Google credential arrives via a same-origin POST from our own login page, so the
/// standard antiforgery token applies. Apple's callback is a cross-site form_post that cannot
/// carry our antiforgery token — it is protected by the signed state cookie instead.
/// </summary>
public sealed class AuthController : SteepleControllerBase
{
    private const string AppleStateCookie = "steeple.apple";

    private readonly ISteepleApiClient _api;
    private readonly IFeatureFlags _flags;
    private readonly AuthFlowOptions _auth;
    private readonly IDataProtector _appleStateProtector;
    private readonly ILogger<AuthController> _logger;

    /// <summary>Creates the controller.</summary>
    public AuthController(
        ISteepleApiClient api,
        IFeatureFlags flags,
        IOptions<AuthFlowOptions> auth,
        IDataProtectionProvider dataProtection,
        ILogger<AuthController> logger)
    {
        _api = api;
        _flags = flags;
        _auth = auth.Value;
        _appleStateProtector = dataProtection.CreateProtector("Steeple.Web.AppleState");
        _logger = logger;
    }

    /// <summary>
    /// Receives the Google Identity Services credential. Same-origin POST submitted by the login
    /// page's JS callback, so antiforgery is validated by the global filter.
    /// </summary>
    [HttpPost("/auth/google/callback")]
    public async Task<IActionResult> GoogleCallback(
        string credential, string? returnUrl, string? turnstileToken, CancellationToken ct)
    {
        if (!SignInAvailable() || string.IsNullOrEmpty(_auth.Google.ClientId))
        {
            return NotFound();
        }

        return await ExchangeAndSignInAsync(
            provider: "google",
            idToken: credential,
            nonce: null,
            turnstileToken: turnstileToken,
            displayNameHint: null,
            returnUrl: returnUrl,
            ct);
    }

    /// <summary>
    /// Starts the Apple web flow: binds state + nonce (+ the Turnstile token and return URL) into
    /// a protected, short-lived cookie and redirects to Apple's authorize endpoint.
    /// </summary>
    [HttpPost("/auth/apple/start")]
    public IActionResult AppleStart(string? returnUrl, string? turnstileToken)
    {
        if (!SignInAvailable() || string.IsNullOrEmpty(_auth.Apple.ServicesId))
        {
            return NotFound();
        }

        var state = Guid.NewGuid().ToString("N");
        var nonce = Guid.NewGuid().ToString("N");

        var payload = JsonSerializer.Serialize(new AppleState(state, nonce, turnstileToken, LocalOrHome(returnUrl)));
        Response.Cookies.Append(AppleStateCookie, _appleStateProtector.Protect(payload), new CookieOptions
        {
            HttpOnly = true,
            // The callback is a cross-site POST from appleid.apple.com — Lax cookies wouldn't
            // travel with it. None requires Secure, which Apple's flow requires anyway (https
            // redirect URIs only; Apple sign-in is untestable on plain-http localhost).
            SameSite = SameSiteMode.None,
            Secure = true,
            MaxAge = TimeSpan.FromMinutes(10),
            Path = "/",
        });

        // response_type=code id_token puts the ID token straight in the form_post — no
        // code exchange, so no Apple client-secret JWT is needed for sign-in.
        var query = new Dictionary<string, string?>
        {
            ["client_id"] = _auth.Apple.ServicesId,
            ["redirect_uri"] = AbsoluteUrl("/auth/apple/callback"),
            ["response_type"] = "code id_token",
            ["response_mode"] = "form_post",
            ["scope"] = "name email",
            ["state"] = state,
            ["nonce"] = nonce,
        };

        var authorizeUrl = "https://appleid.apple.com/auth/authorize?" + string.Join(
            "&",
            query.Select(kv => $"{kv.Key}={Uri.EscapeDataString(kv.Value ?? "")}"));

        return Redirect(authorizeUrl);
    }

    /// <summary>
    /// Apple's form_post callback. Cross-site by design, so the antiforgery filter is bypassed —
    /// the protected state cookie set by <see cref="AppleStart"/> takes its place.
    /// </summary>
    [HttpPost("/auth/apple/callback")]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> AppleCallback(
        [FromForm(Name = "id_token")] string? idToken,
        [FromForm] string? state,
        [FromForm] string? user,
        [FromForm] string? error,
        CancellationToken ct)
    {
        if (!SignInAvailable() || string.IsNullOrEmpty(_auth.Apple.ServicesId))
        {
            return NotFound();
        }

        var appleState = ReadAppleStateCookie();
        Response.Cookies.Delete(AppleStateCookie);

        if (appleState is null || string.IsNullOrEmpty(state) || !string.Equals(state, appleState.State, StringComparison.Ordinal))
        {
            _logger.LogWarning("Apple callback rejected: state mismatch or missing state cookie.");
            return FailSignIn(null, "~/");
        }

        if (!string.IsNullOrEmpty(error) || string.IsNullOrEmpty(idToken))
        {
            // "user_cancelled_authorize" and friends — not an error worth alarming anyone about.
            return Redirect(Url.Content("~/login"));
        }

        return await ExchangeAndSignInAsync(
            provider: "apple",
            idToken: idToken,
            nonce: appleState.Nonce,
            turnstileToken: appleState.TurnstileToken,
            displayNameHint: ExtractAppleName(user),
            returnUrl: appleState.ReturnUrl,
            ct);
    }

    /// <summary>Signs out: revokes the API session (best-effort) and clears the auth cookie.</summary>
    [Authorize]
    [HttpPost("/auth/signout")]
    public async Task<IActionResult> SignOutCurrent(CancellationToken ct)
    {
        var accessToken = await HttpContext.GetTokenAsync(SteepleCookieEvents.AccessTokenName);
        if (accessToken is not null)
        {
            try
            {
                await _api.RevokeSessionAsync(accessToken, ct);
            }
            catch (HttpRequestException ex)
            {
                // The cookie is going either way; a revocation miss only leaves a refresh family
                // to idle-expire server-side.
                _logger.LogWarning(ex, "API session revocation failed during sign-out.");
            }
        }

        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Redirect(Url.Content("~/"));
    }

    /// <summary>Exchanges a provider ID token at the API, signs the browser in, records agreements.</summary>
    private async Task<IActionResult> ExchangeAndSignInAsync(
        string provider,
        string idToken,
        string? nonce,
        string? turnstileToken,
        string? displayNameHint,
        string? returnUrl,
        CancellationToken ct)
    {
        var safeReturnUrl = LocalOrHome(returnUrl);

        if (string.IsNullOrEmpty(idToken))
        {
            return FailSignIn(null, safeReturnUrl);
        }

        (SessionResponse? session, string? errorCode) = (null, null);
        try
        {
            (session, errorCode) = await _api.CreateSessionAsync(
                new CreateSessionRequest(
                    Provider: provider,
                    IdToken: idToken,
                    Nonce: nonce,
                    TurnstileToken: turnstileToken,
                    DisplayName: displayNameHint,
                    Device: new DeviceInfoDto("web", "Web browser")),
                ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Session exchange failed: API unreachable.");
        }

        if (session is null)
        {
            _logger.LogWarning("Sign-in with {Provider} failed: {Code}.", provider, errorCode ?? "api_unreachable");
            return FailSignIn(errorCode, safeReturnUrl);
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, session.User.Id.ToString()),
                new Claim(ClaimTypes.Name, session.User.DisplayName),
                .. session.User.Email is { Length: > 0 } email ? new[] { new Claim(ClaimTypes.Email, email) } : [],
            ],
            CookieAuthenticationDefaults.AuthenticationScheme);

        var properties = new AuthenticationProperties { IsPersistent = true };
        SteepleCookieEvents.StoreTokens(properties, session.AccessToken, session.RefreshToken);

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            properties);

        // The login/consent copy states that continuing accepts the current ToS + Privacy —
        // record both (idempotent per version server-side). Best-effort: a miss is re-recorded
        // on the next sign-in.
        try
        {
            await _api.AcceptAgreementAsync(session.AccessToken, new AcceptAgreementRequest(LegalDocuments.TosDocType, LegalDocuments.TosVersion), ct);
            await _api.AcceptAgreementAsync(session.AccessToken, new AcceptAgreementRequest(LegalDocuments.PrivacyDocType, LegalDocuments.PrivacyVersion), ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Recording agreement acceptance failed.");
        }

        return Redirect(safeReturnUrl);
    }

    /// <summary>Stashes a friendly error for the login page and sends the person back to it.</summary>
    private IActionResult FailSignIn(string? errorCode, string returnUrl)
    {
        TempData["AuthError"] = errorCode switch
        {
            "use_original_provider" =>
                "That email already has an account here — sign in with the provider you first used.",
            "turnstile_failed" =>
                "We couldn't confirm you're not a robot. Reload the page and try again.",
            _ => "Sign-in didn't work. Please try again.",
        };

        var loginUrl = Url.Content("~/login");
        return Redirect(returnUrl == "~/" || string.IsNullOrEmpty(returnUrl)
            ? loginUrl
            : $"{loginUrl}?returnUrl={Uri.EscapeDataString(returnUrl)}");
    }

    private bool SignInAvailable() => _flags.IsEnabled("web.sign_in_enabled");

    private string LocalOrHome(string? returnUrl) =>
        Url.IsLocalUrl(returnUrl) ? returnUrl : Url.Content("~/");

    private AppleState? ReadAppleStateCookie()
    {
        if (!Request.Cookies.TryGetValue(AppleStateCookie, out var protectedPayload))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<AppleState>(_appleStateProtector.Unprotect(protectedPayload));
        }
        catch (Exception)
        {
            // Tampered or stale cookie — treat as absent.
            return null;
        }
    }

    /// <summary>
    /// Apple sends the person's name exactly once, as a JSON `user` form field on first
    /// authorization — it never appears in the ID token (PRD Apple caveat).
    /// </summary>
    private static string? ExtractAppleName(string? userJson)
    {
        if (string.IsNullOrWhiteSpace(userJson))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(userJson);
            if (!doc.RootElement.TryGetProperty("name", out var name))
            {
                return null;
            }

            var first = name.TryGetProperty("firstName", out var f) ? f.GetString() : null;
            var last = name.TryGetProperty("lastName", out var l) ? l.GetString() : null;
            var full = $"{first} {last}".Trim();
            return full.Length > 0 ? full : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record AppleState(string State, string Nonce, string? TurnstileToken, string ReturnUrl);
}
