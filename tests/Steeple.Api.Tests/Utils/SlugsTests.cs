namespace Steeple.Api.Tests.Utils;
/// <summary>
/// Unit tests for <see cref="Slugs"/>: diacritic folding, possessive handling, hyphen collapsing,
/// and the <see cref="Slugs.UniquifyAsync"/> probing sequence used by the Manage module.
/// </summary>
public class SlugsTests
{
    [Theory]
    [InlineData("St. Andrew's Hall", "st-andrews-hall")]
    [InlineData("Café Découverte", "cafe-decouverte")]
    [InlineData("Grace Community Church of Vienna", "grace-community-church-of-vienna")]
    [InlineData("  Leading and Trailing  ", "leading-and-trailing")]
    [InlineData("Multiple---Hyphens!!", "multiple-hyphens")]
    [InlineData("Naïve Résumé", "naive-resume")]
    public void From_ProducesExpectedSlug(string name, string expected) =>
        Assert.Equal(expected, Slugs.From(name));

    [Fact]
    public void From_PossessiveApostrophe_DropsRatherThanHyphenates() =>
        Assert.Equal("andrews", Slugs.From("Andrew's"));

    [Fact]
    public void From_CurlyApostrophe_AlsoDropped() =>
        Assert.Equal("andrews", Slugs.From("Andrew’s"));

    [Fact]
    public void From_LeftSingleQuotationMarkApostrophe_AlsoDropped() =>
        Assert.Equal("andrews", Slugs.From("Andrew‘s"));

    [Fact]
    public void From_ModifierLetterApostrophe_AlsoDropped() =>
        Assert.Equal("andrews", Slugs.From("Andrewʼs"));

    [Fact]
    public void From_PrimeApostrophe_AlsoDropped() =>
        Assert.Equal("andrews", Slugs.From("Andrew′s"));

    [Fact]
    public void From_NothingUsableSurvives_ReturnsEmptyString() =>
        Assert.Equal("", Slugs.From("!!! ??? ..."));

    [Fact]
    public void From_LongName_TruncatesToMaxLengthWithoutTrailingHyphen()
    {
        var longName = string.Join(" ", Enumerable.Repeat("word", 60)); // far past 150 chars
        var slug = Slugs.From(longName);

        Assert.True(slug.Length <= 150);
        Assert.False(slug.EndsWith('-'));
    }

    [Fact]
    public async Task UniquifyAsync_BaseSlugFree_ReturnsBaseSlugUnchanged()
    {
        var taken = new HashSet<string>();

        var result = await Slugs.UniquifyAsync("fellowship-hall", s => Task.FromResult(taken.Contains(s)));

        Assert.Equal("fellowship-hall", result);
    }

    [Fact]
    public async Task UniquifyAsync_BaseSlugTaken_ProbesSequentialSuffixes()
    {
        var taken = new HashSet<string> { "fellowship-hall", "fellowship-hall-2", "fellowship-hall-3" };

        var result = await Slugs.UniquifyAsync("fellowship-hall", s => Task.FromResult(taken.Contains(s)));

        Assert.Equal("fellowship-hall-4", result);
    }

    [Fact]
    public async Task UniquifyAsync_OnlyBaseSlugTaken_ReturnsFirstSuffix()
    {
        var taken = new HashSet<string> { "fellowship-hall" };

        var result = await Slugs.UniquifyAsync("fellowship-hall", s => Task.FromResult(taken.Contains(s)));

        Assert.Equal("fellowship-hall-2", result);
    }
}
