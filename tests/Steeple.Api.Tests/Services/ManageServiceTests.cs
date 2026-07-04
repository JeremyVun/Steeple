using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="ManageService"/>: the publish moderation gate (never-approved rooms
/// join the Admin queue; previously-approved rooms relist directly), publish-request withdrawal,
/// the unpublish-blocked-by-bookings guard, and the geofence rejection on venue save
/// (SYSTEM_DESIGN §9/§10, ROADMAP Phase 5). Ports are hand-rolled in-memory fakes, matching the
/// no-mocking-library idiom used elsewhere in this test project (see <c>ApplicationServiceTests</c>).
/// </summary>
public class ManageServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // ----- Publish request / relist -----------------------------------------------------------

    [Fact]
    public async Task UpdateRoomAsync_NeverApprovedRoomRequestsPublished_SetsPublishRequestedNotPublished()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        AddPhoto(room);
        var service = CreateService(repo, managers, out var analytics);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));

        Assert.Null(result.Error);
        var stored = repo.Rooms.Single();
        Assert.Equal(RoomStatus.Draft, stored.Status); // not flipped yet — awaiting Admin moderation
        Assert.NotNull(stored.PublishRequestedAtUtc);
        Assert.Equal(FixedNow, stored.PublishRequestedAtUtc);
        Assert.Null(stored.FirstPublishedAtUtc);
        Assert.Contains(analytics.Events, e => e.EventType == "listing_publish_requested");
    }

    [Fact]
    public async Task UpdateRoomAsync_PreviouslyPublishedRoomRelists_SetsPublishedImmediately()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Unlisted);
        room.FirstPublishedAtUtc = FixedNow.AddMonths(-2); // passed moderation once before
        AddPhoto(room);
        var service = CreateService(repo, managers, out var analytics);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));

        Assert.Null(result.Error);
        var stored = repo.Rooms.Single();
        Assert.Equal(RoomStatus.Published, stored.Status); // relisting is provider-controlled
        Assert.Null(stored.PublishRequestedAtUtc);
        Assert.DoesNotContain(analytics.Events, e => e.EventType == "listing_publish_requested");
    }

    [Fact]
    public async Task UpdateRoomAsync_WithdrawRequestByAskingForDraft_ClearsPublishRequestedAtUtc()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        room.PublishRequestedAtUtc = FixedNow.AddDays(-1); // already in the moderation queue
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("draft"));

        Assert.Null(result.Error);
        Assert.Null(repo.Rooms.Single().PublishRequestedAtUtc);
    }

    [Fact]
    public async Task UpdateRoomAsync_WithdrawRequestByAskingForUnlisted_ClearsPublishRequestedAtUtc()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        room.PublishRequestedAtUtc = FixedNow.AddDays(-1);
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("unlisted"));

        Assert.Null(result.Error);
        Assert.Null(repo.Rooms.Single().PublishRequestedAtUtc);
    }

    [Fact]
    public async Task UpdateRoomAsync_RequestingPublishTwice_DoesNotResetTheOriginalRequestTimestamp()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        AddPhoto(room);
        var service = CreateService(repo, managers, out var analytics);
        await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));
        var firstRequestedAt = repo.Rooms.Single().PublishRequestedAtUtc;
        analytics.Events.Clear();

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));

        Assert.Null(result.Error);
        Assert.Equal(firstRequestedAt, repo.Rooms.Single().PublishRequestedAtUtc);
        Assert.DoesNotContain(analytics.Events, e => e.EventType == "listing_publish_requested");
    }

    // ----- No-photos publish gate ---------------------------------------------------------------

    [Fact]
    public async Task UpdateRoomAsync_PublishRequestWithNoPhotos_FailsAndLeavesPublishRequestedAtUtcNull()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        var service = CreateService(repo, managers, out var analytics);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.NoPhotos, result.Error!.Code);
        Assert.Null(repo.Rooms.Single().PublishRequestedAtUtc);
        Assert.Equal(RoomStatus.Draft, repo.Rooms.Single().Status);
        Assert.DoesNotContain(analytics.Events, e => e.EventType == "listing_publish_requested");
    }

    [Fact]
    public async Task UpdateRoomAsync_PublishRequestWithAtLeastOnePhoto_Succeeds()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        AddPhoto(room);
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));

        Assert.Null(result.Error);
        Assert.NotNull(repo.Rooms.Single().PublishRequestedAtUtc);
    }

    [Fact]
    public async Task UpdateRoomAsync_RelistWithNoPhotos_FailsWithNoPhotos()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Unlisted);
        room.FirstPublishedAtUtc = FixedNow.AddMonths(-2); // passed moderation once before
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("published"));

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.NoPhotos, result.Error!.Code);
        Assert.Equal(RoomStatus.Unlisted, repo.Rooms.Single().Status);
    }

    [Fact]
    public async Task UpdateRoomAsync_WithdrawWithNoPhotos_StillSucceeds()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Draft);
        room.PublishRequestedAtUtc = FixedNow.AddDays(-1);
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("draft"));

        Assert.Null(result.Error);
        Assert.Null(repo.Rooms.Single().PublishRequestedAtUtc);
    }

    [Fact]
    public async Task UpdateRoomAsync_UnlistWithNoPhotos_StillSucceeds()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Published);
        repo.HasFutureConfirmedOccurrences = false;
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("unlisted"));

        Assert.Null(result.Error);
        Assert.Equal(RoomStatus.Unlisted, repo.Rooms.Single().Status);
    }

    // ----- Unpublish guard ---------------------------------------------------------------------

    [Fact]
    public async Task UpdateRoomAsync_UnpublishWithActiveBookings_ReturnsHasActiveBookingsAndLeavesStatusUnchanged()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Published);
        repo.HasFutureConfirmedOccurrences = true;
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("unlisted"));

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.HasActiveBookings, result.Error!.Code);
        Assert.Equal(RoomStatus.Published, repo.Rooms.Single().Status);
    }

    [Fact]
    public async Task UpdateRoomAsync_UnpublishWithoutActiveBookings_Succeeds()
    {
        var (repo, managers, _, room, manager) = NewScenario(status: RoomStatus.Published);
        repo.HasFutureConfirmedOccurrences = false;
        var service = CreateService(repo, managers, out _);

        var result = await service.UpdateRoomAsync(manager.Id, room.Id, StatusOnlyRequest("unlisted"));

        Assert.Null(result.Error);
        Assert.Equal(RoomStatus.Unlisted, repo.Rooms.Single().Status);
    }

    // ----- Geofence rejection on venue save -----------------------------------------------------

    [Fact]
    public async Task CreateVenueAsync_AddressGeocodesOutsideBeachhead_ReturnsGeofenceRejectedAndPersistsNothing()
    {
        var repo = new FakeManageRepository();
        var managers = new FakeVenueManagerRepository();
        var geocoding = new FakeGeocodingGateway { Point = new GeoPoint(40.7128, -74.0060) }; // NYC, outside beachhead
        var geofence = new FakeGeofencePolicy { WithinBeachhead = false };
        var service = CreateService(repo, managers, out _, geocoding, geofence);

        var result = await service.CreateVenueAsync(Guid.NewGuid(), NewSaveVenueRequest());

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.GeofenceRejected, result.Error!.Code);
        Assert.Empty(repo.Venues);
    }

    [Fact]
    public async Task CreateVenueAsync_AddressDoesNotGeocode_ReturnsInvalidVenue()
    {
        var repo = new FakeManageRepository();
        var managers = new FakeVenueManagerRepository();
        var geocoding = new FakeGeocodingGateway { Point = null };
        var service = CreateService(repo, managers, out _, geocoding);

        var result = await service.CreateVenueAsync(Guid.NewGuid(), NewSaveVenueRequest());

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.InvalidVenue, result.Error!.Code);
        Assert.Empty(repo.Venues);
    }

    [Fact]
    public async Task CreateVenueAsync_AddressInsideBeachhead_Succeeds()
    {
        var repo = new FakeManageRepository();
        var managers = new FakeVenueManagerRepository();
        var geocoding = new FakeGeocodingGateway { Point = new GeoPoint(38.9012, -77.2653) }; // Vienna, VA
        var geofence = new FakeGeofencePolicy { WithinBeachhead = true };
        var service = CreateService(repo, managers, out _, geocoding, geofence);

        var result = await service.CreateVenueAsync(Guid.NewGuid(), NewSaveVenueRequest());

        Assert.Null(result.Error);
        Assert.NotNull(result.Value);
        Assert.Single(repo.Venues);
    }

    [Fact]
    public async Task UpdateVenueAsync_AddressChangedToOutsideBeachhead_RejectsAndLeavesOriginalCoordinates()
    {
        var (repo, managers, venue, _, manager) = NewScenario();
        var originalLat = venue.Latitude;
        var geocoding = new FakeGeocodingGateway { Point = new GeoPoint(40.7128, -74.0060) };
        var geofence = new FakeGeofencePolicy { WithinBeachhead = false };
        var service = CreateService(repo, managers, out _, geocoding, geofence);

        var result = await service.UpdateVenueAsync(
            manager.Id, venue.Id, NewSaveVenueRequest(addressLine: "123 New Street"));

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.GeofenceRejected, result.Error!.Code);
        Assert.Equal(originalLat, repo.Venues.Single().Latitude);
    }

    [Fact]
    public async Task UpdateVenueAsync_AddressUnchanged_DoesNotReGeocode()
    {
        var (repo, managers, venue, _, manager) = NewScenario();
        var geocoding = new FakeGeocodingGateway { Point = null }; // would fail validation if called
        var service = CreateService(repo, managers, out _, geocoding);

        // Same address/suburb/postcode as NewVenue() below — only the name changes.
        var request = NewSaveVenueRequest(
            name: "Renamed Venue", addressLine: venue.AddressLine, suburb: venue.Suburb, postcode: venue.Postcode);
        var result = await service.UpdateVenueAsync(manager.Id, venue.Id, request);

        Assert.Null(result.Error);
        Assert.False(geocoding.WasCalled);
        Assert.Equal("Renamed Venue", repo.Venues.Single().Name);
    }

    // ----- Party scoping ------------------------------------------------------------------------

    [Fact]
    public async Task UpdateRoomAsync_CallerIsNotVenueManager_ReturnsNotFound()
    {
        var (repo, managers, _, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);
        var stranger = Guid.NewGuid();

        var result = await service.UpdateRoomAsync(stranger, room.Id, StatusOnlyRequest("unlisted"));

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.NotFound, result.Error!.Code);
    }

    // ----- Scenario / request builders ----------------------------------------------------------

    private static (FakeManageRepository Repo, FakeVenueManagerRepository Managers, Venue Venue, Room Room, User Manager) NewScenario(
        RoomStatus status = RoomStatus.Published)
    {
        var venue = NewVenue();
        var room = NewRoom(venue, status);
        var manager = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Casey Manager",
            Email = "casey@example.com",
            CreatedAtUtc = FixedNow,
        };

        var repo = new FakeManageRepository();
        repo.Venues.Add(venue);
        repo.Rooms.Add(room);

        var managers = new FakeVenueManagerRepository();
        managers.AddManager(venue.Id, manager.Id);

        return (repo, managers, venue, room, manager);
    }

    private static Venue NewVenue() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Grace Test Venue",
        Slug = $"grace-{Guid.NewGuid():N}",
        Description = "A welcoming space.",
        AddressLine = "123 Church St",
        Suburb = "Vienna",
        Postcode = "22180",
        Latitude = 38.9012,
        Longitude = -77.2653,
        CreatedAtUtc = FixedNow,
        UpdatedAtUtc = FixedNow,
    };

    private static Room NewRoom(Venue venue, RoomStatus status) => new()
    {
        Id = Guid.NewGuid(),
        VenueId = venue.Id,
        Venue = venue,
        Name = "Fellowship Hall",
        Slug = $"fellowship-hall-{Guid.NewGuid():N}",
        Description = "A large hall.",
        Capacity = 50,
        Status = status,
        CreatedAtUtc = FixedNow,
        UpdatedAtUtc = FixedNow,
    };

    private static void AddPhoto(Room room) => room.Photos.Add(new RoomPhoto
    {
        Id = Guid.NewGuid(),
        RoomId = room.Id,
        Room = room,
        Url = "https://example.com/photo.jpg",
        CreatedAtUtc = FixedNow,
        IsPrimary = true,
    });

    private static SaveRoomRequest StatusOnlyRequest(string status) =>
        new(Name: null, Description: null, Capacity: null, PricePerHour: null, HouseRules: null,
            Status: status, Activities: null, Amenities: null, Accessibility: null);

    private static SaveVenueRequest NewSaveVenueRequest(
        string name = "New Grace Venue",
        string addressLine = "456 Chapel Rd",
        string suburb = "Vienna",
        string postcode = "22180") =>
        new(
            Name: name,
            Description: "A welcoming space for the community.",
            VenueType: null,
            AddressLine: addressLine,
            Suburb: suburb,
            Postcode: postcode,
            ContactEmail: null,
            ParkingInfo: null,
            TransitInfo: null);

    private static ManageService CreateService(
        FakeManageRepository repo,
        FakeVenueManagerRepository managers,
        out FakeAnalyticsSink analytics,
        IGeocodingGateway? geocoding = null,
        IGeofencePolicy? geofence = null)
    {
        analytics = new FakeAnalyticsSink();
        return new ManageService(
            repo,
            managers,
            geocoding ?? new FakeGeocodingGateway { Point = new GeoPoint(38.9012, -77.2653) },
            geofence ?? new FakeGeofencePolicy { WithinBeachhead = true },
            analytics,
            new FixedTimeProvider(FixedNow),
            Options.Create(new GeocodingOptions()));
    }

    // ----- Fakes ---------------------------------------------------------------------------------

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FakeAnalyticsSink : IAnalyticsSink
    {
        public List<(string EventType, object? Payload)> Events { get; } = [];

        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default)
        {
            Events.Add((eventType, payload));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeGeocodingGateway : IGeocodingGateway
    {
        public GeoPoint? Point { get; set; }

        public bool WasCalled { get; private set; }

        public Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(Point);
        }

        public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AddressSuggestion>>([]);
    }

    private sealed class FakeGeofencePolicy : IGeofencePolicy
    {
        public bool WithinBeachhead { get; set; } = true;

        public BoundingBox Beachhead => new(38.84, 38.96, -77.34, -77.12);

        public GeoPoint Center => new(38.9012, -77.2653);

        public string AreaName => "Vienna & nearby (Northern Virginia)";

        public bool IsWithinBeachhead(double latitude, double longitude) => WithinBeachhead;

        public BoundingBox ResolveSearchBounds(ListingSearchQuery query) => Beachhead;
    }

    private sealed class FakeVenueManagerRepository : IVenueManagerRepository
    {
        private readonly List<(Guid VenueId, Guid UserId)> _managers = [];

        public void AddManager(Guid venueId, Guid userId) => _managers.Add((venueId, userId));

        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(_managers.Any(m => m.VenueId == venueId && m.UserId == userId));

        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Guid>>(
                _managers.Where(m => m.UserId == userId).Select(m => m.VenueId).Distinct().ToList());

        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Venue>>([]);

        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<User>>([]);
    }

    /// <summary>
    /// In-memory stand-in for <see cref="IManageRepository"/>. Mutates the same object references
    /// the service holds (mirroring EF Core's change tracker), matching <c>FakeApplicationRepository</c>'s
    /// idiom in <c>ApplicationServiceTests</c>.
    /// </summary>
    private sealed class FakeManageRepository : IManageRepository
    {
        public List<Venue> Venues { get; } = [];

        public List<Room> Rooms { get; } = [];

        public bool HasFutureConfirmedOccurrences { get; set; }

        public Task<Venue?> GetVenueWithRoomsAsync(Guid venueId, CancellationToken ct = default)
        {
            var venue = Venues.FirstOrDefault(v => v.Id == venueId);
            if (venue is not null)
            {
                venue.Rooms = Rooms.Where(r => r.VenueId == venueId).ToList();
            }

            return Task.FromResult(venue);
        }

        public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default)
        {
            var room = Rooms.FirstOrDefault(r => r.Id == roomId);
            if (room is not null)
            {
                room.Venue ??= Venues.FirstOrDefault(v => v.Id == room.VenueId);
            }

            return Task.FromResult(room);
        }

        public Task AddVenueWithManagerAsync(Venue venue, Guid managerUserId, CancellationToken ct = default)
        {
            Venues.Add(venue);
            return Task.CompletedTask;
        }

        public Task AddRoomAsync(Room room, CancellationToken ct = default)
        {
            Rooms.Add(room);
            return Task.CompletedTask;
        }

        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;

        public Task<bool> VenueSlugExistsAsync(string slug, CancellationToken ct = default) =>
            Task.FromResult(Venues.Any(v => v.Slug == slug));

        public Task<bool> RoomSlugExistsAsync(Guid venueId, string slug, CancellationToken ct = default) =>
            Task.FromResult(Rooms.Any(r => r.VenueId == venueId && r.Slug == slug));

        public Task<bool> HasFutureConfirmedOccurrencesAsync(Guid roomId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult(HasFutureConfirmedOccurrences);

        public Task<bool> HasPublishedRoomsAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(Rooms.Any(r => r.VenueId == venueId && r.Status == RoomStatus.Published));
    }
}
