using System.Text;
using System.Xml;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;

namespace Steeple.Web.Controllers;

/// <summary>
/// SEO endpoints for the discovery funnel: a crawl-policy <c>robots.txt</c> and a dynamic
/// <c>sitemap.xml</c> enumerating every published listing's canonical URL.
/// </summary>
public sealed class SeoController : SteepleControllerBase
{
    private readonly ISteepleApiClient _api;

    /// <summary>Creates the controller.</summary>
    public SeoController(ISteepleApiClient api) => _api = api;

    /// <summary>Crawl policy: index listings, keep crawlers out of the faceted /search trap.</summary>
    [HttpGet("/robots.txt")]
    [ResponseCache(Duration = 3600)]
    public IActionResult Robots()
    {
        var baseUrl = BaseUrl;
        // Disallow rules are host-root-relative paths, so they must carry the sub-path prefix too.
        var prefix = Request.PathBase.Value ?? "";
        var body =
            "User-agent: *\n" +
            $"Disallow: {prefix}/search\n" +    // faceted filter URLs: crawl-trap + duplicate content
            $"Disallow: {prefix}/listings/\n" + // id URLs only 301 to the canonical slug
            "\n" +
            $"Sitemap: {baseUrl}/sitemap.xml\n";
        return Content(body, "text/plain", Encoding.UTF8);
    }

    /// <summary>Dynamic sitemap: the home page plus every published listing's canonical URL.</summary>
    [HttpGet("/sitemap.xml")]
    [ResponseCache(Duration = 3600)]
    public async Task<IActionResult> Sitemap(CancellationToken ct)
    {
        var baseUrl = BaseUrl;
        var entries = await _api.GetSitemapEntriesAsync(ct);

        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var urls = new List<XElement>
        {
            new(ns + "url",
                new XElement(ns + "loc", baseUrl + "/"),
                new XElement(ns + "changefreq", "daily"),
                new XElement(ns + "priority", "1.0")),
        };
        urls.AddRange(entries.Select(e => new XElement(ns + "url",
            new XElement(ns + "loc", $"{baseUrl}/space/{e.VenueSlug}/{e.RoomSlug}"),
            new XElement(ns + "lastmod", e.LastModifiedUtc.UtcDateTime.ToString("yyyy-MM-dd")),
            new XElement(ns + "changefreq", "weekly"),
            new XElement(ns + "priority", "0.8"))));

        var doc = new XDocument(new XDeclaration("1.0", "utf-8", null), new XElement(ns + "urlset", urls));

        using var ms = new MemoryStream();
        var settings = new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = true, Async = true };
        await using (var xw = XmlWriter.Create(ms, settings))
        {
            doc.WriteTo(xw);
        }

        return File(ms.ToArray(), "application/xml; charset=utf-8");
    }
}
