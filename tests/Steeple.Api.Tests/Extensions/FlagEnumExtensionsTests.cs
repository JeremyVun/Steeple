namespace Steeple.Api.Tests.Extensions;
/// <summary>
/// Unit tests for <see cref="FlagEnumExtensions"/>: the camelCase token round-trip
/// (<see cref="FlagEnumExtensions.ToCamelCaseToken"/>/<see cref="FlagEnumExtensions.ParseToken{TEnum}"/>)
/// and multi-token combination (<see cref="FlagEnumExtensions.CombineTokens{TEnum}"/>) used to parse
/// Manage module write requests (CONTRACTS §2 "Enums").
/// </summary>
public class FlagEnumExtensionsTests
{
    [Theory]
    [InlineData(AccessibilityFeature.StepFreeAccess, "stepFreeAccess")]
    [InlineData(AccessibilityFeature.AccessibleRestroom, "accessibleRestroom")]
    public void ParseToken_ValidToken_RoundTripsToTheOriginalMember(AccessibilityFeature member, string token)
    {
        Assert.Equal(token, FlagEnumExtensions.ToCamelCaseToken(member.ToString()));
        Assert.Equal(member, FlagEnumExtensions.ParseToken<AccessibilityFeature>(token));
    }

    [Fact]
    public void ParseToken_EveryFlagMemberRoundTrips()
    {
        foreach (var member in Enum.GetValues<Amenity>())
        {
            if (Convert.ToInt64(member) == 0)
            {
                continue; // None isn't a real flag/token
            }

            var token = FlagEnumExtensions.ToCamelCaseToken(member.ToString());
            Assert.Equal(member, FlagEnumExtensions.ParseToken<Amenity>(token));
        }
    }

    [Fact]
    public void ParseToken_UnknownToken_ReturnsNull() =>
        Assert.Null(FlagEnumExtensions.ParseToken<Amenity>("not-a-real-token"));

    [Fact]
    public void ParseToken_NullOrWhitespace_ReturnsNull()
    {
        Assert.Null(FlagEnumExtensions.ParseToken<Amenity>(null));
        Assert.Null(FlagEnumExtensions.ParseToken<Amenity>("   "));
    }

    [Fact]
    public void ParseToken_WrongCasing_IsRejected_TokensAreCaseSensitive() =>
        // ToCamelCaseToken only lowercases the first letter — a PascalCase submission should not match.
        Assert.Null(FlagEnumExtensions.ParseToken<Amenity>("WiFi"));

    [Fact]
    public void CombineTokens_AllValid_CombinesFlagsAndReportsNoUnknowns()
    {
        var tokenA = FlagEnumExtensions.ToCamelCaseToken(nameof(AccessibilityFeature.StepFreeAccess));
        var tokenB = FlagEnumExtensions.ToCamelCaseToken(nameof(AccessibilityFeature.AccessibleRestroom));

        var combined = FlagEnumExtensions.CombineTokens<AccessibilityFeature>([tokenA, tokenB], out var unknown);

        Assert.Empty(unknown);
        Assert.True(combined.HasFlag(AccessibilityFeature.StepFreeAccess));
        Assert.True(combined.HasFlag(AccessibilityFeature.AccessibleRestroom));
    }

    [Fact]
    public void CombineTokens_UnknownToken_IsRejectedNotSilentlyDropped()
    {
        var validToken = FlagEnumExtensions.ToCamelCaseToken(nameof(AccessibilityFeature.StepFreeAccess));

        var combined = FlagEnumExtensions.CombineTokens<AccessibilityFeature>(
            [validToken, "levitationPad"], out var unknown);

        var unknownToken = Assert.Single(unknown);
        Assert.Equal("levitationPad", unknownToken);
        // The valid token alongside it still gets parsed — only the bad one is rejected.
        Assert.True(combined.HasFlag(AccessibilityFeature.StepFreeAccess));
    }

    [Fact]
    public void CombineTokens_EmptyInput_ReturnsNoneWithNoUnknowns()
    {
        var combined = FlagEnumExtensions.CombineTokens<AccessibilityFeature>([], out var unknown);

        Assert.Empty(unknown);
        Assert.Equal(default, combined);
    }

    [Fact]
    public void CombineTokens_BlankEntriesAreIgnored_NotTreatedAsUnknown()
    {
        var combined = FlagEnumExtensions.CombineTokens<AccessibilityFeature>(["", "   "], out var unknown);

        Assert.Empty(unknown);
        Assert.Equal(default, combined);
    }
}
