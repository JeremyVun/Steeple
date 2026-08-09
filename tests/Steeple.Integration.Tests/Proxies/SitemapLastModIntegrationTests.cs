using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Steeple.Admin.Services.Admin;
using Steeple.Api.Configuration;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Services;
using Steeple.Api.Proxies.Media;
using Steeple.Api.Services.Media;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;

/// <summary>
/// What a crawler is told about freshness. `lastmod` is the later of the room's and its venue's
/// <c>UpdatedAtUtc</c> (docs/contracts/seo.md), which is only true if every write that changes a
/// published listing document stamps one of them. These tests drive the real write paths — manage
/// room/venue edits, photo add/edit/delete, publish and unlist, availability-rule saves, and the
/// Admin rating moderation lever — and read the answer back out of the sitemap query itself rather
/// than out of the column, so a stamp that never reaches the advertised row cannot pass.
/// </summary>
/// <remarks>
/// Every row this suite writes lives in its own served area, far from the NoVA beachhead the seed
/// and the other suites use, so publishing rooms here cannot disturb their counts. The bounds are
/// a parameter of the sitemap query now, so a fixture area is as real as the beachhead.
///
/// One thing deliberately not covered: a venue's average changes on its own when the double-blind
/// reveal window elapses. No row is written, so no timestamp can move — `lastmod` does not claim
/// to cover it (docs/contracts/seo.md).
/// </remarks>
[Collection(PostgresCollection.Name)]
public class SitemapLastModIntegrationTests
{
    private static readonly BoundingBox FixtureArea = new(
        MinLatitude: 30.0, MaxLatitude: 31.0, MinLongitude: 40.0, MaxLongitude: 41.0);

    private static readonly GeoPoint FixtureCentre = new(30.5, 40.5);

    private static readonly DateTimeOffset Created = new(2026, 6, 1, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Edited = new(2026, 8, 8, 14, 30, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public SitemapLastModIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    // ----- Manage writes -------------------------------------------------------------------------

    [Fact]
    public async Task Editing_a_room_moves_the_lastmod_its_own_sitemap_row_carries()
    {
        var listing = await SeedPublishedListingAsync();

        await using (var db = CreateContext())
        {
            var result = await CreateManageService(db, Edited).UpdateRoomAsync(
                listing.ManagerId, listing.RoomId, SaveRoom("Renamed Hall"));
            Assert.Null(result.Error);
        }

        Assert.Equal(Edited, await LastModAsync(listing));
    }

    [Fact]
    public async Task Editing_the_venue_moves_the_lastmod_of_every_room_it_holds()
    {
        // The venue's name and address are printed on each room's page, so one venue edit is a
        // change to all of them — which is exactly why lastmod reads the later of the two rows.
        var listing = await SeedPublishedListingAsync();
        var sibling = await AddPublishedRoomAsync(listing, "second-hall");

        await using (var db = CreateContext())
        {
            var result = await CreateManageService(db, Edited).UpdateVenueAsync(
                listing.ManagerId, listing.VenueId, SaveVenue("Renamed Venue"));
            Assert.Null(result.Error);
        }

        Assert.Equal(Edited, await LastModAsync(listing));
        Assert.Equal(Edited, await LastModAsync(listing with { RoomSlug = sibling }));
    }

    [Fact]
    public async Task Publishing_a_room_gives_it_a_row_and_unlisting_takes_it_away()
    {
        var listing = await SeedPublishedListingAsync();
        var draftSlug = await AddDraftRoomAsync(listing, "later-hall");
        var draft = listing with { RoomSlug = draftSlug };

        Assert.Null(await LastModAsync(draft));

        await using (var db = CreateContext())
        {
            var published = await CreateManageService(db, Edited).UpdateRoomAsync(
                listing.ManagerId, RoomIdOf(draft), SaveRoom("Later Hall", status: "published"));
            Assert.Null(published.Error);
        }

        Assert.Equal(Edited, await LastModAsync(draft));

        await using (var db = CreateContext())
        {
            var unlisted = await CreateManageService(db, Edited.AddDays(1)).UpdateRoomAsync(
                listing.ManagerId, RoomIdOf(draft), SaveRoom("Later Hall", status: "unlisted"));
            Assert.Null(unlisted.Error);
        }

        Assert.Null(await LastModAsync(draft));
    }

    [Fact]
    public async Task Adding_changing_and_removing_a_photo_each_move_the_lastmod()
    {
        var listing = await SeedPublishedListingAsync();
        var before = await LastModAsync(listing);

        Guid photoId;
        await using (var db = CreateContext())
        {
            var upload = await CreateMediaService(db, Edited).UploadPhotoAsync(
                listing.ManagerId, listing.RoomId, new MemoryStream([1, 2, 3]), "The hall at dusk");
            Assert.Null(upload.Error);
            photoId = upload.Value!.Id;
        }

        Assert.NotEqual(before, await LastModAsync(listing));
        Assert.Equal(Edited, await LastModAsync(listing));

        var captioned = Edited.AddDays(1);
        await using (var db = CreateContext())
        {
            var updated = await CreateMediaService(db, captioned).UpdatePhotoAsync(
                listing.ManagerId, photoId, new UpdatePhotoRequest("A better caption", null, null));
            Assert.Null(updated.Error);
        }

        Assert.Equal(captioned, await LastModAsync(listing));

        var deleted = Edited.AddDays(2);
        await using (var db = CreateContext())
        {
            var removed = await CreateMediaService(db, deleted).DeletePhotoAsync(listing.ManagerId, photoId);
            Assert.Null(removed.Error);
        }

        Assert.Equal(deleted, await LastModAsync(listing));
    }

    [Fact]
    public async Task Saving_availability_rules_moves_the_lastmod()
    {
        // The listing document publishes the room's open hours, so a host who only changes their
        // hours has still changed the page — this write went unstamped until 2026-08-08.
        var listing = await SeedPublishedListingAsync();

        await using (var db = CreateContext())
        {
            var result = await CreateAvailabilityService(db, Edited).SaveRulesAsync(
                listing.ManagerId,
                listing.RoomId,
                new SaveAvailabilityRulesRequest(
                    Days: [new DayOpenHoursDto("tuesday", [new OpenWindowDto("09:00", "17:00")])],
                    Blackouts: null));
            Assert.Null(result.Error);
        }

        Assert.Equal(Edited, await LastModAsync(listing));

        // Clearing them is equally a change to the page.
        var cleared = Edited.AddDays(1);
        await using (var db = CreateContext())
        {
            var result = await CreateAvailabilityService(db, cleared).SaveRulesAsync(
                listing.ManagerId, listing.RoomId, new SaveAvailabilityRulesRequest(null, null));
            Assert.Null(result.Error);
        }

        Assert.Equal(cleared, await LastModAsync(listing));
    }

    // ----- Admin writes --------------------------------------------------------------------------

    [Fact]
    public async Task An_operator_takedown_moves_the_lastmod_on_its_way_out_of_the_sitemap()
    {
        var listing = await SeedPublishedListingAsync();
        var before = DateTimeOffset.UtcNow;

        Assert.Null(CreateWorkspace().UnlistRoom(listing.RoomId, "operator@steeple"));

        Assert.Null(await LastModAsync(listing));
        await using var db = CreateContext();
        var room = await db.Rooms.SingleAsync(r => r.Id == listing.RoomId);
        Assert.True(room.UpdatedAtUtc >= before, "the takedown must stamp the row a crawler times from");
    }

    [Fact]
    public async Task Hiding_and_restoring_a_rating_moves_the_lastmod_of_every_room_at_that_venue()
    {
        // A venue's star average rides all of its listing documents, so moderating a review is a
        // change to each of them — the one Admin write that was silent until 2026-08-08.
        var listing = await SeedPublishedListingAsync();
        var sibling = listing with { RoomSlug = await AddPublishedRoomAsync(listing, "review-hall") };
        var ratingId = await SeedVenueRatingAsync(listing);
        var beforeHide = DateTimeOffset.UtcNow;

        var workspace = CreateWorkspace();
        workspace.SetRatingHidden(ratingId, hidden: true, "operator@steeple");

        var hiddenAt = await LastModAsync(listing);
        Assert.NotNull(hiddenAt);
        Assert.True(hiddenAt >= beforeHide, "hiding a review must move the lastmod of the pages that show it");
        Assert.Equal(hiddenAt, await LastModAsync(sibling));

        var beforeRestore = DateTimeOffset.UtcNow;
        workspace.SetRatingHidden(ratingId, hidden: false, "operator@steeple");

        var restoredAt = await LastModAsync(listing);
        Assert.NotNull(restoredAt);
        Assert.True(restoredAt >= beforeRestore, "restoring it changes the average back — also a change");
    }

    [Fact]
    public async Task Moderating_a_rating_of_an_organizer_moves_nothing_on_the_venues_pages()
    {
        // Organizer ratings appear on the person's trust chip, never on a listing document.
        var listing = await SeedPublishedListingAsync();
        var ratingId = await SeedOrganizerRatingAsync(listing);
        var before = await LastModAsync(listing);

        CreateWorkspace().SetRatingHidden(ratingId, hidden: true, "operator@steeple");

        Assert.Equal(before, await LastModAsync(listing));
        await using var db = CreateContext();
        Assert.NotNull(await db.Ratings.Where(r => r.Id == ratingId).Select(r => r.HiddenAtUtc).SingleAsync());
    }

    // ----- Rig -----------------------------------------------------------------------------------

    /// <summary>One venue, one manager and one published room, all inside this suite's area.</summary>
    private sealed record Listing(Guid ManagerId, Guid VenueId, Guid RoomId, string VenueSlug, string RoomSlug);

    /// <summary>The <c>lastmod</c> the sitemap would advertise for this room, or null when it has no row.</summary>
    private async Task<DateTimeOffset?> LastModAsync(Listing listing)
    {
        await using var db = CreateContext();
        var entries = await new RoomRepository(db).GetPublishedForSitemapAsync(FixtureArea);
        return entries
            .Where(e => e.VenueSlug == listing.VenueSlug && e.RoomSlug == listing.RoomSlug)
            .Select(e => (DateTimeOffset?)e.LastModifiedUtc)
            .SingleOrDefault();
    }

    private Guid RoomIdOf(Listing listing)
    {
        using var db = CreateContext();
        return db.Rooms.Single(r => r.Venue!.Slug == listing.VenueSlug && r.Slug == listing.RoomSlug).Id;
    }

    private async Task<Listing> SeedPublishedListingAsync()
    {
        var suffix = Guid.NewGuid().ToString("N")[..12];
        var manager = NewUser($"Host {suffix}");
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Fixture Venue",
            Slug = $"lastmod-{suffix}",
            Description = "Staged by SitemapLastModIntegrationTests.",
            Type = VenueType.Church,
            AddressLine = "1 Fixture Way",
            Suburb = "Fixtureton",
            Postcode = "00000",
            Latitude = FixtureCentre.Latitude,
            Longitude = FixtureCentre.Longitude,
            IsIdentityVerified = true, // already through the human gate: later rooms self-publish
            Timezone = "America/New_York",
            CreatedAtUtc = Created,
            UpdatedAtUtc = Created,
        };
        var room = NewRoom(venue.Id, "main-hall", RoomStatus.Published);

        await using var db = CreateContext();
        db.Users.Add(manager);
        db.Venues.Add(venue);
        db.Rooms.Add(room);
        db.VenueManagers.Add(new VenueManager
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            UserId = manager.Id,
            CreatedAtUtc = Created,
        });
        db.RoomPhotos.Add(NewPhoto(room.Id));
        await db.SaveChangesAsync();

        return new Listing(manager.Id, venue.Id, room.Id, venue.Slug, room.Slug);
    }

    private async Task<string> AddPublishedRoomAsync(Listing listing, string slug)
    {
        await using var db = CreateContext();
        var room = NewRoom(listing.VenueId, slug, RoomStatus.Published);
        db.Rooms.Add(room);
        db.RoomPhotos.Add(NewPhoto(room.Id));
        await db.SaveChangesAsync();
        return slug;
    }

    private async Task<string> AddDraftRoomAsync(Listing listing, string slug)
    {
        await using var db = CreateContext();
        var room = NewRoom(listing.VenueId, slug, RoomStatus.Draft);
        db.Rooms.Add(room);
        db.RoomPhotos.Add(NewPhoto(room.Id));
        await db.SaveChangesAsync();
        return slug;
    }

    /// <summary>A completed booking at the listing's room, rated by its organizer.</summary>
    private async Task<Guid> SeedVenueRatingAsync(Listing listing) =>
        await SeedRatingAsync(listing, RatingRateeType.Venue);

    private async Task<Guid> SeedOrganizerRatingAsync(Listing listing) =>
        await SeedRatingAsync(listing, RatingRateeType.Organizer);

    private async Task<Guid> SeedRatingAsync(Listing listing, RatingRateeType rateeType)
    {
        var organizer = NewUser("Organizer Ola");
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = listing.RoomId,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 10,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = new DateOnly(2026, 5, 1),
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "A community gathering that already happened.",
            Status = ApplicationStatus.Approved,
            DecidedAtUtc = Created,
            CreatedAtUtc = Created,
            ExpiresAtUtc = Created.AddDays(14),
        };
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            RoomId = listing.RoomId,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = application.StartDate,
            EndDate = application.StartDate,
            StartTime = application.StartTime,
            EndTime = application.EndTime,
            Status = BookingStatus.Completed,
            CreatedAtUtc = Created,
        };
        var rating = new Rating
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RaterId = rateeType == RatingRateeType.Venue ? organizer.Id : listing.ManagerId,
            RateeType = rateeType,
            Stars = 5,
            Comment = "A generous, well-kept hall.",
            CreatedAtUtc = Created,
            VenueId = listing.VenueId,
            OrganizerId = organizer.Id,
        };

        await using var db = CreateContext();
        db.Users.Add(organizer);
        db.Applications.Add(application);
        db.Bookings.Add(booking);
        db.Ratings.Add(rating);
        await db.SaveChangesAsync();
        return rating.Id;
    }

    private static User NewUser(string displayName) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = Created,
    };

    private static Room NewRoom(Guid venueId, string slug, RoomStatus status) => new()
    {
        Id = Guid.NewGuid(),
        VenueId = venueId,
        Name = slug,
        Slug = slug,
        Description = "A flexible meeting space.",
        Capacity = 40,
        PricePerHour = 30m,
        Currency = "USD",
        Status = status,
        FirstPublishedAtUtc = status == RoomStatus.Published ? Created : null,
        CreatedAtUtc = Created,
        UpdatedAtUtc = Created,
    };

    private static RoomPhoto NewPhoto(Guid roomId) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId,
        Url = "media/fixture-1600.jpg",
        CreatedAtUtc = Created,
        IsPrimary = true,
        SortOrder = 0,
    };

    private static SaveVenueRequest SaveVenue(string name) => new(
        Name: name,
        Description: "A welcoming space for community groups.",
        VenueType: "church",
        AddressLine: "1 Fixture Way",
        Suburb: "Fixtureton",
        Postcode: "00000",
        ContactEmail: "hello@example.org",
        ParkingInfo: null,
        TransitInfo: null);

    private static SaveRoomRequest SaveRoom(string name, string? status = null) => new(
        Name: name,
        Description: "A flexible meeting space.",
        Capacity: 40,
        PricePerHour: 30m,
        HouseRules: null,
        Status: status,
        Activities: null,
        Amenities: null,
        Accessibility: null);

    private static IManageService CreateManageService(SteepleDbContext db, DateTimeOffset now) => new ManageService(
        new EfManageRepository(db),
        new EfVenueManagerRepository(db),
        new FixtureGeocoder(),
        new FixtureGeofence(),
        new NullAnalytics(),
        new NoFeatureFlags(),
        CreateAvailabilityService(db, now),
        new FixedClock(now),
        Options.Create(new GeocodingOptions()));

    private static IAvailabilityService CreateAvailabilityService(SteepleDbContext db, DateTimeOffset now) =>
        new AvailabilityService(
            new EfAvailabilityRepository(db),
            new EfVenueManagerRepository(db),
            new NullAnalytics(),
            new FixedClock(now));

    private static IMediaService CreateMediaService(SteepleDbContext db, DateTimeOffset now) => new MediaService(
        new EfManageRepository(db),
        new EfMediaRepository(db),
        new EfVenueManagerRepository(db),
        new FixtureImageProcessor(),
        new FixtureMediaStore(),
        new NullAnalytics(),
        new FixedClock(now));

    /// <summary>The real Admin workspace over its own scoped contexts, as it runs in the app.</summary>
    private IAdminWorkspace CreateWorkspace()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<SteepleDbContext>(options => options.UseNpgsql(_fixture.ConnectionString));
        var provider = services.BuildServiceProvider();
        return new PostgresAdminWorkspace(
            provider.GetRequiredService<IServiceScopeFactory>(),
            provider.GetRequiredService<ILogger<PostgresAdminWorkspace>>());
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NoFeatureFlags : IFeatureFlags
    {
        public bool IsEnabled(string key) => false;
    }

    private sealed class FixtureGeocoder : IGeocodingGateway
    {
        public Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default) =>
            Task.FromResult<GeoPoint?>(FixtureCentre);

        public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AddressSuggestion>>([]);
    }

    private sealed class FixtureGeofence : IGeofencePolicy
    {
        public BoundingBox Bounds => FixtureArea;

        public GeoPoint Center => FixtureCentre;

        public string AreaName => "Fixtureton";

        public string TimezoneId => "America/New_York";

        public bool IsServed(double latitude, double longitude) => Bounds.Contains(latitude, longitude);

        public BoundingBox ResolveSearchBounds(ListingSearchQuery query) => Bounds;
    }

    /// <summary>Answers any bytes with the fixed variant set; the pipeline itself has its own tests.</summary>
    private sealed class FixtureImageProcessor : IImageProcessor
    {
        public Task<ProcessedImage?> ProcessAsync(Stream content, CancellationToken ct = default) =>
            Task.FromResult<ProcessedImage?>(new ProcessedImage(
                MediaVariants.Widths.Select(w => new ImageVariant(w, [0x42])).ToList(),
                Guid.NewGuid().ToString("N")));
    }

    private sealed class FixtureMediaStore : IMediaStore
    {
        public Task<string> PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct = default) =>
            Task.FromResult($"media/{key}");

        public Task DeleteAsync(IReadOnlyList<string> keys, CancellationToken ct = default) => Task.CompletedTask;
    }
}
