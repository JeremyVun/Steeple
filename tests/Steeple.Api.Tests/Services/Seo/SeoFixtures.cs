using System.Text.Json;

namespace Steeple.Api.Tests.Services.Seo;

/// <summary>
/// Shared listing fixtures and document-reading helpers for the route-document tests. The
/// documents are read the way a crawler reads them — out of the response text — rather than
/// through a model the renderer might agree with and the wire not.
/// </summary>
internal static class SeoFixtures
{
    public const string Origin = "https://steeple.test";

    public static PublicBase Root => PublicBase.Parse(Origin);

    public static PublicBase Prefixed => PublicBase.Parse("https://example.com/steeple");

    public static RoomPhotoDto Photo(
        string url = "media/art-studio-1.jpg",
        string? caption = "Morning light in the studio",
        bool isPrimary = true,
        int sortOrder = 0,
        string? cardUrl = null) =>
        new(Guid.NewGuid(), url, ThumbUrl: null, CardUrl: cardUrl, Caption: caption, IsPrimary: isPrimary, SortOrder: sortOrder);

    public static RoomDetailDto Listing(
        string roomName = "Art Studio",
        string roomSlug = "art-studio",
        string description = "Wipe-clean studio with sinks, easels and abundant natural light.",
        string houseRules = "Cover tables before messy work.",
        int capacity = 24,
        decimal pricePerHour = 30m,
        string currency = "USD",
        string venueName = "Dunn Loring United Methodist Church",
        string venueSlug = "dunn-loring-umc",
        string venueType = "church",
        string suburb = "Dunn Loring",
        string addressLine = "2316 Gallows Road",
        string postcode = "22027",
        string parkingInfo = "Free on-site parking off Gallows Road.",
        string transitInfo = "Six minutes' walk from Dunn Loring Metro.",
        IReadOnlyList<string>? amenities = null,
        IReadOnlyList<string>? accessibility = null,
        IReadOnlyList<string>? activities = null,
        IReadOnlyList<RoomPhotoDto>? photos = null,
        RatingSummaryDto? rating = null,
        IReadOnlyList<DayOpenHoursDto>? openHours = null) =>
        new(
            RoomId: Guid.Parse("40000000-0000-0000-0000-000000000001"),
            RoomSlug: roomSlug,
            RoomName: roomName,
            Description: description,
            Capacity: capacity,
            PricePerHour: pricePerHour,
            Currency: currency,
            HouseRules: houseRules,
            Amenities: amenities ?? ["airConditioning", "parking"],
            Accessibility: accessibility ?? ["stepFreeAccess", "accessibleRestroom"],
            Activities: activities ?? ["children", "music"],
            Photos: photos ?? [Photo()],
            Venue: new VenueSummaryDto(
                VenueId: Guid.Parse("44444444-4444-4444-4444-444444444444"),
                Name: venueName,
                Slug: venueSlug,
                VenueType: venueType,
                AddressLine: addressLine,
                Suburb: suburb,
                Postcode: postcode,
                ContactEmail: "office@dunnloringumc.org",
                ParkingInfo: parkingInfo,
                TransitInfo: transitInfo,
                IsIdentityVerified: true,
                Latitude: 38.8989,
                Longitude: -77.2287),
            Rating: rating,
            OpenHours: openHours,
            BookingMode: "instant");

    /// <summary>The value of a <c>&lt;meta name=…&gt;</c> as written into the document.</summary>
    public static string? MetaName(string html, string name) =>
        AttributeAfter(html, $"<meta name=\"{name}\" content=\"");

    /// <summary>The value of a <c>&lt;meta property=…&gt;</c> (the Open Graph spelling).</summary>
    public static string? MetaProperty(string html, string property) =>
        AttributeAfter(html, $"<meta property=\"{property}\" content=\"");

    public static string? Canonical(string html) => AttributeAfter(html, "<link rel=\"canonical\" href=\"");

    /// <summary>The structured-data block, parsed. Throws if it is not valid JSON.</summary>
    public static JsonDocument Graph(string html) =>
        JsonDocument.Parse(Between(html, "<script type=\"application/ld+json\" data-steeple-route-meta>", "</script>"));

    /// <summary>The boot payload, parsed (SEO-D5).</summary>
    public static JsonDocument Bootstrap(string html) =>
        JsonDocument.Parse(Between(html, "<script id=\"steeple-listing-bootstrap\" type=\"application/json\">", "</script>"));

    /// <summary>The one node in the graph with the given <c>@type</c>.</summary>
    public static JsonElement Node(JsonDocument graph, string type) =>
        graph.RootElement.GetProperty("@graph").EnumerateArray()
            .Single(node => node.GetProperty("@type").GetString() == type);

    public static int Count(string haystack, string needle)
    {
        var count = 0;
        for (var i = haystack.IndexOf(needle, StringComparison.Ordinal); i >= 0;
             i = haystack.IndexOf(needle, i + needle.Length, StringComparison.Ordinal))
        {
            count++;
        }

        return count;
    }

    private static string Between(string html, string open, string close)
    {
        var start = html.IndexOf(open, StringComparison.Ordinal);
        Assert.True(start >= 0, $"document has no block opened by {open}");
        start += open.Length;
        var end = html.IndexOf(close, start, StringComparison.Ordinal);
        Assert.True(end > start, $"block opened by {open} is never closed");
        return html[start..end];
    }

    private static string? AttributeAfter(string html, string open)
    {
        var start = html.IndexOf(open, StringComparison.Ordinal);
        if (start < 0)
        {
            return null;
        }

        start += open.Length;
        var end = html.IndexOf('"', start);
        return html[start..end];
    }
}
