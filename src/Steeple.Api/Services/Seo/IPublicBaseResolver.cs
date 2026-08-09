namespace Steeple.Api.Services.Seo;

/// <summary>
/// The one place the API decides what its public origin is. Both crawler surfaces — the sitemap
/// and the listing documents — resolve through this, so they can never disagree about the URL
/// family they advertise (docs/backlog/seo/design.md §7).
/// </summary>
public interface IPublicBaseResolver
{
    /// <summary>
    /// The configured public base, or — Development convenience only — the request's own
    /// scheme/host/PathBase. Never reads <c>X-Forwarded-Host</c>/<c>-Prefix</c>: those are
    /// unvalidated client input and must not reach a canonical.
    /// </summary>
    PublicBase Resolve(HttpRequest request);

    /// <summary>
    /// Logs once at startup when no public base is configured outside Development, where the
    /// request-origin fallback silently publishes whatever origin a request happened to arrive on.
    /// </summary>
    void WarnIfUnconfigured();
}
