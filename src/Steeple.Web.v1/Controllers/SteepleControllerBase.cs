using Microsoft.AspNetCore.Mvc;

namespace Steeple.Web.Controllers;

/// <summary>
/// Shared base for the funnel's MVC controllers. Centralises absolute-URL building for canonical /
/// OG tags and the SEO documents so the scheme/host logic lives in one place (and reflects the
/// X-Forwarded-Proto from the reverse proxy).
/// </summary>
public abstract class SteepleControllerBase : Controller
{
    /// <summary>
    /// Scheme + host + path base of the current request, e.g. <c>https://steeple.example</c>
    /// (or <c>https://example.com/steeple</c> when hosted under a reverse-proxy sub-path —
    /// <see cref="HttpRequest.PathBase"/> is populated from X-Forwarded-Prefix).
    /// </summary>
    protected string BaseUrl => $"{Request.Scheme}://{Request.Host}{Request.PathBase}";

    /// <summary>Builds an absolute URL for <paramref name="path"/> against the current request host.</summary>
    protected string AbsoluteUrl(string path) => $"{BaseUrl}{path}";

    /// <summary>
    /// Derives up to 2 distinct scheme+host origins from <paramref name="photoUrls"/> and stashes
    /// them in ViewData for <c>_Layout</c> to emit as <c>&lt;link rel="preconnect"&gt;</c>
    /// (+ <c>dns-prefetch</c> fallback). Photo URLs are absolute and currently point at
    /// picsum.photos (a DO Spaces CDN origin in production), so the origin(s) to preconnect to
    /// must be computed from the actual URLs rather than hardcoded.
    /// </summary>
    protected void SetPreconnectOrigins(IEnumerable<string?> photoUrls)
    {
        var origins = photoUrls
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => Uri.TryCreate(url, UriKind.Absolute, out var uri) ? $"{uri.Scheme}://{uri.Authority}" : null)
            .Where(origin => origin is not null)
            .Select(origin => origin!)
            .Distinct()
            .Take(2)
            .ToArray();

        if (origins.Length > 0)
        {
            ViewData["PreconnectOrigins"] = origins;
        }
    }
}
