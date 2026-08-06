
namespace Steeple.Api.Controllers.Identity;
/// <summary>
/// The browser transport for the rotating refresh token (CONTRACTS — identity, "refreshTransport").
///
/// A refresh token in <c>localStorage</c> is readable by any script that gets onto the page; the
/// same token in an httpOnly cookie is not, and the browser attaches it to the same-origin
/// <c>/api</c> calls the SPA already makes through the dev proxy / nginx. Native clients keep the
/// body transport — they have no cookie jar worth the name and their storage is the OS keychain.
///
/// <c>SameSite=Strict</c> is safe for this product: the cookie is only ever needed on requests the
/// SPA itself issues from its own origin, and the one cross-site entry point (an email CTA) is a
/// top-level navigation whose *document* then makes those same-site calls.
/// </summary>
internal static class RefreshTokenCookie
{
    /// <summary>The token the browser presented, or null when it holds none.</summary>
    public static string? Read(HttpRequest request, AuthOptions options) =>
        request.Cookies.TryGetValue(options.RefreshCookieName, out var value) && value.Length > 0
            ? value
            : null;

    /// <summary>Sets (or replaces) the cookie for the full refresh lifetime.</summary>
    public static void Write(HttpContext http, AuthOptions options, string token) =>
        http.Response.Cookies.Append(
            options.RefreshCookieName,
            token,
            Attributes(http.Request, options, TimeSpan.FromDays(options.RefreshTokenDays)));

    /// <summary>Expires the cookie — the browser drops it immediately.</summary>
    public static void Expire(HttpContext http, AuthOptions options) =>
        http.Response.Cookies.Append(
            options.RefreshCookieName,
            "",
            Attributes(http.Request, options, TimeSpan.Zero));

    private static CookieOptions Attributes(HttpRequest request, AuthOptions options, TimeSpan maxAge) => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Strict,
        // Root path, not /api: web and admin can live behind a stripped reverse-proxy prefix, and a
        // path scoped to the un-stripped route would simply never be sent (ARCHITECTURE, sub-path
        // hosting).
        Path = "/",
        Secure = IsHttps(request),
        MaxAge = maxAge,
        // Authentication, not analytics: the cookie survives a "reject non-essential" consent choice.
        IsEssential = true,
    };

    /// <summary>
    /// True when the person's connection is https. Trusted forwarded-proto processing has already
    /// updated <see cref="HttpRequest.IsHttps"/> before controllers run.
    /// </summary>
    private static bool IsHttps(HttpRequest request) => request.IsHttps;
}
