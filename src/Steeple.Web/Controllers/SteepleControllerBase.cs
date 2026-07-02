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
}
