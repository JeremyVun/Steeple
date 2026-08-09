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
        // The photographs themselves are seed curation (012 re-shot every room), so this pins the
        // shape the repository owns — three distinct, non-empty URLs in sort order — not the CDN.
        Assert.All(orderedPhotos, p => Assert.False(string.IsNullOrWhiteSpace(p.Url)));
        Assert.Equal(3, orderedPhotos.Select(p => p.Url).Distinct().Count());
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

    // ----- Sitemap rows: what steeple advertises to crawlers ------------------------------------
    //
    // These rows are staged in their own far-from-NoVA box so the suite can assert exact contents
    // without depending on what the seed (or another suite sharing this database) has published
    // inside the beachhead. The bounds are a parameter now, so the fixture area is as real a
    // served area as the beachhead is.

    private static readonly BoundingBox FixtureBounds = new(
        MinLatitude: 10.0, MaxLatitude: 11.0, MinLongitude: 20.0, MaxLongitude: 21.0);

    [Fact]
    public async Task GetPublishedForSitemapAsync_AdvertisesOnlyWhatADirectReadWouldAnswer()
    {
        var prefix = $"sm-{Guid.NewGuid():N}"[..12];
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        // Inside the served area, published: the one crawlable listing.
        await SeedListingAsync(db, $"{prefix}-inside", "hall", 10.5, 20.5, RoomStatus.Published);
        // Same box, but each of the reasons a read answers 404.
        await SeedListingAsync(db, $"{prefix}-draft", "hall", 10.5, 20.5, RoomStatus.Draft);
        await SeedListingAsync(db, $"{prefix}-unlisted", "hall", 10.5, 20.5, RoomStatus.Unlisted);
        // An operator takedown carries both marks — the schema forbids Published + the marker.
        await SeedListingAsync(
            db, $"{prefix}-takendown", "hall", 10.5, 20.5, RoomStatus.Unlisted,
            operatorUnlistedAtUtc: new DateTimeOffset(2026, 8, 1, 0, 0, 0, TimeSpan.Zero));
        // Published, but the venue sits outside the box — advertising it would be a URL that 404s.
        await SeedListingAsync(db, $"{prefix}-outside", "hall", 12.5, 20.5, RoomStatus.Published);

        var entries = await repository.GetPublishedForSitemapAsync(FixtureBounds);

        Assert.Equal(
            new[] { $"{prefix}-inside" },
            entries.Where(e => e.VenueSlug.StartsWith(prefix, StringComparison.Ordinal)).Select(e => e.VenueSlug));
    }

    [Fact]
    public async Task GetPublishedForSitemapAsync_AVenueSittingExactlyOnTheEdgeIsAdvertised()
    {
        // BoundingBox.Contains and the search SQL both include their edges, so a venue on the
        // boundary is served — dropping it here would hide a readable listing from crawlers, and
        // any looser comparison would advertise one that 404s. Same predicate, both directions.
        var prefix = $"ed-{Guid.NewGuid():N}"[..12];
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        await SeedListingAsync(db, $"{prefix}-sw", "hall", FixtureBounds.MinLatitude, FixtureBounds.MinLongitude, RoomStatus.Published);
        await SeedListingAsync(db, $"{prefix}-ne", "hall", FixtureBounds.MaxLatitude, FixtureBounds.MaxLongitude, RoomStatus.Published);

        var entries = await repository.GetPublishedForSitemapAsync(FixtureBounds);
        var mine = entries.Where(e => e.VenueSlug.StartsWith(prefix, StringComparison.Ordinal)).ToList();

        Assert.Equal(new[] { $"{prefix}-ne", $"{prefix}-sw" }, mine.Select(e => e.VenueSlug));
        // The read gate agrees, which is the whole point of sharing one comparison.
        Assert.True(FixtureBounds.Contains(FixtureBounds.MinLatitude, FixtureBounds.MinLongitude));
        Assert.True(FixtureBounds.Contains(FixtureBounds.MaxLatitude, FixtureBounds.MaxLongitude));
    }

    [Fact]
    public async Task GetPublishedForSitemapAsync_OrdersByVenueThenRoomEveryTime()
    {
        var prefix = $"or-{Guid.NewGuid():N}"[..12];
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        // Inserted in an order that is neither the answer nor its reverse.
        await SeedListingAsync(db, $"{prefix}-b", "yoga-room", 10.2, 20.2, RoomStatus.Published);
        await SeedListingAsync(db, $"{prefix}-a", "small-hall", 10.3, 20.3, RoomStatus.Published);
        await SeedListingAsync(db, $"{prefix}-b", "art-room", 10.2, 20.2, RoomStatus.Published);
        await SeedListingAsync(db, $"{prefix}-a", "main-hall", 10.3, 20.3, RoomStatus.Published);

        var first = await repository.GetPublishedForSitemapAsync(FixtureBounds);
        var second = await repository.GetPublishedForSitemapAsync(FixtureBounds);

        static IEnumerable<string> Paths(IReadOnlyList<SitemapEntry> entries, string venuePrefix) =>
            entries.Where(e => e.VenueSlug.StartsWith(venuePrefix, StringComparison.Ordinal))
                .Select(e => $"{e.VenueSlug}/{e.RoomSlug}");

        Assert.Equal(
            new[] { $"{prefix}-a/main-hall", $"{prefix}-a/small-hall", $"{prefix}-b/art-room", $"{prefix}-b/yoga-room" },
            Paths(first, prefix));
        Assert.Equal(Paths(first, prefix), Paths(second, prefix));
    }

    [Fact]
    public async Task GetPublishedForSitemapAsync_LastmodIsWhicheverOfRoomAndVenueChangedLast()
    {
        var prefix = $"lm-{Guid.NewGuid():N}"[..12];
        var older = new DateTimeOffset(2026, 3, 1, 9, 0, 0, TimeSpan.Zero);
        var newer = new DateTimeOffset(2026, 7, 21, 16, 30, 0, TimeSpan.Zero);

        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        // The venue was edited last (a new address changes every one of its room pages)…
        await SeedListingAsync(db, $"{prefix}-venuelast", "hall", 10.6, 20.6, RoomStatus.Published,
            roomUpdatedAtUtc: older, venueUpdatedAtUtc: newer);
        // …and here the room was.
        await SeedListingAsync(db, $"{prefix}-roomlast", "hall", 10.6, 20.6, RoomStatus.Published,
            roomUpdatedAtUtc: newer, venueUpdatedAtUtc: older);

        var entries = await repository.GetPublishedForSitemapAsync(FixtureBounds);

        Assert.All(
            entries.Where(e => e.VenueSlug.StartsWith(prefix, StringComparison.Ordinal)),
            e => Assert.Equal(newer, e.LastModifiedUtc));
    }

    [Fact]
    public async Task GetPublishedForSitemapAsync_TheSeedsDraftRoomIsNeverAdvertised()
    {
        await using var db = CreateContext();
        var repository = new RoomRepository(db);

        var entries = await repository.GetPublishedForSitemapAsync(FullBeachheadBounds);

        Assert.DoesNotContain(entries, e => e.RoomSlug == "renovation-annex");
        Assert.Contains(entries, e => e is { VenueSlug: "grace-community-vienna", RoomSlug: "fellowship-hall" });
    }

    /// <summary>
    /// Writes one venue + one room straight through EF (no service, no geocoder): these rows exist
    /// to be queried, and staging them here keeps the sitemap predicate's proof independent of the
    /// manage module's own rules.
    /// </summary>
    private static async Task SeedListingAsync(
        SteepleDbContext db,
        string venueSlug,
        string roomSlug,
        double latitude,
        double longitude,
        RoomStatus status,
        DateTimeOffset? operatorUnlistedAtUtc = null,
        DateTimeOffset? roomUpdatedAtUtc = null,
        DateTimeOffset? venueUpdatedAtUtc = null)
    {
        var created = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var venue = await db.Venues.FirstOrDefaultAsync(v => v.Slug == venueSlug);
        if (venue is null)
        {
            venue = new Venue
            {
                Id = Guid.NewGuid(),
                Name = venueSlug,
                Slug = venueSlug,
                Description = "Staged by RoomRepositoryTests.",
                Type = VenueType.Church,
                AddressLine = "1 Fixture Way",
                Suburb = "Fixtureton",
                Postcode = "00000",
                Latitude = latitude,
                Longitude = longitude,
                CreatedAtUtc = created,
                UpdatedAtUtc = venueUpdatedAtUtc ?? created,
            };
            db.Venues.Add(venue);
        }

        db.Rooms.Add(new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Name = roomSlug,
            Slug = roomSlug,
            Description = "Staged by RoomRepositoryTests.",
            Capacity = 20,
            PricePerHour = 25m,
            Currency = "USD",
            Status = status,
            OperatorUnlistedAtUtc = operatorUnlistedAtUtc,
            CreatedAtUtc = created,
            UpdatedAtUtc = roomUpdatedAtUtc ?? created,
        });

        await db.SaveChangesAsync();
    }
}
