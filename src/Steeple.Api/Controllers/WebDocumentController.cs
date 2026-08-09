using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Steeple.Api.Controllers;

/// <summary>
/// The crawler-facing documents the API renders at the root of the public origin
/// (docs/contracts/seo.md SEO-D3): the listing document, and the crawl policy that names its
/// sitemap. Deliberately outside <c>/api/v1</c> — these are web documents at the addresses the
/// public asks for, not a new JSON wire contract. nginx proxies these two paths and serves every
/// other clean route as a static file itself.
/// </summary>
/// <remarks>
/// <para>
/// No <c>[ApiController]</c>, on purpose. That attribute exists to turn controller results into
/// <c>application/problem+json</c>, and a crawler asking for a listing must receive the designed
/// HTML page for every outcome. Every response here is an explicit <see cref="ContentResult"/>
/// carrying its own body and content type, which also keeps <c>UseStatusCodePages()</c> —
/// registered in Program.cs, and only interested in empty-bodied error responses — out of it.
/// </para>
/// <para>
/// Only a successful lookup that returns nothing becomes a 404. Exceptions are left to propagate:
/// an outage is a 5xx, and telling a crawler "not found" would remove an indexed listing over a
/// database blip (SEO-D10).
/// </para>
/// </remarks>
[EnableRateLimiting(RateLimitPolicies.Documents)]
public sealed class WebDocumentController : ControllerBase
{
    /// <summary>
    /// Bound before any lookup (design §9). Slugs are generated as lower-case alphanumerics and
    /// hyphens; accepting upper case as well is what makes the canonical-case redirect possible,
    /// and rejecting everything else keeps traversal, encoded separators and junk out of the
    /// repository and the logs.
    /// </summary>
    private const int MaxSlugLength = 150;

    private readonly IListingService _listings;
    private readonly IWebDocumentRenderer _renderer;
    private readonly IPublicBaseResolver _publicBase;

    public WebDocumentController(
        IListingService listings,
        IWebDocumentRenderer renderer,
        IPublicBaseResolver publicBase)
    {
        _listings = listings;
        _renderer = renderer;
        _publicBase = publicBase;
    }

    /// <summary>
    /// The canonical listing document. Resolves through the same discoverability gate as the public
    /// detail read, so Draft, Unlisted, operator-unlisted, out-of-area and unknown rooms are one
    /// indistinguishable 404.
    /// </summary>
    [HttpGet("/space/{venueSlug}/{roomSlug}")]
    public async Task<IActionResult> Listing(string venueSlug, string roomSlug, CancellationToken ct)
    {
        var publicBase = _publicBase.Resolve(Request);

        if (!IsSlugShaped(venueSlug) || !IsSlugShaped(roomSlug))
        {
            return Document(_renderer.RenderListingNotFound(publicBase));
        }

        var listing = await _listings.GetBySlugAsync(venueSlug, roomSlug, ct);
        if (listing is null)
        {
            return Document(_renderer.RenderListingNotFound(publicBase));
        }

        // One address per listing (SEO-D9). A spelling that resolves but is not the DTO's own —
        // a different case, or a trailing slash — is permanently redirected rather than served,
        // so a crawler never sees the same room at two URLs. The query string rides along: it is
        // never part of the canonical, but it may still carry the visit's own flags.
        var canonicalPath = WebDocumentRenderer.ListingPath(listing.Venue.Slug, listing.RoomSlug);
        if (!string.Equals(venueSlug, listing.Venue.Slug, StringComparison.Ordinal)
            || !string.Equals(roomSlug, listing.RoomSlug, StringComparison.Ordinal)
            || Request.Path.Value?.EndsWith('/') == true)
        {
            return RedirectPermanent(publicBase.Absolute(canonicalPath) + Request.QueryString);
        }

        return Document(_renderer.RenderListing(publicBase, listing));
    }

    /// <summary>
    /// The crawl policy. Rendered here rather than shipped in the bundle because its
    /// <c>Sitemap:</c> line has to be a fully-qualified URL — a relative one is ignored by every
    /// crawler, and autodiscovery is the only sitemap-discovery mechanism this deployment has
    /// (design §7). Cached for an hour, as <c>/sitemap.xml</c> is: the policy changes with a
    /// release, not with the data.
    /// </summary>
    [HttpGet("/robots.txt")]
    [ResponseCache(Duration = 3600)]
    public IActionResult Robots() =>
        new ContentResult
        {
            Content = _renderer.RenderRobots(_publicBase.Resolve(Request)),
            ContentType = "text/plain; charset=utf-8",
            StatusCode = StatusCodes.Status200OK,
        };

    /// <summary>Writes a rendered document as-is: its own status, body, cache policy and robots header.</summary>
    private IActionResult Document(WebDocument document)
    {
        Response.Headers.CacheControl = document.CacheControl;
        if (document.Robots is { } robots)
        {
            Response.Headers["X-Robots-Tag"] = robots;
        }

        return new ContentResult
        {
            Content = document.Html,
            ContentType = "text/html; charset=utf-8",
            StatusCode = document.StatusCode,
        };
    }

    private static bool IsSlugShaped(string? slug)
    {
        if (string.IsNullOrEmpty(slug) || slug.Length > MaxSlugLength)
        {
            return false;
        }

        foreach (var c in slug)
        {
            if (!char.IsAsciiLetterOrDigit(c) && c != '-')
            {
                return false;
            }
        }

        return true;
    }
}
