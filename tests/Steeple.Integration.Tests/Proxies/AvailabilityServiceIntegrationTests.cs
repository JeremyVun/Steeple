using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration test for the Availability module's write/read path (<see cref="AvailabilityService"/>
/// over the real <see cref="EfAvailabilityRepository"/>) against a real Postgres with the
/// Liquibase-owned schema (db/changelog/009-availability.sql). Drives PUT → GET → PUT-empty → GET to
/// prove replace-all and the seven-day read shape survive a round-trip through the database.
/// </summary>
[Collection(PostgresCollection.Name)]
public class AvailabilityServiceIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 5, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public AvailabilityServiceIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static IAvailabilityService CreateService(SteepleDbContext db) => new AvailabilityService(
        new EfAvailabilityRepository(db),
        new EfVenueManagerRepository(db),
        new NullAnalytics(),
        new FixedTimeProvider(FixedNow));

    [Fact]
    public async Task PutThenGetThenEmptyPutThenGet_RoundTripsThroughPostgres()
    {
        var manager = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Provider Pat",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Availability Test Venue",
            Slug = $"avail-{Guid.NewGuid():N}",
            Description = "A space.",
            AddressLine = "1 Test Way",
            Suburb = "Vienna",
            Postcode = "22180",
            Latitude = 38.9012,
            Longitude = -77.2653,
            Timezone = "America/New_York",
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Name = "Hall",
            Slug = $"hall-{Guid.NewGuid():N}",
            Description = "A hall.",
            Capacity = 40,
            Status = RoomStatus.Draft,
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };

        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(manager);
            seedDb.Venues.Add(venue);
            seedDb.Rooms.Add(room);
            seedDb.VenueManagers.Add(new VenueManager
            {
                Id = Guid.NewGuid(),
                VenueId = venue.Id,
                UserId = manager.Id,
                CreatedAtUtc = FixedNow,
            });
            await seedDb.SaveChangesAsync();
        }

        // PUT a multi-window rule set + a future blackout.
        await using (var db = CreateContext())
        {
            var request = new SaveAvailabilityRulesRequest(
                Days:
                [
                    new DayOpenHoursDto("monday", [new OpenWindowDto("09:00", "12:00"), new OpenWindowDto("13:00", "17:00")]),
                    new DayOpenHoursDto("wednesday", [new OpenWindowDto("18:00", "21:00")]),
                ],
                Blackouts: [new BlackoutDateDto(new DateOnly(2026, 12, 25), "Christmas")]);

            var result = await CreateService(db).SaveRulesAsync(manager.Id, room.Id, request);
            Assert.Null(result.Error);
        }

        // GET reflects the saved rules with the seven-day Sunday-first shape.
        await using (var db = CreateContext())
        {
            var result = await CreateService(db).GetRulesAsync(manager.Id, room.Id);
            Assert.Null(result.Error);
            Assert.Equal(7, result.Value!.Days.Count);
            var monday = result.Value.Days.Single(d => d.DayOfWeek == "monday");
            Assert.Equal(2, monday.Windows.Count);
            Assert.Empty(result.Value.Days.Single(d => d.DayOfWeek == "tuesday").Windows);
            Assert.Equal("Christmas", Assert.Single(result.Value.Blackouts).Reason);
        }

        // Empty PUT clears everything (replace-all).
        await using (var db = CreateContext())
        {
            var result = await CreateService(db).SaveRulesAsync(
                manager.Id, room.Id, new SaveAvailabilityRulesRequest(null, null));
            Assert.Null(result.Error);
        }

        await using (var verifyDb = CreateContext())
        {
            Assert.False(await verifyDb.RoomOpenHours.AnyAsync(h => h.RoomId == room.Id));
            Assert.False(await verifyDb.RoomBlackoutDates.AnyAsync(b => b.RoomId == room.Id));

            var result = await CreateService(verifyDb).GetRulesAsync(manager.Id, room.Id);
            Assert.Null(result.Error);
            Assert.All(result.Value!.Days, d => Assert.Empty(d.Windows));
            Assert.Empty(result.Value.Blackouts);
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }
}
