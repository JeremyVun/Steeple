using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Steeple.Api.Configuration;
using Steeple.Api.Contracts.Manage;
using Steeple.Api.Services;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for the Manage module's write path (<see cref="ManageService"/> over the real
/// <see cref="EfManageRepository"/>/<see cref="EfVenueManagerRepository"/>) against a real Postgres
/// with the Liquibase-owned schema (db/changelog/006-manage.sql — moderation columns + room_photos
/// media columns, ROADMAP Phase 5). Covers the venue/room CRUD happy path, the publish-moderation
/// gate's DB effects, the unpublish-blocked-by-bookings guard against a real seeded occurrence, and
/// a photo row round-trip.
/// </summary>
[Collection(PostgresCollection.Name)]
public class ManageServiceIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Gymnasium @ Oakton Baptist — Published, from 002-seed.sql; unused by BookingIntegrityTests'
    // GymnasiumId-based one-off slots, but this suite only reads/writes rows it creates itself.
    private static readonly Guid GymnasiumId = Guid.Parse("30000000-0000-0000-0000-000000000001");

    private readonly PostgresDatabaseFixture _fixture;

    public ManageServiceIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static IManageService CreateService(SteepleDbContext db) => new ManageService(
        new EfManageRepository(db),
        new EfVenueManagerRepository(db),
        new FakeGeocodingGateway(),
        new FakeGeofencePolicy(),
        new NullAnalytics(),
        new FixedTimeProvider(FixedNow),
        Options.Create(new GeocodingOptions()));

    private static User NewUser(string displayName = "Provider Pat") => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow,
    };

    private static SaveVenueRequest NewSaveVenueRequest(string name = "New Community Venue") => new(
        Name: name,
        Description: "A welcoming space for community groups.",
        VenueType: "church",
        AddressLine: "789 Fellowship Way",
        Suburb: "Vienna",
        Postcode: "22180",
        ContactEmail: "hello@example.org",
        ParkingInfo: null,
        TransitInfo: null);

    private static SaveRoomRequest NewSaveRoomRequest(string name = "Community Room", string? status = null) => new(
        Name: name,
        Description: "A flexible meeting space.",
        Capacity: 40,
        PricePerHour: null,
        HouseRules: null,
        Status: status,
        Activities: null,
        Amenities: null,
        Accessibility: null);

    private static SubmitVenueVerificationRequest NewVerificationRequest() => new(
        ContactName: "Provider Pat",
        ContactEmail: "pat@example.com",
        EvidenceSummary: "Signed facilities lease authorizing this manager to list rooms for community use.",
        AttestedAuthority: true,
        Documents: [new VenueVerificationDocumentRequest("Facilities lease", "https://docs.example.org/facilities-lease.pdf")]);

    // ----- CRUD happy path: create venue -> create room -> request publish -------------------

    [Fact]
    public async Task CreateVenueThenRoomThenRequestPublish_NeverApprovedRoom_SetsPublishRequestedNotPublished()
    {
        var provider = NewUser();
        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(provider);
            await seedDb.SaveChangesAsync();
        }

        Guid venueId;
        Guid roomId;
        await using (var db = CreateContext())
        {
            var service = CreateService(db);

            var venueResult = await service.CreateVenueAsync(provider.Id, NewSaveVenueRequest());
            Assert.Null(venueResult.Error);
            venueId = venueResult.Value!.Id;

            var roomResult = await service.CreateRoomAsync(provider.Id, venueId, NewSaveRoomRequest());
            Assert.Null(roomResult.Error);
            roomId = roomResult.Value!.Id;

            // Publishing requires at least one photo — the gate is its own unit test; give this
            // flow a photo so it exercises the happy path.
            db.RoomPhotos.Add(new RoomPhoto
            {
                Id = Guid.NewGuid(),
                RoomId = roomId,
                Url = "https://cdn.example.org/media/e2e-1600.jpg",
                CreatedAtUtc = FixedNow,
                IsPrimary = true,
                SortOrder = 0,
            });
            await db.SaveChangesAsync();

            var publishResult = await service.UpdateRoomAsync(
                provider.Id, roomId, NewSaveRoomRequest(status: "published"));
            Assert.Null(publishResult.Error);
        }

        await using (var verifyDb = CreateContext())
        {
            var venue = await verifyDb.Venues.SingleAsync(v => v.Id == venueId);
            Assert.Equal("New Community Venue", venue.Name);
            Assert.NotEmpty(venue.Slug);

            var manager = await verifyDb.VenueManagers.SingleAsync(m => m.VenueId == venueId);
            Assert.Equal(provider.Id, manager.UserId);

            var room = await verifyDb.Rooms.SingleAsync(r => r.Id == roomId);
            Assert.Equal(venueId, room.VenueId);
            Assert.Equal(RoomStatus.Draft, room.Status); // never-approved: gated behind Admin moderation
            Assert.NotNull(room.PublishRequestedAtUtc);
            Assert.Equal(FixedNow, room.PublishRequestedAtUtc);
            Assert.Null(room.FirstPublishedAtUtc);
        }
    }

    [Fact]
    public async Task UpdateVenueAsync_UnmanagedCaller_ReturnsNotFoundAndPersistsNoChange()
    {
        var provider = NewUser();
        Guid venueId;
        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(provider);
            await seedDb.SaveChangesAsync();

            var result = await CreateService(seedDb).CreateVenueAsync(provider.Id, NewSaveVenueRequest());
            venueId = result.Value!.Id;
        }

        var stranger = Guid.NewGuid();
        await using (var db = CreateContext())
        {
            var result = await CreateService(db).UpdateVenueAsync(
                stranger, venueId, NewSaveVenueRequest("Hijacked Name"));

            Assert.Null(result.Value);
            Assert.Equal(ManageErrorCodes.NotFound, result.Error!.Code);
        }

        await using (var verifyDb = CreateContext())
        {
            var venue = await verifyDb.Venues.SingleAsync(v => v.Id == venueId);
            Assert.Equal("New Community Venue", venue.Name); // unchanged
        }
    }

    [Fact]
    public async Task SubmitVenueVerificationAsync_ValidRequest_PersistsDocumentsAndPendingStatus()
    {
        var provider = NewUser();
        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(provider);
            await seedDb.SaveChangesAsync();
        }

        Guid venueId;
        await using (var db = CreateContext())
        {
            var service = CreateService(db);
            var venueResult = await service.CreateVenueAsync(provider.Id, NewSaveVenueRequest("Verification Test Venue"));
            venueId = venueResult.Value!.Id;

            var result = await service.SubmitVenueVerificationAsync(provider.Id, venueId, NewVerificationRequest());

            Assert.Null(result.Error);
            Assert.Equal("pending", result.Value!.VerificationStatus);
            Assert.False(result.Value.IsIdentityVerified);
        }

        await using (var verifyDb = CreateContext())
        {
            var request = await verifyDb.VenueVerificationRequests
                .Include(r => r.Documents)
                .SingleAsync(r => r.VenueId == venueId);

            Assert.Equal(provider.Id, request.RequestedByUserId);
            Assert.Equal(VenueVerificationStatus.Pending, request.Status);
            Assert.True(request.AttestedAuthority);
            Assert.Single(request.Documents);
            Assert.Equal("Facilities lease", request.Documents.Single().Label);
        }
    }

    // ----- Unpublish blocked by an active booking ---------------------------------------------

    [Fact]
    public async Task UpdateRoomAsync_UnpublishRoomWithFutureConfirmedOccurrence_ReturnsHasActiveBookingsAndLeavesRoomPublished()
    {
        var provider = NewUser();

        // Oakton Baptist's VenueId (owns GymnasiumId) — resolved from the seed rather than guessed.
        Guid oaktonVenueId;
        await using (var db = CreateContext())
        {
            oaktonVenueId = await db.Rooms.Where(r => r.Id == GymnasiumId).Select(r => r.VenueId).SingleAsync();
        }

        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(provider);
            seedDb.VenueManagers.Add(new VenueManager
            {
                Id = Guid.NewGuid(),
                VenueId = oaktonVenueId,
                UserId = provider.Id,
                CreatedAtUtc = FixedNow,
            });

            var organizer = NewUser("Booked Organizer");
            var application = new Application
            {
                Id = Guid.NewGuid(),
                RoomId = GymnasiumId,
                OrganizerId = organizer.Id,
                ActivityType = ActivityType.Community,
                GroupSize = 10,
                Frequency = ScheduleFrequency.OneOff,
                StartDate = new DateOnly(2026, 12, 1),
                EndDate = null,
                DaysOfWeek = null,
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(11, 0),
                IntentText = "A future community gathering.",
                Status = ApplicationStatus.Approved,
                DecidedAtUtc = FixedNow,
                CreatedAtUtc = FixedNow,
                ExpiresAtUtc = FixedNow.AddDays(14),
            };
            var booking = new Booking
            {
                Id = Guid.NewGuid(),
                ApplicationId = application.Id,
                RoomId = GymnasiumId,
                OrganizerId = organizer.Id,
                Type = BookingType.OneOff,
                StartDate = application.StartDate,
                EndDate = application.StartDate,
                StartTime = application.StartTime,
                EndTime = application.EndTime,
                Status = BookingStatus.Confirmed,
                CreatedAtUtc = FixedNow,
            };
            var occurrence = new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RoomId = GymnasiumId,
                StartUtc = new DateTimeOffset(2026, 12, 1, 14, 0, 0, TimeSpan.Zero), // future relative to FixedNow
                EndUtc = new DateTimeOffset(2026, 12, 1, 16, 0, 0, TimeSpan.Zero),
                LocalDate = application.StartDate,
                Status = OccurrenceStatus.Scheduled,
            };

            seedDb.Users.Add(organizer);
            seedDb.Applications.Add(application);
            seedDb.Bookings.Add(booking);
            seedDb.BookingOccurrences.Add(occurrence);
            await seedDb.SaveChangesAsync();
        }

        await using (var db = CreateContext())
        {
            var result = await CreateService(db).UpdateRoomAsync(
                provider.Id, GymnasiumId, NewSaveRoomRequest(status: "unlisted"));

            Assert.Null(result.Value);
            Assert.Equal(ManageErrorCodes.HasActiveBookings, result.Error!.Code);
        }

        await using (var verifyDb = CreateContext())
        {
            var room = await verifyDb.Rooms.SingleAsync(r => r.Id == GymnasiumId);
            Assert.Equal(RoomStatus.Published, room.Status); // unchanged — the guard blocked it
        }
    }

    // ----- Photo row round-trip ------------------------------------------------------------------

    [Fact]
    public async Task RoomPhoto_MediaColumns_RoundTripThroughTheDatabase()
    {
        var roomId = Guid.Parse("10000000-0000-0000-0000-000000000001"); // Fellowship Hall, from 002-seed.sql
        var photo = new RoomPhoto
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            Url = "https://cdn.example.org/media/abc123-1600.jpg",
            StorageKey = "abc123",
            ThumbUrl = "https://cdn.example.org/media/abc123-400.jpg",
            CardUrl = "https://cdn.example.org/media/abc123-800.jpg",
            CreatedAtUtc = FixedNow,
            Caption = "The main hall, set up for a Sunday gathering.",
            IsPrimary = false,
            SortOrder = 99,
        };

        await using (var db = CreateContext())
        {
            db.RoomPhotos.Add(photo);
            await db.SaveChangesAsync();
        }

        await using (var verifyDb = CreateContext())
        {
            var stored = await verifyDb.RoomPhotos.SingleAsync(p => p.Id == photo.Id);
            Assert.Equal("abc123", stored.StorageKey);
            Assert.Equal("https://cdn.example.org/media/abc123-400.jpg", stored.ThumbUrl);
            Assert.Equal("https://cdn.example.org/media/abc123-800.jpg", stored.CardUrl);
            Assert.Equal(FixedNow, stored.CreatedAtUtc);
        }
    }

    // ----- Test rig fakes --------------------------------------------------------------------

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    /// <summary>Always resolves inside the beachhead (Vienna, VA) — the real Google gateway is out
    /// of scope for these tests; the geofence rejection path is covered by <c>ManageServiceTests</c>.</summary>
    private sealed class FakeGeocodingGateway : IGeocodingGateway
    {
        public Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default) =>
            Task.FromResult<GeoPoint?>(new GeoPoint(38.9012, -77.2653));

        public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AddressSuggestion>>([]);
    }

    private sealed class FakeGeofencePolicy : IGeofencePolicy
    {
        public BoundingBox Beachhead => new(38.84, 38.96, -77.34, -77.12);

        public GeoPoint Center => new(38.9012, -77.2653);

        public string AreaName => "Vienna & nearby (Northern Virginia)";

        public bool IsWithinBeachhead(double latitude, double longitude) => Beachhead.Contains(latitude, longitude);

        public BoundingBox ResolveSearchBounds(ListingSearchQuery query) => Beachhead;
    }
}
