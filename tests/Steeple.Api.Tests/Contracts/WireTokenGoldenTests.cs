using System.Text.Json;
using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Tests.Contracts;

/// <summary>
/// API half of the golden wire-token contract. Persistence enum members are the source of truth;
/// every camelCase string the API serializes must be recorded in the shared fixture read by web
/// and mobile too.
/// </summary>
public class WireTokenGoldenTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void EveryApiWireEnumMemberMatchesTheGoldenTable()
    {
        var expected = LoadFixture().TokenSets;
        var actual = new Dictionary<string, IReadOnlyList<string>>
        {
            ["accessibilityFeatures"] = SerializedTokens<AccessibilityFeature>(excludeZero: true),
            ["activityTypes"] = SerializedTokens<ActivityType>(excludeZero: true),
            ["agreementDocumentTypes"] = SerializedTokens<AgreementDocType>(),
            ["amenities"] = SerializedTokens<Amenity>(excludeZero: true),
            ["applicationStatuses"] = SerializedTokens<ApplicationStatus>(),
            ["authProviders"] = SerializedTokens<AuthProvider>(),
            ["bookingModes"] = SerializedTokens<BookingMode>(),
            ["bookingReminderKinds"] = SerializedTokens<BookingReminderKind>(),
            ["bookingStatuses"] = SerializedTokens<BookingStatus>(),
            ["bookingTypes"] = SerializedTokens<BookingType>(),
            ["counterOfferStatuses"] = SerializedTokens<CounterOfferStatus>(),
            ["notificationTypes"] = SerializedTokens<NotificationType>(),
            ["occurrenceStatuses"] = SerializedTokens<OccurrenceStatus>(),
            ["paymentStatuses"] = SerializedTokens<PaymentStatus>(),
            ["ratingRateeTypes"] = SerializedTokens<RatingRateeType>(),
            ["roomStatuses"] = SerializedTokens<RoomStatus>(),
            ["scheduleFrequencies"] = SerializedTokens<ScheduleFrequency>(),
            ["venueTypes"] = SerializedTokens<VenueType>(),
            ["venueVerificationStatuses"] = VenueVerificationTokens.All,
            ["weekdays"] = SerializedTokens<Weekdays>(excludeZero: true),
        };

        Assert.Equal(expected.Keys.Order(), actual.Keys.Order());
        foreach (var (name, actualTokens) in actual)
        {
            Assert.Equal(expected[name].Order(), actualTokens.Order());
        }

        // Weekday order is itself a wire guarantee: Sunday first.
        Assert.Equal(expected["weekdays"], actual["weekdays"]);
    }

    [Fact]
    public void EveryApiFeatureFlagNameMatchesTheGoldenTable()
    {
        var expected = LoadFixture().FeatureFlags;

        Assert.Equal(expected.All, FeatureFlagKeys.All);
        Assert.Equal(expected.Public, FeatureFlagKeys.Public);
        Assert.Equal(FeatureFlagKeys.Public, PublicFlagsService.PublicFlagKeys);
    }

    private static IReadOnlyList<string> SerializedTokens<TEnum>(bool excludeZero = false)
        where TEnum : struct, Enum =>
        Enum.GetValues<TEnum>()
            .Where(value => !excludeZero || Convert.ToInt64(value) != 0)
            .Select(value => FlagEnumExtensions.ToCamelCaseToken(value.ToString()))
            // DTOs carry projected strings; round-tripping each through the API's web defaults
            // proves the bytes clients receive, not only the pre-serialization helper result.
            .Select(token => JsonSerializer.Deserialize<string>(JsonSerializer.Serialize(token, JsonOptions), JsonOptions)!)
            .ToList();

    private static WireTokenFixture LoadFixture()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "tests", "fixtures", "wire-tokens.json");
            if (File.Exists(candidate))
            {
                return JsonSerializer.Deserialize<WireTokenFixture>(File.ReadAllText(candidate), JsonOptions)
                    ?? throw new InvalidOperationException($"Could not parse {candidate}.");
            }
            directory = directory.Parent;
        }

        throw new FileNotFoundException(
            $"tests/fixtures/wire-tokens.json was not found above {AppContext.BaseDirectory}.",
            "tests/fixtures/wire-tokens.json");
    }

    private sealed record WireTokenFixture(
        int SchemaVersion,
        Dictionary<string, string[]> TokenSets,
        FeatureFlagFixture FeatureFlags);

    private sealed record FeatureFlagFixture(string[] All, string[] Public);
}
