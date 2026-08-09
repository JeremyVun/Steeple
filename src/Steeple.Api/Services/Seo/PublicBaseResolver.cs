using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Seo;

/// <summary>
/// Default <see cref="IPublicBaseResolver"/>: configuration wins, the request is the fallback.
/// </summary>
/// <remarks>
/// <para>
/// This replaced <c>ListingsApiController.PublicBaseUrl()</c>, which read <c>X-Forwarded-Host</c>
/// and <c>X-Forwarded-Prefix</c> raw while Program.cs trust-bounds only <c>For</c>/<c>Proto</c> —
/// so any caller could choose the origin the sitemap advertised to crawlers. The configured value
/// is parsed once (eagerly, so a malformed one fails at startup rather than at first crawl).
/// </para>
/// <para>
/// Forwarded headers are still not consulted, and the fallback is a root-origin Development
/// convenience rather than a sub-path deployment's answer: a deployment reached under a stripped
/// prefix <b>requires</b> <c>Seo:PublicBaseUrl</c>. A forwarded prefix earns one warning naming
/// that key and nothing else.
/// </para>
/// </remarks>
public sealed class PublicBaseResolver : IPublicBaseResolver
{
    /// <summary>
    /// Read for one purpose only: to notice a deployment that believes this header decides
    /// something. Nothing here ever derives a URL from it (design.md §7).
    /// </summary>
    private const string ForwardedPrefixHeader = "X-Forwarded-Prefix";

    private readonly PublicBase? _configured;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<PublicBaseResolver> _log;

    /// <summary>Latched so a misconfigured deployment writes one line, not one per crawl.</summary>
    private int _forwardedPrefixWarned;

    public PublicBaseResolver(
        IOptions<SeoOptions> options,
        IHostEnvironment environment,
        ILogger<PublicBaseResolver> log)
    {
        var configured = options.Value.PublicBaseUrl;
        _configured = string.IsNullOrWhiteSpace(configured) ? null : PublicBase.Parse(configured);
        _environment = environment;
        _log = log;
    }

    /// <inheritdoc />
    public PublicBase Resolve(HttpRequest request)
    {
        if (_configured is { } configured)
        {
            return configured;
        }

        WarnIfAPrefixWasForwarded(request);

        return PublicBase.Create(
            // Request.Scheme is inside the trust boundary: UseForwardedHeaders only honours
            // X-Forwarded-Proto from the known proxy networks.
            $"{request.Scheme}://{request.Host.Value}",
            // Nobody maps a forwarded prefix into PathBase in this app, so outside Development —
            // where this whole fallback lives — this is empty. The fallback is a root-origin
            // convenience, not a sub-path deployment's answer (design.md §7).
            request.PathBase.Value ?? string.Empty);
    }

    /// <inheritdoc />
    public void WarnIfUnconfigured()
    {
        if (_configured is not null || _environment.IsDevelopment())
        {
            return;
        }

        _log.LogWarning(
            "{Section}:{Key} is not configured — canonical URLs, og:url and sitemap locs will name whatever origin each request arrives on. Set it per deployment (docs/backlog/seo/design.md §7).",
            SeoOptions.SectionName,
            nameof(SeoOptions.PublicBaseUrl));
    }

    /// <summary>
    /// The one diagnosable moment in an otherwise silent failure: a deployment reached under a
    /// stripped sub-path, whose edge describes that prefix in a header, with nothing configured to
    /// put the prefix back into the URLs it publishes. Every canonical, <c>og:url</c> and sitemap
    /// <c>loc</c> it emits then names an address that does not answer, and the only symptom is a
    /// crawler quietly finding nothing. The header stays advisory — it is unvalidated client input
    /// and is never allowed to name our own address (design.md §7).
    /// </summary>
    private void WarnIfAPrefixWasForwarded(HttpRequest request)
    {
        if (_environment.IsDevelopment())
        {
            return;
        }

        var forwarded = request.Headers[ForwardedPrefixHeader].ToString();
        if (string.IsNullOrWhiteSpace(forwarded)
            || Interlocked.Exchange(ref _forwardedPrefixWarned, 1) == 1)
        {
            return;
        }

        _log.LogWarning(
            "A request arrived describing a stripped sub-path prefix ('{Prefix}') while {Section}:{Key} is unset. Forwarded headers are never consulted for public URLs, so every canonical, og:url and sitemap loc this deployment publishes is missing that prefix and points where nothing answers. Set that key to the full public base, prefix included (docs/contracts/seo.md).",
            forwarded,
            SeoOptions.SectionName,
            nameof(SeoOptions.PublicBaseUrl));
    }
}
