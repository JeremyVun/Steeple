using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Unicode;

namespace Steeple.Api.Services.Seo;

/// <summary>
/// The listing document and its not-found counterpart (docs/contracts/seo.md SEO-D3, D5,
/// D7–D10). A crawler, a scraper and a person with JavaScript switched off all read this response
/// and nothing else, so it carries the whole listing in words before any script runs.
/// </summary>
/// <remarks>
/// <para>
/// Two rules hold the document together. Every visible value and attribute goes through
/// <see cref="HtmlEncoder"/>; every script-shaped block (JSON-LD, the boot payload) is produced by
/// <see cref="JsonSerializer"/> with its HTML-safe encoder, so <c>&lt;/script&gt;</c> typed into a
/// house-rules box leaves as <c></script></c> and cannot close its own node.
/// </para>
/// <para>
/// It also says only what <see cref="RoomDetailDto"/> knows. The contract carries no image
/// dimensions, no modification timestamp and no venue description, and a room's open hours are
/// availability rather than business opening hours — none of those are invented here.
/// </para>
/// </remarks>
public sealed class WebDocumentRenderer : IWebDocumentRenderer
{
    /// <summary>Cache policy for both documents: publication and takedown must show up promptly (design §8).</summary>
    private const string NoCache = "no-cache";

    private const string SiteName = "Steeple";

    /// <summary>Meta descriptions are cut here — beyond it search engines write their own.</summary>
    private const int DescriptionMaxLength = 160;

    /// <summary>
    /// The served area is within the United States, and a
    /// <c>PostalAddress</c> without a country is not much of an address. If Steeple ever serves a
    /// second country this becomes geofence configuration, not a constant.
    /// </summary>
    private const string AddressCountry = "US";

    /// <summary>
    /// Escapes what HTML reserves — <c>&lt; &gt; &amp; " '</c> — and leaves the rest of Unicode
    /// alone. The default encoder also escapes every non-ASCII character, which would turn the
    /// title's own middle dot and any host's curly quote into numeric entities in the one document
    /// a person may end up reading in view-source.
    /// </summary>
    private static readonly HtmlEncoder Encoder = HtmlEncoder.Create(UnicodeRanges.All);

    /// <summary>
    /// Structured data. Optional values are omitted when the graph is built rather than by an
    /// ignore condition: <see cref="JsonIgnoreCondition.WhenWritingNull"/> governs object
    /// properties and never reaches the values of a dictionary, which is what these nodes are.
    /// </summary>
    private static readonly JsonSerializerOptions LinkedDataJson = new();

    /// <summary>The boot payload is the wire DTO verbatim — same casing, same encoder, same shape (SEO-D5).</summary>
    private static readonly JsonSerializerOptions BootstrapJson = new(JsonSerializerDefaults.Web);

    /// <inheritdoc />
    public WebDocument RenderListing(PublicBase publicBase, RoomDetailDto listing)
    {
        var venue = listing.Venue;
        var canonical = publicBase.Absolute(ListingPath(venue.Slug, listing.RoomSlug));
        var photos = OrderedPhotos(listing);
        var cover = photos.FirstOrDefault();
        var title = ListingTitle(listing);
        var description = ListingDescription(listing);

        var html = new StringBuilder(8192);
        OpenDocument(html, publicBase, title);

        Meta(html, "description", description);
        Link(html, "canonical", canonical);
        Meta(html, "robots", "index,follow");

        Property(html, "og:type", "place");
        Property(html, "og:site_name", SiteName);
        Property(html, "og:title", title);
        Property(html, "og:description", description);
        Property(html, "og:url", canonical);
        if (cover is not null)
        {
            Property(html, "og:image", publicBase.AbsoluteMedia(cover.Url));
            Property(html, "og:image:alt", PhotoAlt(cover, listing));
        }

        // A card with no picture in it is a summary card; claiming the large-image card would leave
        // a scraper reserving space for a photograph that does not exist.
        Meta(html, "twitter:card", cover is null ? "summary" : "summary_large_image");
        Meta(html, "twitter:title", title);
        Meta(html, "twitter:description", description);
        if (cover is not null)
        {
            Meta(html, "twitter:image", publicBase.AbsoluteMedia(cover.Url));
        }

        html.Append("<script type=\"application/ld+json\" data-steeple-route-meta>")
            .Append(JsonSerializer.Serialize(BuildGraph(publicBase, listing, canonical, photos), LinkedDataJson))
            .Append("</script>");

        // The listing steeple already answered with, inert, so the app that replaces this body
        // does not ask the same question again (SEO-D5). Public contract data only.
        html.Append("<script id=\"steeple-listing-bootstrap\" type=\"application/json\">")
            .Append(JsonSerializer.Serialize(listing, BootstrapJson))
            .Append("</script>");

        // The bridge to the ordinary Vite shell (SEO-D4). External, deferred, and the only script
        // here: both blocks above are inert data the CSP never has to allow.
        html.Append("<script src=\"").Append(Attribute(publicBase.Path("route-handoff.js")))
            .Append("\" data-base=\"").Append(Attribute(publicBase.BasePath))
            .Append("\" data-shell=\"").Append(Attribute(publicBase.Path("index.html")))
            .Append("\" defer></script>");

        html.Append("</head><body class=\"rd-body\">");
        AppendListingBody(html, publicBase, listing, photos);
        html.Append("</body></html>");

        return new WebDocument(StatusCodes.Status200OK, html.ToString(), NoCache, Robots: null);
    }

    /// <inheritdoc />
    public WebDocument RenderListingNotFound(PublicBase publicBase)
    {
        var html = new StringBuilder(2048);
        OpenDocument(html, publicBase, $"Space unavailable · {SiteName}");

        // No canonical, no structured data, no boot payload and no handoff: there is nothing here
        // to index, prime or hand over (SEO-D10).
        Meta(html, "robots", "noindex");

        html.Append("</head><body class=\"rd-body\">")
            .Append("<div id=\"steeple-route-document\" class=\"rd rd--empty\" data-steeple-route-document=\"listing-unavailable\">");
        AppendMasthead(html, publicBase);
        html.Append("<main class=\"rd__main\">")
            .Append("<h1 class=\"rd__title\">This space isn't available</h1>")
            .Append("<p class=\"rd__prose\">The link may be out of date, or the space may have been taken off Steeple. ")
            .Append("There are other spaces nearby.</p>")
            .Append("<p class=\"rd__actions\">")
            .Append(Anchor(publicBase.Path("browse"), "Browse spaces", "rd__cta"))
            .Append(Anchor(publicBase.BasePath, "Steeple home", "rd__link"))
            .Append("</p></main>");
        AppendColophon(html);
        html.Append("</div></body></html>");

        return new WebDocument(StatusCodes.Status404NotFound, html.ToString(), NoCache, Robots: "noindex");
    }

    /// <inheritdoc />
    public string RenderRobots(PublicBase publicBase) =>
        $"""
        # Steeple — crawl policy (docs/contracts/seo.md).
        #
        # Everything here is meant to be found: discovery is the demand-side cold start,
        # and every listing is a page somebody might share. There is nothing to keep a
        # crawler out of on this surface — v1's disallow rules were about its faceted
        # /search URLs and its id→slug redirects, and this app has neither. Nothing
        # private is defended here either: authorization is the boundary, and blocking a
        # crawler does not make a URL secret.
        #
        # The API writes this file rather than the bundle shipping it, for the last line
        # alone. The sitemaps.org protocol reads Sitemap: as a fully-qualified URL and
        # ignores a relative one, autodiscovery is how this deployment's sitemap is
        # found at all, and only the API knows the origin the public reaches it at
        # (Seo:PublicBaseUrl — docs/contracts/seo.md). The edge aliases
        # /robots.txt onto this route exactly as it aliases /sitemap.xml — see nginx.conf.

        User-agent: *
        Allow: /

        Sitemap: {publicBase.Absolute("sitemap.xml")}

        """;

    /// <summary>The canonical path of a listing, relative to the deployment root (SEO-D9).</summary>
    public static string ListingPath(string venueSlug, string roomSlug) =>
        $"space/{Uri.EscapeDataString(venueSlug)}/{Uri.EscapeDataString(roomSlug)}";

    /// <summary>
    /// <c>{Room} at {Venue}, {Suburb} · Steeple</c> (SEO-D7). The suburb is dropped rather than
    /// written as an empty gap when a venue has none.
    /// </summary>
    public static string ListingTitle(RoomDetailDto listing)
    {
        var where = SeoText.Squash(listing.Venue.Suburb);
        var place = where.Length == 0
            ? SeoText.Squash(listing.Venue.Name)
            : $"{SeoText.Squash(listing.Venue.Name)}, {where}";
        return $"{SeoText.Squash(listing.RoomName)} at {place} · {SiteName}";
    }

    /// <summary>
    /// One factual line: the space, the venue, the suburb, what it holds and what it costs, with
    /// as much of the host's own description as fits. Whitespace-normalized and length-bounded.
    /// </summary>
    public static string ListingDescription(RoomDetailDto listing)
    {
        var suburb = SeoText.Squash(listing.Venue.Suburb);
        var facts = new StringBuilder()
            .Append(SeoText.Squash(listing.RoomName))
            .Append(" at ")
            .Append(SeoText.Squash(listing.Venue.Name));
        if (suburb.Length > 0)
        {
            facts.Append(" in ").Append(suburb);
        }

        facts.Append(". Seats ").Append(listing.Capacity.ToString(CultureInfo.InvariantCulture))
            .Append(", ").Append(SeoText.Rate(listing.PricePerHour, listing.Currency)).Append('.');

        var prose = SeoText.Squash(listing.Description);
        // Only add the host's words when there is room for a readable clause of them, not a stub.
        if (prose.Length > 0 && facts.Length + 32 < DescriptionMaxLength)
        {
            facts.Append(' ').Append(prose);
        }

        return SeoText.Clip(facts.ToString(), DescriptionMaxLength);
    }

    // ---- document scaffolding -------------------------------------------------------------

    /// <summary>
    /// Everything both documents share, up to the point where their metadata diverges. The
    /// <c>&lt;base&gt;</c> is prefix-aware and comes first, so a stripped-prefix deployment
    /// resolves every relative URL the app later adds under its own prefix (design §7).
    /// </summary>
    private static void OpenDocument(StringBuilder html, PublicBase publicBase, string title)
    {
        html.Append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
            .Append("<base href=\"").Append(Attribute(publicBase.BasePath)).Append("\">")
            .Append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
            .Append("<title>").Append(Text(title)).Append("</title>")
            .Append("<meta name=\"theme-color\" content=\"#fbf7f0\">");

        // Enough of the design system to make an unstyled-by-P2 document presentable, every rule
        // scoped under body.rd-body so none of it can reach the application: this <style> survives
        // the body handoff, and the app drops the class (see docs/contracts/seo.md SEO-D4).
        html.Append("<style>")
            .Append("body.rd-body{margin:0;background:#FBF7F0;color:#2A2620;")
            .Append("font:16px/1.65 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif}")
            .Append("body.rd-body .rd{max-width:44rem;margin:0 auto;padding:26px 20px 72px}")
            .Append("body.rd-body .rd__brand{font:600 20px/1.2 \"Iowan Old Style\",Palatino,Georgia,serif;")
            .Append("letter-spacing:-.01em;color:#2A2620;text-decoration:none}")
            .Append("body.rd-body .rd__title{font:600 30px/1.2 \"Iowan Old Style\",Palatino,Georgia,serif;")
            .Append("letter-spacing:-.01em;margin:28px 0 6px}")
            .Append("body.rd-body .rd__at{margin:0;color:#5C544A}")
            .Append("body.rd-body .rd__headline{margin:14px 0 0;font-size:17px}")
            .Append("body.rd-body .rd__price{font:600 20px/1 \"Iowan Old Style\",Palatino,Georgia,serif}")
            .Append("body.rd-body .rd__figure{margin:22px 0 0}")
            .Append("body.rd-body .rd__photo{display:block;width:100%;height:auto;border-radius:10px;background:#F3ECE0}")
            .Append("body.rd-body .rd__caption{margin:6px 0 0;font-size:13px;color:#6B6253}")
            .Append("body.rd-body .rd__prose{margin:18px 0 0;max-width:38rem}")
            .Append("body.rd-body .rd__block{margin:26px 0 0;padding:0 0 22px;border-bottom:1px solid #E6DECF}")
            .Append("body.rd-body .rd__eyebrow{margin:0 0 8px;font-size:12px;letter-spacing:.08em;")
            .Append("text-transform:uppercase;color:#6B6253}")
            .Append("body.rd-body .rd__list{margin:0;padding:0;list-style:none}")
            .Append("body.rd-body .rd__list li{padding:2px 0}")
            .Append("body.rd-body .rd__actions{margin:30px 0 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap}")
            .Append("body.rd-body .rd__cta{display:inline-block;padding:11px 20px;border-radius:999px;")
            .Append("background:#B0552F;color:#fff;text-decoration:none;font-weight:600}")
            .Append("body.rd-body .rd__link{color:#A44D2E}")
            .Append("body.rd-body .rd__colophon{margin:44px 0 0;font-size:13px;color:#6B6253}")
            .Append("body.rd-body .rd__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}")
            .Append("</style>");

        // The designed stylesheet for these documents (P2 owns the file); the block above is what
        // holds until it lands, and what holds if it fails to load.
        html.Append("<link rel=\"stylesheet\" href=\"").Append(Attribute(publicBase.Path("route-document.css"))).Append("\">");
    }

    private static void AppendMasthead(StringBuilder html, PublicBase publicBase) =>
        html.Append("<header class=\"rd__masthead\">")
            .Append(Anchor(publicBase.BasePath, SiteName, "rd__brand"))
            .Append("</header>");

    private static void AppendColophon(StringBuilder html) =>
        html.Append("<footer class=\"rd__colophon\"><p>Steeple — community space near Washington, DC, by the hour.</p></footer>");

    private static void AppendListingBody(
        StringBuilder html,
        PublicBase publicBase,
        RoomDetailDto listing,
        IReadOnlyList<RoomPhotoDto> photos)
    {
        var venue = listing.Venue;

        html.Append("<div id=\"steeple-route-document\" class=\"rd\" data-steeple-route-document=\"listing\">");
        AppendMasthead(html, publicBase);
        html.Append("<main class=\"rd__main\">")
            .Append("<h1 class=\"rd__title\">").Append(Text(listing.RoomName)).Append("</h1>")
            .Append("<p class=\"rd__at\">at ").Append(Text(venue.Name));
        if (!string.IsNullOrWhiteSpace(venue.Suburb))
        {
            html.Append(" · ").Append(Text(venue.Suburb));
        }

        html.Append("</p>");

        html.Append("<p class=\"rd__headline\"><span class=\"rd__price\">")
            .Append(Text(SeoText.Rate(listing.PricePerHour, listing.Currency)))
            .Append("</span> · Seats ").Append(listing.Capacity.ToString(CultureInfo.InvariantCulture));

        // Nothing at all until a space has a revealed rating: absence of signal is not a zero.
        if (listing.Rating is { Count: > 0 } rating)
        {
            html.Append(" · <span class=\"rd__sr\">Rated </span><span aria-hidden=\"true\">★</span> ")
                .Append(Text(rating.AverageStars.ToString("0.0", CultureInfo.InvariantCulture)))
                .Append(" · ").Append(rating.Count.ToString(CultureInfo.InvariantCulture))
                .Append(rating.Count == 1 ? " rating" : " ratings");
        }

        html.Append("</p>");

        if (photos.Count > 0)
        {
            var cover = photos[0];
            html.Append("<figure class=\"rd__figure\"><img class=\"rd__photo\" src=\"")
                .Append(Attribute(publicBase.AbsoluteMedia(cover.CardUrl ?? cover.Url)))
                .Append("\" alt=\"").Append(Attribute(PhotoAlt(cover, listing))).Append("\">");
            if (!string.IsNullOrWhiteSpace(cover.Caption))
            {
                html.Append("<figcaption class=\"rd__caption\">").Append(Text(cover.Caption)).Append("</figcaption>");
            }

            html.Append("</figure>");
        }

        if (!string.IsNullOrWhiteSpace(listing.Description))
        {
            html.Append("<p class=\"rd__prose\">").Append(Text(listing.Description)).Append("</p>");
        }

        AppendTokenBlock(html, "Accessibility", listing.Accessibility);
        AppendTokenBlock(html, "Amenities", listing.Amenities);
        AppendTokenBlock(html, "Welcomes", listing.Activities);

        if (!string.IsNullOrWhiteSpace(listing.HouseRules))
        {
            html.Append("<section class=\"rd__block\"><h2 class=\"rd__eyebrow\">House rules</h2>")
                .Append("<p class=\"rd__prose\">").Append(Text(listing.HouseRules)).Append("</p></section>");
        }

        html.Append("<section class=\"rd__block\"><h2 class=\"rd__eyebrow\">Where</h2>")
            .Append("<p class=\"rd__prose\">").Append(Text(Address(venue))).Append("</p>");
        if (!string.IsNullOrWhiteSpace(venue.ParkingInfo))
        {
            html.Append("<p class=\"rd__prose\">Parking — ").Append(Text(venue.ParkingInfo)).Append("</p>");
        }

        if (!string.IsNullOrWhiteSpace(venue.TransitInfo))
        {
            html.Append("<p class=\"rd__prose\">Getting there — ").Append(Text(venue.TransitInfo)).Append("</p>");
        }

        html.Append("</section>");

        html.Append("<p class=\"rd__actions\">")
            .Append(Anchor(
                publicBase.Path($"apply/{Uri.EscapeDataString(venue.Slug)}/{Uri.EscapeDataString(listing.RoomSlug)}"),
                "Request this space",
                "rd__cta"))
            .Append(Anchor(publicBase.Path("browse"), "All spaces", "rd__link"))
            .Append("</p></main>");
        AppendColophon(html);
        html.Append("</div>");
    }

    private static void AppendTokenBlock(StringBuilder html, string heading, IReadOnlyList<string> tokens)
    {
        if (tokens.Count == 0)
        {
            return;
        }

        html.Append("<section class=\"rd__block\"><h2 class=\"rd__eyebrow\">").Append(Text(heading))
            .Append("</h2><ul class=\"rd__list\">");
        foreach (var token in tokens)
        {
            html.Append("<li>").Append(Text(SeoText.Label(token))).Append("</li>");
        }

        html.Append("</ul></section>");
    }

    // ---- structured data ------------------------------------------------------------------

    /// <summary>
    /// The <c>@graph</c> of SEO-D8: the site, the room as a <c>Place</c> inside its venue, the
    /// hourly <c>Offer</c> and a two-step breadcrumb. Amenity and accessibility facts are
    /// <c>LocationFeatureSpecification</c> entries — <c>accessibilityFeature</c> is about media
    /// content and <c>isAccessibleForFree</c> is about admission price, so neither describes a
    /// step-free door.
    /// </summary>
    private static object BuildGraph(
        PublicBase publicBase,
        RoomDetailDto listing,
        string canonical,
        IReadOnlyList<RoomPhotoDto> photos)
    {
        var venue = listing.Venue;
        var home = publicBase.Absolute(string.Empty);

        var address = new Dictionary<string, object?> { ["@type"] = "PostalAddress" };
        PutIfPresent(address, "streetAddress", NullIfBlank(venue.AddressLine));
        PutIfPresent(address, "addressLocality", NullIfBlank(venue.Suburb));
        PutIfPresent(address, "postalCode", NullIfBlank(venue.Postcode));
        address["addressCountry"] = AddressCountry;

        var features = listing.Amenities.Concat(listing.Accessibility)
            .Select(token => (object)new Dictionary<string, object?>
            {
                ["@type"] = "LocationFeatureSpecification",
                ["name"] = SeoText.Label(token),
                ["value"] = true,
            })
            .ToList();

        var venueNode = new Dictionary<string, object?>
        {
            // A church venue is a PlaceOfWorship; everything else is a plain Place.
            ["@type"] = string.Equals(venue.VenueType, "church", StringComparison.OrdinalIgnoreCase)
                ? "PlaceOfWorship"
                : "Place",
            ["@id"] = canonical + "#venue",
            ["name"] = venue.Name,
            ["address"] = address,
        };

        // The public rating aggregate is the venue's, across all its rooms — so it is stated of the
        // venue. Saying it of the room would claim reviews of a room nobody rated separately.
        if (listing.Rating is { Count: > 0 } rating)
        {
            venueNode["aggregateRating"] = new Dictionary<string, object?>
            {
                ["@type"] = "AggregateRating",
                ["ratingValue"] = Math.Round(rating.AverageStars, 1),
                ["ratingCount"] = rating.Count,
                ["bestRating"] = 5,
                ["worstRating"] = 1,
            };
        }

        var room = new Dictionary<string, object?>
        {
            ["@type"] = "Place",
            ["@id"] = canonical + "#room",
            ["name"] = listing.RoomName,
        };
        PutIfPresent(room, "description", NullIfBlank(SeoText.Squash(listing.Description)));
        room["url"] = canonical;
        PutIfPresent(
            room,
            "image",
            photos.Count == 0 ? null : photos.Select(p => publicBase.AbsoluteMedia(p.Url)).ToArray());
        room["address"] = address;
        room["geo"] = new Dictionary<string, object?>
        {
            ["@type"] = "GeoCoordinates",
            ["latitude"] = venue.Latitude,
            ["longitude"] = venue.Longitude,
        };
        room["maximumAttendeeCapacity"] = listing.Capacity;
        PutIfPresent(room, "amenityFeature", features.Count == 0 ? null : features);
        room["containedInPlace"] = venueNode;

        var price = Normalize(listing.PricePerHour);
        var hour = new Dictionary<string, object?>
        {
            ["@type"] = "QuantitativeValue",
            ["value"] = 1,
            ["unitCode"] = "HUR",
            ["unitText"] = "hour",
        };

        var offer = new Dictionary<string, object?>
        {
            ["@type"] = "Offer",
            ["@id"] = canonical + "#offer",
            ["url"] = canonical,
            ["price"] = price,
            ["priceCurrency"] = listing.Currency,
            // The room is where this offer is taken up; the offer is not the room.
            ["availableAtOrFrom"] = new Dictionary<string, object?> { ["@id"] = canonical + "#room" },
            ["priceSpecification"] = new Dictionary<string, object?>
            {
                ["@type"] = "UnitPriceSpecification",
                ["price"] = price,
                ["priceCurrency"] = listing.Currency,
                ["unitCode"] = "HUR",
                ["unitText"] = "hour",
                ["referenceQuantity"] = hour,
            },
        };

        // Steeple → this room. No venue step: /venue/{slug} is deliberately noindex and client-only,
        // and a breadcrumb must not point a crawler at a page it is told not to index (SEO-D8).
        var breadcrumb = new Dictionary<string, object?>
        {
            ["@type"] = "BreadcrumbList",
            ["@id"] = canonical + "#breadcrumb",
            ["itemListElement"] = new object[]
            {
                new Dictionary<string, object?>
                {
                    ["@type"] = "ListItem",
                    ["position"] = 1,
                    ["name"] = SiteName,
                    ["item"] = home,
                },
                new Dictionary<string, object?>
                {
                    ["@type"] = "ListItem",
                    ["position"] = 2,
                    ["name"] = $"{SeoText.Squash(listing.RoomName)} at {SeoText.Squash(venue.Name)}",
                    ["item"] = canonical,
                },
            },
        };

        var website = new Dictionary<string, object?>
        {
            ["@type"] = "WebSite",
            ["@id"] = home + "#website",
            ["name"] = SiteName,
            ["url"] = home,
        };

        return new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@graph"] = new object[] { website, room, offer, breadcrumb },
        };
    }

    // ---- small helpers --------------------------------------------------------------------

    private static IReadOnlyList<RoomPhotoDto> OrderedPhotos(RoomDetailDto listing) =>
        listing.Photos.OrderByDescending(p => p.IsPrimary).ThenBy(p => p.SortOrder).ToList();

    /// <summary>
    /// A photograph's alternative text: the host's caption when there is one, otherwise what the
    /// picture is of. Never an empty alt on a content image, and never invented detail.
    /// </summary>
    private static string PhotoAlt(RoomPhotoDto photo, RoomDetailDto listing) =>
        string.IsNullOrWhiteSpace(photo.Caption)
            ? $"{SeoText.Squash(listing.RoomName)} at {SeoText.Squash(listing.Venue.Name)}"
            : SeoText.Squash(photo.Caption);

    private static string Address(VenueSummaryDto venue) =>
        string.Join(", ", new[] { venue.AddressLine, venue.Suburb, venue.Postcode }
            .Select(SeoText.Squash)
            .Where(part => part.Length > 0));

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>Adds a graph key only when there is something to say with it.</summary>
    private static void PutIfPresent(IDictionary<string, object?> node, string key, object? value)
    {
        if (value is not null)
        {
            node[key] = value;
        }
    }

    /// <summary>Drops trailing zeros so a price reads <c>30</c> rather than <c>30.00</c> in JSON.</summary>
    private static decimal Normalize(decimal amount) =>
        decimal.Parse(amount.ToString("0.############", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);

    private static string Text(string? value) => Encoder.Encode(value ?? string.Empty);

    private static string Attribute(string value) => Encoder.Encode(value);

    private static string Anchor(string href, string label, string cssClass) =>
        $"<a class=\"{cssClass}\" href=\"{Attribute(href)}\">{Text(label)}</a>";

    private static void Meta(StringBuilder html, string name, string content) =>
        html.Append("<meta name=\"").Append(Attribute(name)).Append("\" content=\"").Append(Text(content))
            .Append("\" data-steeple-route-meta>");

    private static void Property(StringBuilder html, string property, string content) =>
        html.Append("<meta property=\"").Append(Attribute(property)).Append("\" content=\"").Append(Text(content))
            .Append("\" data-steeple-route-meta>");

    private static void Link(StringBuilder html, string rel, string href) =>
        html.Append("<link rel=\"").Append(Attribute(rel)).Append("\" href=\"").Append(Attribute(href))
            .Append("\" data-steeple-route-meta>");
}
