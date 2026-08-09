using System.Text.Json;

namespace Steeple.Api.Tests.Services.Seo;

/// <summary>
/// The API's half of one shared table (<c>tests/fixtures/seo-formats.json</c>).
/// </summary>
/// <remarks>
/// A listing is described twice — here, in the document a crawler reads, and again in the browser
/// when the app moves between rooms without asking for another document (web v2's
/// <c>src/ui/metaText.js</c>). If the two drift, the same URL has two titles depending on how
/// somebody arrived at it. Neither implementation is the other's source of truth: the table is,
/// and <c>src/Steeple.Web.v2/tools/metadata-test.mjs</c> asserts the same rows from the other side.
/// </remarks>
public class SeoFormatGoldenTests
{
    private static readonly JsonDocument Table = JsonDocument.Parse(File.ReadAllText(TablePath()));

    public static TheoryData<int> ListingCases() => Rows("listings");

    public static TheoryData<int> MoneyCases() => Rows("money");

    [Theory]
    [MemberData(nameof(ListingCases))]
    public void Listing_title_and_description_match_the_shared_table(int index)
    {
        var row = Table.RootElement.GetProperty("listings")[index];
        var listing = SeoFixtures.Listing(
            roomName: row.GetProperty("roomName").GetString()!,
            description: row.GetProperty("description").GetString()!,
            capacity: row.GetProperty("capacity").GetInt32(),
            pricePerHour: row.GetProperty("pricePerHour").GetDecimal(),
            currency: row.GetProperty("currency").GetString()!,
            venueName: row.GetProperty("venueName").GetString()!,
            suburb: row.GetProperty("suburb").GetString()!);

        Assert.Equal(row.GetProperty("title").GetString(), WebDocumentRenderer.ListingTitle(listing));
        Assert.Equal(
            row.GetProperty("metaDescription").GetString(),
            WebDocumentRenderer.ListingDescription(listing));
    }

    [Theory]
    [MemberData(nameof(MoneyCases))]
    public void Money_and_rate_match_the_shared_table(int index)
    {
        var row = Table.RootElement.GetProperty("money")[index];
        var amount = row.GetProperty("amount").GetDecimal();
        var currency = row.GetProperty("currency").GetString()!;

        Assert.Equal(row.GetProperty("money").GetString(), SeoText.Money(amount, currency));
        Assert.Equal(row.GetProperty("rate").GetString(), SeoText.Rate(amount, currency));
    }

    [Fact]
    public void Every_token_label_matches_the_shared_table()
    {
        foreach (var family in Table.RootElement.GetProperty("labels").EnumerateObject())
        {
            if (family.Name == "//")
            {
                continue;
            }

            foreach (var entry in family.Value.EnumerateObject())
            {
                if (entry.Name == "//")
                {
                    continue;
                }

                Assert.Equal(entry.Value.GetString(), SeoText.Label(entry.Name));
            }
        }
    }

    /// <summary>The visible listing document prints labels, never the raw wire tokens.</summary>
    [Fact]
    public void Rendered_listing_prints_labels_rather_than_tokens()
    {
        var html = new WebDocumentRenderer()
            .RenderListing(SeoFixtures.Root, SeoFixtures.Listing(
                amenities: ["wifi", "audioVisual"],
                accessibility: ["stepFreeAccess"]))
            .Html;

        Assert.Contains("<li>Wi-Fi</li>", html, StringComparison.Ordinal);
        Assert.Contains("<li>Audio/visual</li>", html, StringComparison.Ordinal);
        Assert.Contains("<li>Step-free access</li>", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<li>Wifi</li>", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Step free access", html, StringComparison.Ordinal);
    }

    /// <summary>
    /// The unavailable page's words are the ones the app repeats inside a session, where no
    /// second response exists to be given (SEO-D10). A reload must not change the sentence.
    /// </summary>
    [Fact]
    public void Not_found_document_matches_the_shared_table()
    {
        var unavailable = Table.RootElement.GetProperty("unavailable");
        var html = new WebDocumentRenderer().RenderListingNotFound(SeoFixtures.Root).Html;
        var open = html.IndexOf("<title>", StringComparison.Ordinal) + "<title>".Length;
        var close = html.IndexOf("</title>", open, StringComparison.Ordinal);

        Assert.Equal(unavailable.GetProperty("title").GetString(), html[open..close]);
        foreach (var key in new[] { "heading", "prose", "browse", "home" })
        {
            Assert.Contains(unavailable.GetProperty(key).GetString()!, html, StringComparison.Ordinal);
        }
    }

    private static TheoryData<int> Rows(string property)
    {
        var data = new TheoryData<int>();
        for (var i = 0; i < Table.RootElement.GetProperty(property).GetArrayLength(); i++)
        {
            data.Add(i);
        }

        return data;
    }

    /// <summary>
    /// The table lives at the repository root, not beside either implementation — it belongs to
    /// neither. Walked to rather than copied so a stale <c>bin/</c> copy can never be what a green
    /// run asserted against.
    /// </summary>
    private static string TablePath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "tests", "fixtures", "seo-formats.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException(
            $"tests/fixtures/seo-formats.json was not found above {AppContext.BaseDirectory}. "
            + "It is the shared SEO format table and both suites read it in place.",
            "tests/fixtures/seo-formats.json");
    }
}
