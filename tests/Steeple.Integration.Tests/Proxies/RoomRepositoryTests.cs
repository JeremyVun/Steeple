using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="RoomRepository"/> against a real Postgres, seeded from the
/// same Liquibase-owned SQL the production <c>migrate</c> service applies
/// (db/changelog/001-schema.sql, 002-seed.sql). Facts relied on below (5 venues, 10 rooms — 9
/// Published + 1 Draft "renovation-annex", free rooms have a null PricePerHour, 3 photos per
/// room) were read directly out of 002-seed.sql rather than assumed.
/// </summary>
[Collection(PostgresCollection.Name)]
public class RoomRepositoryTests
{
    // Mirrors the "Geofence" beachhead in src/Steeple.Api/appsettings.json — large enough to
    // contain every seeded venue (all five sit inside it).
    private static readonly BoundingBox FullBeachheadBounds = new(
        MinLatitude: 38.84, MaxLatitude: 38.96, MinLongitude: -77.34, MaxLongitude: -77.12);

    // Grace Community Church of Vienna's coordinates from 002-seed.sql.
    private const double GraceLat = 38.9012;
    private const double GraceLng = -77.2653;

    private readonly PostgresDatabaseFixture _fixture;

    public RoomRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static RoomSearchCriteria Criteria(
        BoundingBox? bounds = null,
        int? minCapacity = null,
        ActivityType activities = ActivityType.None,
        AccessibilityFeature accessibility = AccessibilityFeature.None,
        string? suburb = null,
        int skip = 0,
        int take = 50,
        GeoPoint? center = null) =>
        new(
            Bounds: bounds ?? FullBeachheadBounds,
            MinCapacity: minCapacity,
            Activities: activities,
            Accessibility: accessibility,
            Suburb: suburb,
            Skip: skip,
            Take: take,
            Center: center);

    [Fact]
    public async Task SearchAsync_FullBeachhead_ReturnsOnlyPublishedRoomsExcludingDraft()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var rooms = await repository.SearchAsync(Criteria());

        Assert.Equal(9, rooms.Count);
        Assert.All(rooms, r => Assert.Equal(RoomStatus.Published, r.Status));
        Assert.DoesNotContain(rooms, r => r.Slug == "renovation-annex");
    }

    [Fact]
    public async Task CountAsync_FullBeachhead_ReturnsNinePublishedRooms()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var count = await repository.CountAsync(Criteria());

        Assert.Equal(9, count);
    }

    [Fact]
    public async Task SearchAsync_TightBoundingBoxAroundOneVenue_ReturnsOnlyThatVenuesRooms()
    {
        // Tight box around Grace Community Vienna (38.9012,-77.2653) that excludes the
        // next-closest venue, Vienna Presbyterian (38.9018,-77.2589) — its longitude
        // (-77.2589) falls outside this box's eastern edge (-77.260).
        var tightBox = new BoundingBox(
            MinLatitude: 38.900, MaxLatitude: 38.905, MinLongitude: -77.270, MaxLongitude: -77.260);

        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var rooms = await repository.SearchAsync(Criteria(bounds: tightBox));

        Assert.Equal(2, rooms.Count);
        Assert.All(rooms, r => Assert.Equal("grace-community-vienna", r.Venue!.Slug));
        Assert.Contains(rooms, r => r.Slug == "fellowship-hall");
        Assert.Contains(rooms, r => r.Slug == "youth-activity-room");
    }

    [Fact]
    public async Task SearchAsync_EveryRoom_HasPositivePrice()
    {
        // Free listings were removed (010-require-price.sql): NOT NULL + CHECK (> 0) means
        // no published room can surface without a real hourly price.
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var rooms = await repository.SearchAsync(Criteria());

        Assert.All(rooms, r => Assert.True(r.PricePerHour > 0m));
    }

    [Fact]
    public async Task SearchAsync_MinCapacityThreshold_FiltersOutSmallerRooms()
    {
        // Published capacities are 200,30,40,18,120,25,24,20,150 — 30 is a threshold that
        // splits them 5 (>=30) / 4 (<30).
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var rooms = await repository.SearchAsync(Criteria(minCapacity: 30));

        Assert.Equal(5, rooms.Count);
        Assert.All(rooms, r => Assert.True(r.Capacity >= 30));
        Assert.Equal(
            new[] { "fellowship-hall", "gymnasium", "main-hall", "music-room", "youth-activity-room" },
            rooms.Select(r => r.Slug).OrderBy(s => s));
    }

    [Fact]
    public async Task SearchAsync_ActivitiesMask_RequiresAllRequestedFlags()
    {
        // Community (bit 4) alone matches 7 of the 9 published rooms; requiring Community AND
        // Education together narrows that to 3 — proving the mask is an "accepts ALL" AND, not
        // an OR, and demonstrating a single flag can match strictly more rooms than a two-flag
        // combination.
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var communityOnly = await repository.SearchAsync(Criteria(activities: ActivityType.Community));
        var communityAndEducation = await repository.SearchAsync(
            Criteria(activities: ActivityType.Community | ActivityType.Education));

        Assert.Equal(7, communityOnly.Count);
        Assert.Equal(3, communityAndEducation.Count);
        Assert.True(communityOnly.Count > communityAndEducation.Count);
        Assert.All(communityAndEducation, r =>
            Assert.True((r.AcceptedActivityTypes & (ActivityType.Community | ActivityType.Education))
                == (ActivityType.Community | ActivityType.Education)));
    }

    [Fact]
    public async Task SearchAsync_WithCenter_OrdersResultsNearestFirst()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var rooms = await repository.SearchAsync(
            Criteria(center: new GeoPoint(GraceLat, GraceLng), take: 20));

        Assert.Equal(9, rooms.Count);
        var distances = rooms
            .Select(r => GeoMath.DistanceMeters(GraceLat, GraceLng, r.Venue!.Latitude, r.Venue.Longitude))
            .ToList();
        var sorted = distances.OrderBy(d => d).ToList();
        Assert.Equal(sorted, distances);
    }

    [Fact]
    public async Task SearchAsync_SkipTakePaging_PagesDoNotOverlap()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var page1 = await repository.SearchAsync(Criteria(skip: 0, take: 5));
        var page2 = await repository.SearchAsync(Criteria(skip: 5, take: 5));

        Assert.Equal(5, page1.Count);
        Assert.Equal(4, page2.Count); // 9 published rooms total, so the second page is a partial page.

        var page1Ids = page1.Select(r => r.Id).ToHashSet();
        var page2Ids = page2.Select(r => r.Id).ToHashSet();
        Assert.Empty(page1Ids.Intersect(page2Ids));

        var combined = page1Ids.Union(page2Ids);
        Assert.Equal(9, combined.Count());
    }

    [Fact]
    public async Task GetBySlugAsync_KnownSlug_ReturnsRoomWithVenueAndPhotosOrderedBySortOrder()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var room = await repository.GetBySlugAsync("grace-community-vienna", "fellowship-hall");

        Assert.NotNull(room);
        Assert.Equal("Fellowship Hall", room!.Name);
        Assert.NotNull(room.Venue);
        Assert.Equal("grace-community-vienna", room.Venue!.Slug);

        var orderedPhotos = room.Photos.OrderBy(p => p.SortOrder).ToList();
        Assert.Equal(3, orderedPhotos.Count);
        Assert.Equal(new[] { 0, 1, 2 }, orderedPhotos.Select(p => p.SortOrder));
        Assert.Equal(
            "https://picsum.photos/seed/fellowship-hall-1/1200/800", orderedPhotos[0].Url);
        Assert.Equal(
            "https://picsum.photos/seed/fellowship-hall-2/1200/800", orderedPhotos[1].Url);
        Assert.Equal(
            "https://picsum.photos/seed/fellowship-hall-3/1200/800", orderedPhotos[2].Url);
        Assert.Single(room.Photos, p => p.IsPrimary);
        Assert.True(orderedPhotos[0].IsPrimary);
    }

    [Fact]
    public async Task GetBySlugAsync_DraftRoomSlug_StillReturnsRoomRegardlessOfStatus()
    {
        // Unlike SearchAsync/CountAsync, GetBySlugAsync doesn't run through ApplyFilters, so a
        // direct slug lookup (e.g. for a lister's own preview) surfaces the Draft room too.
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var room = await repository.GetBySlugAsync("oakton-baptist", "renovation-annex");

        Assert.NotNull(room);
        Assert.Equal(RoomStatus.Draft, room!.Status);
    }

    [Fact]
    public async Task GetBySlugAsync_MixedCaseSlugs_MatchesCaseInsensitively()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var room = await repository.GetBySlugAsync("Grace-Community-Vienna", "Fellowship-Hall");

        Assert.NotNull(room);
        Assert.Equal("fellowship-hall", room!.Slug);
    }

    [Fact]
    public async Task GetBySlugAsync_UnknownSlug_ReturnsNull()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var room = await repository.GetBySlugAsync("grace-community-vienna", "does-not-exist");

        Assert.Null(room);
    }
}
