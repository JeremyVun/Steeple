using System.Text.Json;

namespace Steeple.Api.Tests.Services.Seo;

/// <summary>
/// The listing document is the only thing a crawler, a share-card scraper or a visitor with no
/// JavaScript ever sees, so these tests read the rendered text rather than a model: unique
/// metadata, prefix-correct URLs, structured data that parses and says only what
/// <see cref="RoomDetailDto"/> knows, and host text that cannot break out of the nodes it sits in
/// (docs/backlog/seo/design.md SEO-D5, D7–D10).
/// </summary>
public class WebDocumentRendererTests
{
    private readonly WebDocumentRenderer _renderer = new();

    private string Listing(RoomDetailDto listing, PublicBase? publicBase = null) =>
        _renderer.RenderListing(publicBase ?? SeoFixtures.Root, listing).Html;

    // ---- metadata ---------------------------------------------------------------------------

    [Fact]
    public void Listing_carries_its_own_title_description_canonical_and_open_graph()
    {
        var html = Listing(SeoFixtures.Listing());

        Assert.Contains(
            "<title>Art Studio at Dunn Loring United Methodist Church, Dunn Loring · Steeple</title>",
            html,
            StringComparison.Ordinal);
        Assert.Equal(
            "Art Studio at Dunn Loring United Methodist Church, Dunn Loring · Steeple",
            SeoFixtures.MetaProperty(html, "og:title"));

        var description = SeoFixtures.MetaName(html, "description");
        Assert.NotNull(description);
        Assert.StartsWith(
            "Art Studio at Dunn Loring United Methodist Church in Dunn Loring. Seats 24, $30/hr.",
            description,
            StringComparison.Ordinal);
        Assert.True(description.Length <= 160, $"description is {description.Length} characters");
        Assert.Equal(description, SeoFixtures.MetaProperty(html, "og:description"));

        Assert.Equal("https://steeple.test/space/dunn-loring-umc/art-studio", SeoFixtures.Canonical(html));
        Assert.Equal("https://steeple.test/space/dunn-loring-umc/art-studio", SeoFixtures.MetaProperty(html, "og:url"));
        Assert.Equal("Steeple", SeoFixtures.MetaProperty(html, "og:site_name"));
        Assert.Equal("index,follow", SeoFixtures.MetaName(html, "robots"));
    }

    [Fact]
    public void Two_listings_never_share_a_title_or_canonical()
    {
        var one = Listing(SeoFixtures.Listing());
        var other = Listing(SeoFixtures.Listing(roomName: "Community Lounge", roomSlug: "community-lounge"));

        Assert.NotEqual(SeoFixtures.MetaProperty(one, "og:title"), SeoFixtures.MetaProperty(other, "og:title"));
        Assert.NotEqual(SeoFixtures.Canonical(one), SeoFixtures.Canonical(other));
    }

    [Fact]
    public void Listing_with_no_photograph_claims_a_summary_card_and_no_image()
    {
        var html = Listing(SeoFixtures.Listing(photos: []));

        Assert.Equal("summary", SeoFixtures.MetaName(html, "twitter:card"));
        Assert.Null(SeoFixtures.MetaProperty(html, "og:image"));
        Assert.Null(SeoFixtures.MetaName(html, "twitter:image"));
    }

    [Fact]
    public void Listing_with_a_photograph_claims_the_large_card()
    {
        var html = Listing(SeoFixtures.Listing());

        Assert.Equal("summary_large_image", SeoFixtures.MetaName(html, "twitter:card"));
        Assert.Equal("https://steeple.test/media/art-studio-1.jpg", SeoFixtures.MetaProperty(html, "og:image"));
    }

    [Fact]
    public void Document_relative_photos_become_absolute_and_cdn_photos_are_left_alone()
    {
        var local = Listing(SeoFixtures.Listing());
        Assert.Equal("https://steeple.test/media/art-studio-1.jpg", SeoFixtures.MetaProperty(local, "og:image"));

        var remote = Listing(SeoFixtures.Listing(
            photos: [SeoFixtures.Photo(url: "https://steeple.sfo3.cdn.digitaloceanspaces.com/a.jpg")]));
        Assert.Equal(
            "https://steeple.sfo3.cdn.digitaloceanspaces.com/a.jpg",
            SeoFixtures.MetaProperty(remote, "og:image"));
    }

    [Fact]
    public void The_cover_photograph_is_the_primary_one_whatever_order_they_arrive_in()
    {
        var html = Listing(SeoFixtures.Listing(photos:
        [
            SeoFixtures.Photo(url: "media/second.jpg", isPrimary: false, sortOrder: 1, caption: null),
            SeoFixtures.Photo(url: "media/cover.jpg", isPrimary: true, sortOrder: 9, caption: null),
        ]));

        Assert.Equal("https://steeple.test/media/cover.jpg", SeoFixtures.MetaProperty(html, "og:image"));
    }

    // ---- sub-path deployment ----------------------------------------------------------------

    [Fact]
    public void Every_url_in_the_document_keeps_the_deployment_prefix()
    {
        var html = Listing(SeoFixtures.Listing(), SeoFixtures.Prefixed);

        Assert.Contains("<base href=\"/steeple/\">", html, StringComparison.Ordinal);
        Assert.Equal("https://example.com/steeple/space/dunn-loring-umc/art-studio", SeoFixtures.Canonical(html));
        Assert.Contains(
            "<script src=\"/steeple/route-handoff.js\" data-base=\"/steeple/\" data-shell=\"/steeple/index.html\" defer></script>",
            html,
            StringComparison.Ordinal);
        Assert.Contains("href=\"/steeple/route-document.css\"", html, StringComparison.Ordinal);
        Assert.Contains("href=\"/steeple/apply/dunn-loring-umc/art-studio\"", html, StringComparison.Ordinal);
        Assert.Contains("https://example.com/steeple/media/art-studio-1.jpg", html, StringComparison.Ordinal);
    }

    [Fact]
    public void A_root_deployment_writes_root_urls()
    {
        var html = Listing(SeoFixtures.Listing());

        Assert.Contains("<base href=\"/\">", html, StringComparison.Ordinal);
        Assert.Contains(
            "<script src=\"/route-handoff.js\" data-base=\"/\" data-shell=\"/index.html\" defer></script>",
            html,
            StringComparison.Ordinal);
    }

    // ---- structured data --------------------------------------------------------------------

    [Fact]
    public void The_graph_describes_the_room_its_venue_and_the_hourly_offer()
    {
        using var graph = SeoFixtures.Graph(Listing(SeoFixtures.Listing()));

        Assert.Equal("https://schema.org", graph.RootElement.GetProperty("@context").GetString());

        var room = SeoFixtures.Node(graph, "Place");
        Assert.Equal("Art Studio", room.GetProperty("name").GetString());
        Assert.Equal("https://steeple.test/space/dunn-loring-umc/art-studio", room.GetProperty("url").GetString());
        Assert.Equal(24, room.GetProperty("maximumAttendeeCapacity").GetInt32());
        Assert.Equal("2316 Gallows Road", room.GetProperty("address").GetProperty("streetAddress").GetString());
        Assert.Equal("Dunn Loring", room.GetProperty("address").GetProperty("addressLocality").GetString());
        Assert.Equal(38.8989, room.GetProperty("geo").GetProperty("latitude").GetDouble(), 4);

        var offer = SeoFixtures.Node(graph, "Offer");
        Assert.Equal(30m, offer.GetProperty("price").GetDecimal());
        Assert.Equal("USD", offer.GetProperty("priceCurrency").GetString());
        Assert.Equal(
            room.GetProperty("@id").GetString(),
            offer.GetProperty("availableAtOrFrom").GetProperty("@id").GetString());

        var unitPrice = offer.GetProperty("priceSpecification");
        Assert.Equal("UnitPriceSpecification", unitPrice.GetProperty("@type").GetString());
        var hour = unitPrice.GetProperty("referenceQuantity");
        Assert.Equal(1, hour.GetProperty("value").GetInt32());
        Assert.Equal("HUR", hour.GetProperty("unitCode").GetString());
        Assert.Equal("hour", hour.GetProperty("unitText").GetString());

        var breadcrumb = SeoFixtures.Node(graph, "BreadcrumbList");
        var trail = breadcrumb.GetProperty("itemListElement").EnumerateArray().ToList();
        Assert.Equal(2, trail.Count);
        Assert.Equal("Steeple", trail[0].GetProperty("name").GetString());
        Assert.Equal("https://steeple.test/", trail[0].GetProperty("item").GetString());
        Assert.Equal("Art Studio at Dunn Loring United Methodist Church", trail[1].GetProperty("name").GetString());
        Assert.Equal(
            "https://steeple.test/space/dunn-loring-umc/art-studio",
            trail[1].GetProperty("item").GetString());
    }

    [Theory]
    [InlineData("church", "PlaceOfWorship")]
    [InlineData("publicSpace", "Place")]
    [InlineData("other", "Place")]
    public void The_venue_is_typed_by_what_it_is(string venueType, string expected)
    {
        using var graph = SeoFixtures.Graph(Listing(SeoFixtures.Listing(venueType: venueType)));

        var venue = SeoFixtures.Node(graph, "Place").GetProperty("containedInPlace");
        Assert.Equal(expected, venue.GetProperty("@type").GetString());
        Assert.Equal("Dunn Loring United Methodist Church", venue.GetProperty("name").GetString());
    }

    [Fact]
    public void Amenities_and_accessibility_are_location_features_with_readable_names()
    {
        using var graph = SeoFixtures.Graph(Listing(SeoFixtures.Listing()));

        var features = SeoFixtures.Node(graph, "Place").GetProperty("amenityFeature").EnumerateArray().ToList();
        Assert.All(features, f => Assert.Equal("LocationFeatureSpecification", f.GetProperty("@type").GetString()));
        Assert.All(features, f => Assert.True(f.GetProperty("value").GetBoolean()));

        var names = features.Select(f => f.GetProperty("name").GetString()!).ToList();
        Assert.Equal(
            new List<string> { "Air conditioning", "Parking", "Step-free access", "Accessible restroom" },
            names);
    }

    [Fact]
    public void Accessibility_is_never_stated_as_a_content_or_admission_claim()
    {
        // schema.org's accessibilityFeature is about media content and isAccessibleForFree is
        // about admission price; neither means a step-free door (SEO-D8).
        var html = Listing(SeoFixtures.Listing());

        Assert.DoesNotContain("accessibilityFeature", html, StringComparison.Ordinal);
        Assert.DoesNotContain("isAccessibleForFree", html, StringComparison.Ordinal);
    }

    [Fact]
    public void A_revealed_rating_is_stated_of_the_venue_that_earned_it()
    {
        using var graph = SeoFixtures.Graph(Listing(SeoFixtures.Listing(rating: new RatingSummaryDto(4.5, 3))));

        var rating = SeoFixtures.Node(graph, "Place").GetProperty("containedInPlace").GetProperty("aggregateRating");
        Assert.Equal("AggregateRating", rating.GetProperty("@type").GetString());
        Assert.Equal(4.5, rating.GetProperty("ratingValue").GetDouble(), 2);
        Assert.Equal(3, rating.GetProperty("ratingCount").GetInt32());
        Assert.Equal(5, rating.GetProperty("bestRating").GetInt32());
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    public void An_unrated_space_says_nothing_rather_than_zero(int? count)
    {
        var rating = count is null ? null : new RatingSummaryDto(0, count.Value);
        var html = Listing(SeoFixtures.Listing(rating: rating));

        Assert.DoesNotContain("aggregateRating", html, StringComparison.Ordinal);
        Assert.DoesNotContain("AggregateRating", html, StringComparison.Ordinal);
        Assert.DoesNotContain("ratings", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Absent_values_are_absent_claims()
    {
        var html = Listing(SeoFixtures.Listing(
            description: "",
            houseRules: "",
            amenities: [],
            accessibility: [],
            activities: [],
            photos: [],
            parkingInfo: "",
            transitInfo: "",
            openHours: [new DayOpenHoursDto("monday", [])]));

        using var graph = SeoFixtures.Graph(html);
        var room = SeoFixtures.Node(graph, "Place");

        Assert.False(room.TryGetProperty("description", out _));
        Assert.False(room.TryGetProperty("image", out _));
        Assert.False(room.TryGetProperty("amenityFeature", out _));
        Assert.DoesNotContain("House rules", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Parking —", html, StringComparison.Ordinal);
    }

    [Fact]
    public void The_document_invents_nothing_the_contract_does_not_carry()
    {
        // RoomDetailDto has no image dimensions, no modification timestamp and no venue
        // description, and a room's open hours are availability rather than trading hours.
        var html = Listing(SeoFixtures.Listing(openHours:
            [new DayOpenHoursDto("monday", [new OpenWindowDto("09:00", "17:00")])]));

        Assert.DoesNotContain("openingHours", html, StringComparison.Ordinal);
        Assert.DoesNotContain("dateModified", html, StringComparison.Ordinal);
        Assert.DoesNotContain("og:image:width", html, StringComparison.Ordinal);
    }

    // ---- boot payload -----------------------------------------------------------------------

    [Fact]
    public void The_boot_payload_is_the_wire_dto_verbatim()
    {
        var listing = SeoFixtures.Listing(rating: new RatingSummaryDto(4.5, 3));

        using var bootstrap = SeoFixtures.Bootstrap(Listing(listing));

        var root = bootstrap.RootElement;
        Assert.Equal(listing.RoomSlug, root.GetProperty("roomSlug").GetString());
        Assert.Equal(listing.RoomName, root.GetProperty("roomName").GetString());
        Assert.Equal(listing.Capacity, root.GetProperty("capacity").GetInt32());
        Assert.Equal("dunn-loring-umc", root.GetProperty("venue").GetProperty("slug").GetString());
        Assert.Equal("instant", root.GetProperty("bookingMode").GetString());
        Assert.Equal(3, root.GetProperty("rating").GetProperty("count").GetInt32());
        Assert.Equal("stepFreeAccess", root.GetProperty("accessibility")[0].GetString());
    }

    // ---- hostile text -----------------------------------------------------------------------

    [Fact]
    public void Host_text_cannot_escape_the_node_it_sits_in()
    {
        const string RoomName = "Hall \"A\" <b>&</b> annex";
        const string Description = "Bring your own kit </script><script>alert('x')</script> & tidy up.";
        const string Caption = "The hall, \"as it stands\" <today>";

        var html = Listing(SeoFixtures.Listing(
            roomName: RoomName,
            description: Description,
            houseRules: "No <marquee> decorations & no glitter.",
            venueName: "St Andrew's & All Saints",
            photos: [SeoFixtures.Photo(caption: Caption)]));

        // Exactly three scripts leave this renderer: structured data, the boot payload, the handoff.
        Assert.Equal(3, SeoFixtures.Count(html, "<script"));
        Assert.Equal(3, SeoFixtures.Count(html, "</script>"));
        Assert.DoesNotContain("alert('x')", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<b>", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<marquee>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;b&gt;", html, StringComparison.Ordinal);

        // The values survive intact inside the blocks that own them — encoded, not mangled.
        using var graph = SeoFixtures.Graph(html);
        Assert.Equal(RoomName, SeoFixtures.Node(graph, "Place").GetProperty("name").GetString());
        Assert.Equal(Description, SeoFixtures.Node(graph, "Place").GetProperty("description").GetString());

        using var bootstrap = SeoFixtures.Bootstrap(html);
        Assert.Equal(RoomName, bootstrap.RootElement.GetProperty("roomName").GetString());
        Assert.Equal(Caption, bootstrap.RootElement.GetProperty("photos")[0].GetProperty("caption").GetString());
    }

    [Fact]
    public void Hostile_text_in_an_attribute_cannot_open_a_second_attribute()
    {
        // The danger is the quote, not the word: encoded, the caption stays inside its own alt=""
        // and never becomes a second attribute the browser would act on.
        var html = Listing(SeoFixtures.Listing(
            photos: [SeoFixtures.Photo(caption: "\" onerror=\"alert(1)")]));

        Assert.DoesNotContain("\" onerror=\"", html, StringComparison.Ordinal);
        Assert.Contains("alt=\"&quot; onerror=&quot;alert(1)\"", html, StringComparison.Ordinal);
    }

    // ---- the visible page -------------------------------------------------------------------

    [Fact]
    public void The_body_says_in_words_everything_the_metadata_claims()
    {
        var html = Listing(SeoFixtures.Listing(rating: new RatingSummaryDto(4.5, 3)));

        Assert.Contains("<h1 class=\"rd__title\">Art Studio</h1>", html, StringComparison.Ordinal);
        Assert.Contains("at Dunn Loring United Methodist Church", html, StringComparison.Ordinal);
        Assert.Contains("$30/hr", html, StringComparison.Ordinal);
        Assert.Contains("Seats 24", html, StringComparison.Ordinal);
        Assert.Contains("4.5", html, StringComparison.Ordinal);
        Assert.Contains("2316 Gallows Road, Dunn Loring, 22027", html, StringComparison.Ordinal);
        Assert.Contains("Wipe-clean studio with sinks", html, StringComparison.Ordinal);
        Assert.Contains("Step-free access", html, StringComparison.Ordinal);
        Assert.Contains("Air conditioning", html, StringComparison.Ordinal);
        Assert.Contains("Request this space", html, StringComparison.Ordinal);
    }

    [Fact]
    public void No_wire_token_is_ever_printed_raw()
    {
        // The boot payload is the wire DTO and keeps its tokens by definition; nothing a person or
        // a crawler reads as a name may be one.
        var html = Listing(SeoFixtures.Listing());
        var readable = html[html.IndexOf("<body", StringComparison.Ordinal)..];

        Assert.DoesNotContain("stepFreeAccess", readable, StringComparison.Ordinal);
        Assert.DoesNotContain("airConditioning", readable, StringComparison.Ordinal);
        Assert.DoesNotContain("accessibleRestroom", readable, StringComparison.Ordinal);

        using var graph = SeoFixtures.Graph(html);
        var names = SeoFixtures.Node(graph, "Place").GetProperty("amenityFeature").EnumerateArray()
            .Select(f => f.GetProperty("name").GetString()!);
        var tokens = new HashSet<string> { "stepFreeAccess", "airConditioning", "accessibleRestroom" };
        Assert.All(names, name => Assert.DoesNotContain(name, tokens));
    }

    [Fact]
    public void The_document_never_styles_anything_beyond_its_own_body()
    {
        // The head survives the P2 handoff, so a bare selector here would silently restyle the
        // application (CLAUDE.md's shared-class-name hazard, in stylesheet form).
        var html = Listing(SeoFixtures.Listing());
        var start = html.IndexOf("<style>", StringComparison.Ordinal);
        var css = html[start..html.IndexOf("</style>", start, StringComparison.Ordinal)];

        Assert.Equal("<body class=\"rd-body\">", ExtractBodyTag(html));
        foreach (var rule in css["<style>".Length..].Split('}', StringSplitOptions.RemoveEmptyEntries))
        {
            var selector = rule.Split('{')[0].Trim();
            if (selector.Length == 0)
            {
                continue;
            }

            Assert.StartsWith("body.rd-body", selector, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void A_listing_is_revalidated_never_reused_blind()
    {
        var document = _renderer.RenderListing(SeoFixtures.Root, SeoFixtures.Listing());

        Assert.Equal(200, document.StatusCode);
        Assert.Equal("no-cache", document.CacheControl);
        Assert.Null(document.Robots);
    }

    // ---- the not-found document -------------------------------------------------------------

    [Fact]
    public void The_not_found_document_is_a_designed_page_that_leaks_no_reason()
    {
        var document = _renderer.RenderListingNotFound(SeoFixtures.Root);

        Assert.Equal(404, document.StatusCode);
        Assert.Equal("no-cache", document.CacheControl);
        Assert.Equal("noindex", document.Robots);

        var html = document.Html;
        Assert.Contains("This space isn't available", html, StringComparison.Ordinal);
        Assert.Contains("Browse spaces", html, StringComparison.Ordinal);
        Assert.Contains("Steeple home", html, StringComparison.Ordinal);
        Assert.Equal("noindex", SeoFixtures.MetaName(html, "robots"));

        // Nothing to index, nothing to prime, nothing to hand over.
        Assert.Null(SeoFixtures.Canonical(html));
        Assert.DoesNotContain("application/ld+json", html, StringComparison.Ordinal);
        Assert.DoesNotContain("steeple-listing-bootstrap", html, StringComparison.Ordinal);
        Assert.DoesNotContain("route-handoff.js", html, StringComparison.Ordinal);

        // No word for why: Draft, unlisted, out of area and never-existed read the same.
        foreach (var leak in new[] { "draft", "unlisted", "geofence", "moderation", "review", "area" })
        {
            Assert.DoesNotContain(leak, html, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void The_not_found_document_keeps_the_deployment_prefix()
    {
        var html = _renderer.RenderListingNotFound(SeoFixtures.Prefixed).Html;

        Assert.Contains("<base href=\"/steeple/\">", html, StringComparison.Ordinal);
        Assert.Contains("href=\"/steeple/browse\"", html, StringComparison.Ordinal);
    }

    private static string ExtractBodyTag(string html)
    {
        var start = html.IndexOf("<body", StringComparison.Ordinal);
        return html[start..(html.IndexOf('>', start) + 1)];
    }
}
