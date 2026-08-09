namespace Steeple.Api.Services.Seo;

/// <summary>
/// Where the public reaches this deployment: an origin plus the sub-path prefix an edge proxy
/// strips before the request arrives (docs/contracts/seo.md, Public base and sub-path deployment).
/// Everything crawler-facing
/// — canonicals, <c>og:url</c>, the document <c>&lt;base&gt;</c>, handoff/shell URLs, absolute
/// photo URLs and the sitemap's <c>loc</c> — is derived from one of these, so the whole surface
/// moves together when a deployment moves.
/// </summary>
public sealed record PublicBase
{
    private PublicBase(string origin, string prefix)
    {
        Origin = origin;
        Prefix = prefix;
    }

    /// <summary>Scheme and authority with no trailing slash, e.g. <c>https://example.com</c>.</summary>
    public string Origin { get; }

    /// <summary>The stripped prefix with a leading and no trailing slash (<c>/steeple</c>), or empty.</summary>
    public string Prefix { get; }

    /// <summary>The deployment root as an absolute URL with no trailing slash.</summary>
    public string Root => Origin + Prefix;

    /// <summary>The value for a document's <c>&lt;base href&gt;</c>: <c>/steeple/</c> or <c>/</c>.</summary>
    public string BasePath => Prefix + "/";

    /// <summary>
    /// Builds a base from any origin-ish string and prefix-ish string, normalizing slashes. Both
    /// parts are taken from trusted sources only (configuration, or the request inside the
    /// ForwardedHeaders trust boundary).
    /// </summary>
    public static PublicBase Create(string origin, string prefix) =>
        new(origin.TrimEnd('/'), NormalizePrefix(prefix));

    /// <summary>
    /// Parses a configured public base (<c>https://example.com/steeple</c>) into origin + prefix.
    /// Throws when the value is not an absolute http(s) URL — a deployment that misconfigures its
    /// canonical origin should fail at startup, not publish wrong URLs to crawlers.
    /// </summary>
    public static PublicBase Parse(string configured)
    {
        if (!Uri.TryCreate(configured.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException(
                $"{SeoOptions.SectionName}:{nameof(SeoOptions.PublicBaseUrl)} must be an absolute http(s) URL (got '{configured}').");
        }

        return new PublicBase(uri.GetLeftPart(UriPartial.Authority), NormalizePrefix(uri.AbsolutePath));
    }

    /// <summary>A root-relative, prefix-aware path for a deployment-root-relative resource.</summary>
    /// <example><c>Path("route-handoff.js")</c> → <c>/steeple/route-handoff.js</c></example>
    public string Path(string relative) => BasePath + relative.TrimStart('/');

    /// <summary>An absolute URL for a deployment-root-relative resource.</summary>
    /// <example><c>Absolute("space/v/r")</c> → <c>https://example.com/steeple/space/v/r</c></example>
    public string Absolute(string relative) => Origin + Path(relative);

    /// <summary>
    /// Resolves a photo value from the public contract. Object-storage photos are already absolute
    /// at their CDN origin and are returned untouched; local-disk photos are document-relative
    /// <c>media/…</c> paths and only become shareable once resolved against this base.
    /// </summary>
    public string AbsoluteMedia(string url) =>
        url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
        || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            ? url
            : Absolute(url);

    private static string NormalizePrefix(string prefix)
    {
        var trimmed = prefix.Trim().Trim('/');
        return trimmed.Length == 0 ? string.Empty : "/" + trimmed;
    }
}
