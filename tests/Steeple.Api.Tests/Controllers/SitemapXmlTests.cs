using System.Globalization;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Steeple.Api.Tests.Services.Seo;

namespace Steeple.Api.Tests.Controllers;

/// <summary>
/// The one crawler-facing index of the site. What matters here is that every URL it advertises is
/// absolute, prefix-aware, indexable and reachable — and that a <c>loc</c> is spelled exactly as
/// the canonical of the document it leads to, because two spellings of one room are the duplicate
/// state this whole surface exists to avoid (docs/contracts/seo.md, SEO-D9).
/// The row-level rules (Published, in-area, non-operator-unlisted) are SQL and are proven against a
/// real Postgres in <c>RoomRepositoryTests</c>; here the rows arrive as given.
/// </summary>
public class SitemapXmlTests
{
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    private static readonly SitemapEntry[] Entries =
    [
        new("dunn-loring-umc", "art-studio", new DateTimeOffset(2026, 8, 8, 14, 30, 0, TimeSpan.Zero)),
        new("grace-community-vienna", "fellowship-hall", new DateTimeOffset(2026, 7, 2, 6, 0, 0, TimeSpan.Zero)),
    ];

    [Fact]
    public async Task Every_loc_is_an_absolute_url_under_the_configured_public_base()
    {
        var urls = await UrlsAsync();

        Assert.Equal(
            new[]
            {
                "https://steeple.test/",
                "https://steeple.test/space/dunn-loring-umc/art-studio",
                "https://steeple.test/space/grace-community-vienna/fellowship-hall",
            },
            urls.Select(Loc));
    }

    [Fact]
    public async Task A_stripped_prefix_deployment_advertises_its_prefix_in_every_loc()
    {
        var urls = await UrlsAsync(configuredBase: "https://example.com/steeple");

        Assert.Equal(
            new[]
            {
                "https://example.com/steeple/",
                "https://example.com/steeple/space/dunn-loring-umc/art-studio",
                "https://example.com/steeple/space/grace-community-vienna/fellowship-hall",
            },
            urls.Select(Loc));
    }

    [Fact]
    public async Task Nothing_but_the_home_page_and_listing_documents_is_advertised()
    {
        var urls = await UrlsAsync();
        var locs = urls.Select(Loc).ToList();

        Assert.All(locs.Skip(1), loc => Assert.StartsWith("https://steeple.test/space/", loc, StringComparison.Ordinal));
        Assert.DoesNotContain(locs, loc => loc.Contains('#', StringComparison.Ordinal));
        Assert.DoesNotContain(locs, loc => loc.Contains('?', StringComparison.Ordinal));
        foreach (var noindexRoute in new[] { "/apply", "/browse", "/venue/", "/journal", "/desk", "/letter", "/inbox" })
        {
            Assert.DoesNotContain(locs, loc => loc.Contains(noindexRoute, StringComparison.Ordinal));
        }

        // A room may be listed once and only once — a repeated loc is a crawl budget spent twice.
        Assert.Equal(locs.Count, locs.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task A_row_the_service_withheld_is_never_invented_by_the_controller()
    {
        // Draft, Unlisted, operator-unlisted and out-of-area rooms all arrive as an absent row.
        var urls = await UrlsAsync(entries: []);

        Assert.Equal(new[] { "https://steeple.test/" }, urls.Select(Loc));
    }

    [Fact]
    public async Task Each_listing_carries_its_lastmod_as_a_plain_date()
    {
        var urls = await UrlsAsync();

        var lastmods = urls.Skip(1).Select(u => u.Element(Ns + "lastmod")!.Value).ToList();
        Assert.Equal(new[] { "2026-08-08", "2026-07-02" }, lastmods);
        Assert.All(lastmods, value => Assert.True(
            DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
            $"'{value}' is not the W3C date the sitemap protocol asks for"));
        // The home page has no row to time from and must not claim one.
        Assert.Null(urls[0].Element(Ns + "lastmod"));
    }

    [Fact]
    public async Task The_document_a_loc_leads_to_names_itself_with_the_very_same_string()
    {
        // Five places one room's URL is written: the sitemap loc, the canonical link, og:url, the
        // Offer's url and the breadcrumb's last item. A crawler treats any difference between them
        // as different pages, so they are compared byte for byte rather than "equivalently".
        var listing = SeoFixtures.Listing();
        var publicBase = SeoFixtures.Prefixed;
        var urls = await UrlsAsync(
            configuredBase: publicBase.Root,
            entries: [new SitemapEntry(listing.Venue.Slug, listing.RoomSlug, DateTimeOffset.UtcNow)]);

        var loc = Loc(urls[1]);
        var html = new WebDocumentRenderer().RenderListing(publicBase, listing).Html;
        var graph = SeoFixtures.Graph(html);
        var breadcrumb = SeoFixtures.Node(graph, "BreadcrumbList")
            .GetProperty("itemListElement").EnumerateArray().Last().GetProperty("item").GetString();

        Assert.Equal(loc, SeoFixtures.Canonical(html));
        Assert.Equal(loc, SeoFixtures.MetaProperty(html, "og:url"));
        Assert.Equal(loc, SeoFixtures.Node(graph, "Offer").GetProperty("url").GetString());
        Assert.Equal(loc, breadcrumb);
        Assert.Equal("https://example.com/steeple/space/dunn-loring-umc/art-studio", loc);
    }

    [Fact]
    public async Task Slugs_are_escaped_the_same_way_in_the_sitemap_and_in_the_canonical()
    {
        // Slugs are lower-case ASCII by construction; if a row ever arrives otherwise, the two
        // spellings must still agree rather than one escaping and the other not.
        var listing = SeoFixtures.Listing(venueSlug: "st-mary's", roomSlug: "hall a");
        var urls = await UrlsAsync(entries: [new SitemapEntry(listing.Venue.Slug, listing.RoomSlug, DateTimeOffset.UtcNow)]);

        var html = new WebDocumentRenderer().RenderListing(SeoFixtures.Root, listing).Html;

        Assert.Equal(SeoFixtures.Canonical(html), Loc(urls[1]));
    }

    private static string Loc(XElement url) => url.Element(Ns + "loc")!.Value;

    private static async Task<IReadOnlyList<XElement>> UrlsAsync(
        string configuredBase = SeoFixtures.Origin,
        IReadOnlyList<SitemapEntry>? entries = null)
    {
        var controller = Controller(entries ?? Entries, configuredBase);
        var result = Assert.IsType<ContentResult>(await controller.SitemapXml(default));

        Assert.Equal("application/xml; charset=utf-8", result.ContentType);
        var document = XDocument.Parse(result.Content!);
        Assert.Equal(Ns + "urlset", document.Root!.Name);
        return document.Root.Elements(Ns + "url").ToList();
    }

    private static ListingsApiController Controller(IReadOnlyList<SitemapEntry> entries, string configuredBase)
    {
        var resolver = new PublicBaseResolver(
            Options.Create(new SeoOptions { PublicBaseUrl = configuredBase }),
            new StubHostEnvironment(),
            NullLogger<PublicBaseResolver>.Instance);

        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("whatever.example");
        context.Request.Path = "/api/v1/sitemap.xml";

        return new ListingsApiController(
            new SitemapListingService(entries),
            new StubGeofence(),
            new NoFlags(),
            resolver,
            TimeProvider.System)
        {
            ControllerContext = new ControllerContext { HttpContext = context },
        };
    }

    private sealed class SitemapListingService(IReadOnlyList<SitemapEntry> entries) : IListingService
    {
        public Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default) =>
            Task.FromResult(entries);

        public Task<ListingSearchResult> SearchAsync(ListingSearchQuery query, AvailabilityFilter? when = null, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<RoomDetailDto?> GetByIdAsync(Guid roomId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default) =>
            throw new NotSupportedException();
    }

    private sealed class StubGeofence : IGeofencePolicy
    {
        public BoundingBox Bounds => new(38.84, 38.96, -77.34, -77.12);

        public GeoPoint Center => new(38.9012, -77.2653);

        public string AreaName => "Vienna & nearby (Northern Virginia)";

        public string TimezoneId => "America/New_York";

        public bool IsServed(double latitude, double longitude) => Bounds.Contains(latitude, longitude);

        public BoundingBox ResolveSearchBounds(ListingSearchQuery query) => Bounds;
    }

    private sealed class NoFlags : IFeatureFlags
    {
        public bool IsEnabled(string key) => false;
    }
}
