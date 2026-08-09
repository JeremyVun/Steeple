using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Steeple.Api.Tests.Services.Seo;

namespace Steeple.Api.Tests.Controllers;

/// <summary>
/// What comes back over the wire for the two addresses this controller owns: the listing document
/// with one canonical address and a 404 that is a designed page rather than the framework's
/// ProblemDetails (docs/backlog/seo/design.md SEO-D9, D10), and the crawl policy whose whole reason
/// for being rendered is that its sitemap URL must be absolute. The discoverability rules are
/// <see cref="ListingService"/>'s and are tested there — here every non-public reason simply
/// arrives as the same null.
/// </summary>
public class WebDocumentControllerTests
{
    [Fact]
    public async Task A_published_listing_is_returned_as_html_that_may_not_be_reused_blind()
    {
        var controller = Controller(SeoFixtures.Listing());

        var result = Assert.IsType<ContentResult>(await controller.Listing("dunn-loring-umc", "art-studio", default));

        Assert.Equal(StatusCodes.Status200OK, result.StatusCode);
        Assert.Equal("text/html; charset=utf-8", result.ContentType);
        Assert.Equal("no-cache", controller.Response.Headers.CacheControl.ToString());
        Assert.False(controller.Response.Headers.ContainsKey("X-Robots-Tag"));
        Assert.Contains("<title>Art Studio at", result.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Every_reason_a_listing_is_not_public_answers_with_the_same_page()
    {
        // Unknown, Draft, Unlisted, operator-unlisted and out-of-area all reach the controller as
        // one null from the gate, and must be indistinguishable in the response.
        var controller = Controller(listing: null);

        var first = Assert.IsType<ContentResult>(await controller.Listing("oakton-baptist", "renovation-annex", default));
        var second = Assert.IsType<ContentResult>(await controller.Listing("no-such-venue", "no-such-room", default));

        Assert.Equal(StatusCodes.Status404NotFound, first.StatusCode);
        Assert.Equal("text/html; charset=utf-8", first.ContentType);
        Assert.Equal("noindex", controller.Response.Headers["X-Robots-Tag"].ToString());
        Assert.Equal("no-cache", controller.Response.Headers.CacheControl.ToString());
        Assert.Equal(first.Content, second.Content);
        Assert.Contains("This space isn't available", first.Content, StringComparison.Ordinal);
        // The framework's error shape must never reach a crawler asking for a page.
        Assert.DoesNotContain("problem+json", first.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_slug_that_could_never_be_one_is_refused_without_a_lookup()
    {
        var listings = new StubListingService(SeoFixtures.Listing());
        var controller = Controller(listings);

        var result = Assert.IsType<ContentResult>(await controller.Listing("..", "%2e%2e", default));

        Assert.Equal(StatusCodes.Status404NotFound, result.StatusCode);
        Assert.Equal(0, listings.Lookups);
    }

    [Theory]
    [InlineData("Dunn-Loring-UMC", "art-studio")]
    [InlineData("dunn-loring-umc", "Art-Studio")]
    public async Task A_spelling_that_resolves_but_is_not_canonical_is_redirected_permanently(
        string venueSlug,
        string roomSlug)
    {
        var controller = Controller(SeoFixtures.Listing());

        var result = Assert.IsType<RedirectResult>(await controller.Listing(venueSlug, roomSlug, default));

        Assert.True(result.Permanent);
        Assert.Equal("https://steeple.test/space/dunn-loring-umc/art-studio", result.Url);
    }

    [Fact]
    public async Task A_trailing_slash_is_redirected_to_the_bare_canonical_and_keeps_the_query()
    {
        var controller = Controller(SeoFixtures.Listing());
        controller.Request.Path = "/space/dunn-loring-umc/art-studio/";
        controller.Request.QueryString = new QueryString("?world=off");

        var result = Assert.IsType<RedirectResult>(await controller.Listing("dunn-loring-umc", "art-studio", default));

        Assert.True(result.Permanent);
        // The query is never part of the canonical, but it is part of this visit.
        Assert.Equal("https://steeple.test/space/dunn-loring-umc/art-studio?world=off", result.Url);
    }

    [Fact]
    public async Task An_unknown_listing_is_answered_directly_rather_than_redirected_into_a_404()
    {
        var controller = Controller(listing: null);
        controller.Request.Path = "/space/no-such-venue/no-such-room/";

        var result = Assert.IsType<ContentResult>(await controller.Listing("no-such-venue", "no-such-room", default));

        Assert.Equal(StatusCodes.Status404NotFound, result.StatusCode);
    }

    [Fact]
    public async Task An_outage_stays_an_outage()
    {
        // A failing read must not be reported to a crawler as "this listing is gone".
        var controller = Controller(new ThrowingListingService());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => controller.Listing("dunn-loring-umc", "art-studio", default));
    }

    [Fact]
    public async Task A_configured_public_base_beats_the_request_and_its_forwarded_headers()
    {
        var controller = Controller(SeoFixtures.Listing(), configuredBase: "https://steeple.app/steeple");
        controller.Request.Headers["X-Forwarded-Host"] = "evil.example";

        var result = Assert.IsType<ContentResult>(await controller.Listing("dunn-loring-umc", "art-studio", default));

        Assert.Contains(
            "<link rel=\"canonical\" href=\"https://steeple.app/steeple/space/dunn-loring-umc/art-studio\"",
            result.Content,
            StringComparison.Ordinal);
        Assert.DoesNotContain("evil.example", result.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task With_no_configured_base_the_document_names_the_origin_it_was_asked_at()
    {
        var controller = Controller(SeoFixtures.Listing(), configuredBase: "");
        controller.Request.Scheme = "http";
        controller.Request.Host = new HostString("localhost:5173");

        var result = Assert.IsType<ContentResult>(await controller.Listing("dunn-loring-umc", "art-studio", default));

        Assert.Contains(
            "<link rel=\"canonical\" href=\"http://localhost:5173/space/dunn-loring-umc/art-studio\"",
            result.Content,
            StringComparison.Ordinal);
    }

    [Fact]
    public void The_crawl_policy_is_plain_text_and_still_says_everything_may_be_found()
    {
        var result = Assert.IsType<ContentResult>(Controller(SeoFixtures.Listing()).Robots());

        Assert.Equal(StatusCodes.Status200OK, result.StatusCode);
        Assert.Equal("text/plain; charset=utf-8", result.ContentType);
        var body = result.Content!;
        Assert.Contains("User-agent: *", body, StringComparison.Ordinal);
        Assert.Contains("Allow: /", body, StringComparison.Ordinal);
        Assert.DoesNotContain("Disallow:", body, StringComparison.Ordinal);
        // The file the bundle used to ship explained itself; the rendered one must still.
        Assert.Contains("# Steeple — crawl policy", body, StringComparison.Ordinal);
        Assert.Contains("Everything here is meant to be found", body, StringComparison.Ordinal);
        Assert.DoesNotContain("<!doctype", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void The_sitemap_is_named_by_an_absolute_url_because_a_relative_one_is_ignored()
    {
        // The whole reason this file is rendered rather than shipped: sitemaps.org reads
        // `Sitemap:` as a fully-qualified URL, and autodiscovery is the only way this
        // deployment's sitemap is found (design.md §7).
        var body = Assert.IsType<ContentResult>(Controller(SeoFixtures.Listing()).Robots()).Content!;

        Assert.Contains("Sitemap: https://steeple.test/sitemap.xml", body, StringComparison.Ordinal);
        Assert.DoesNotContain("Sitemap: /", body, StringComparison.Ordinal);
    }

    [Fact]
    public void A_configured_base_wins_and_carries_its_prefix_into_the_sitemap_line()
    {
        var controller = Controller(SeoFixtures.Listing(), configuredBase: "https://example.com/steeple");
        controller.Request.Headers["X-Forwarded-Host"] = "evil.example";

        var body = Assert.IsType<ContentResult>(controller.Robots()).Content!;

        Assert.Contains("Sitemap: https://example.com/steeple/sitemap.xml", body, StringComparison.Ordinal);
        Assert.DoesNotContain("evil.example", body, StringComparison.Ordinal);
    }

    [Fact]
    public void With_no_configured_base_the_policy_names_the_origin_it_was_asked_at()
    {
        // The Development fallback, which is what a compose stack and `vite dev` both are:
        // the port is part of the origin, and a Sitemap: URL without it answers nowhere.
        var controller = Controller(SeoFixtures.Listing(), configuredBase: "");
        controller.Request.Scheme = "http";
        controller.Request.Host = new HostString("localhost:8080");

        var body = Assert.IsType<ContentResult>(controller.Robots()).Content!;

        Assert.Contains("Sitemap: http://localhost:8080/sitemap.xml", body, StringComparison.Ordinal);
    }

    private static WebDocumentController Controller(RoomDetailDto? listing, string configuredBase = SeoFixtures.Origin) =>
        Controller(new StubListingService(listing), configuredBase);

    private static WebDocumentController Controller(
        IListingService listings,
        string configuredBase = SeoFixtures.Origin)
    {
        var resolver = new PublicBaseResolver(
            Options.Create(new SeoOptions { PublicBaseUrl = configuredBase }),
            new StubHostEnvironment(),
            NullLogger<PublicBaseResolver>.Instance);

        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("steeple.test");
        context.Request.Path = "/space/dunn-loring-umc/art-studio";

        return new WebDocumentController(listings, new WebDocumentRenderer(), resolver)
        {
            ControllerContext = new ControllerContext { HttpContext = context },
        };
    }

    private sealed class StubListingService(RoomDetailDto? listing) : IListingService
    {
        public int Lookups { get; private set; }

        public Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default)
        {
            Lookups++;
            return Task.FromResult(listing);
        }

        public Task<ListingSearchResult> SearchAsync(ListingSearchQuery query, AvailabilityFilter? when = null, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<RoomDetailDto?> GetByIdAsync(Guid roomId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default) =>
            throw new NotSupportedException();
    }

    private sealed class ThrowingListingService : IListingService
    {
        public Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default) =>
            throw new InvalidOperationException("the database is unreachable");

        public Task<ListingSearchResult> SearchAsync(ListingSearchQuery query, AvailabilityFilter? when = null, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<RoomDetailDto?> GetByIdAsync(Guid roomId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default) =>
            throw new NotSupportedException();
    }

}
