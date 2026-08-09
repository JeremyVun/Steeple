namespace Steeple.Api.Services.Seo;

/// <summary>
/// One rendered web document: everything the controller needs to answer, and nothing about how it
/// was decided. Keeping the status on the result is deliberate — a not-found listing is a document
/// the renderer owns, not an error the framework improvises (SEO-D10).
/// </summary>
/// <param name="StatusCode">HTTP status this document is the body of.</param>
/// <param name="Html">The complete document, already encoded.</param>
/// <param name="CacheControl">Value for the <c>Cache-Control</c> header (design §8).</param>
/// <param name="Robots">Value for the <c>X-Robots-Tag</c> header, or null for an indexable document.</param>
public sealed record WebDocument(int StatusCode, string Html, string CacheControl, string? Robots);

/// <summary>
/// Renders the crawler-facing web documents the API owns (docs/contracts/seo.md SEO-D3).
/// It depends on the public contracts and a <see cref="PublicBase"/> only: no EF, no repositories,
/// no knowledge of nginx, and no second copy of the listing-visibility rules.
/// </summary>
public interface IWebDocumentRenderer
{
    /// <summary>The listing document for a room the discoverability gate has already allowed.</summary>
    WebDocument RenderListing(PublicBase publicBase, RoomDetailDto listing);

    /// <summary>
    /// The designed not-found document. One body for every reason a listing is not public —
    /// unknown, Draft, Unlisted, operator-unlisted, out of area — so the response reveals no
    /// moderation or geofence state (SEO-D10).
    /// </summary>
    WebDocument RenderListingNotFound(PublicBase publicBase);

    /// <summary>
    /// The crawl policy, as <c>text/plain</c>. Not a <see cref="WebDocument"/>: it has no status to
    /// decide, no cache policy of its own and no robots header — it *is* the robots header, written
    /// out. Rendered rather than shipped as a static file because the sitemaps.org protocol reads
    /// <c>Sitemap:</c> as a fully-qualified URL and ignores a relative one, so the line can only be
    /// written by something that knows this deployment's public base (design.md §7).
    /// </summary>
    string RenderRobots(PublicBase publicBase);
}
