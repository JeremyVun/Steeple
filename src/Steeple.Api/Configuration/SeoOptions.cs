namespace Steeple.Api.Configuration;
/// <summary>
/// The canonical public origin of the deployment (docs/contracts/seo.md, Public base and sub-path
/// deployment). Every crawler-
/// facing absolute URL — the sitemap's <c>loc</c>, a listing document's canonical, <c>og:url</c>,
/// its <c>&lt;base&gt;</c> and its JSON-LD — is built from this one value.
/// </summary>
/// <remarks>
/// Deliberately configuration and not request headers: <c>X-Forwarded-Host</c>/<c>-Prefix</c> are
/// unvalidated client input (Program.cs trust-bounds only <c>For</c>/<c>Proto</c>), so letting them
/// reach a canonical would let any caller poison the URL a crawler is told to index.
/// </remarks>
public class SeoOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Seo";

    /// <summary>
    /// Scheme + host + optional stripped sub-path prefix, e.g. <c>https://steeple.app</c> or
    /// <c>https://example.com/steeple</c>. Empty is a Development convenience only: the API then
    /// falls back to the request's own scheme/host/PathBase and logs a warning at startup outside
    /// Development.
    /// </summary>
    public string PublicBaseUrl { get; set; } = "";
}
