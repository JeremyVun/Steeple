using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="ListingService"/> detail lookups: only Published rooms inside the
/// beachhead are publicly visible. Search filters status in SQL, but direct id/slug lookups rely
/// on the service-level gate — these tests pin that behavior (a Draft room must not leak via a
/// guessed or previously-shared URL).
/// </summary>
public class ListingServiceTests
{
    // Inside the beachhead used across the unit tests (mirrors src/Steeple.Api/appsettings.json).
    private const double InAreaLatitude = 38.9012;
    private const double InAreaLongitude = -77.2653;

    [Theory]
    [InlineData(RoomStatus.Draft)]
    [InlineData(RoomStatus.Unlisted)]
    public async Task GetBySlugAsync_NonPublishedRoom_ReturnsNull(RoomStatus status)
    {
        var service = CreateService(CreateRoom(status));

        var detail = await service.GetBySlugAsync("st-andrews", "main-hall");

        Assert.Null(detail);
    }

    [Fact]
    public async Task GetBySlugAsync_PublishedRoomInsideBeachhead_ReturnsDetail()
    {
        var service = CreateService(CreateRoom(RoomStatus.Published));

        var detail = await service.GetBySlugAsync("st-andrews", "main-hall");

        Assert.NotNull(detail);
        Assert.Equal("main-hall", detail.RoomSlug);
    }

    [Theory]
    [InlineData(RoomStatus.Draft)]
    [InlineData(RoomStatus.Unlisted)]
    public async Task GetByIdAsync_NonPublishedRoom_ReturnsNull(RoomStatus status)
    {
        var room = CreateRoom(status);
        var service = CreateService(room);

        var detail = await service.GetByIdAsync(room.Id);

        Assert.Null(detail);
    }

    [Fact]
    public async Task GetByIdAsync_PublishedRoomOutsideBeachhead_ReturnsNull()
    {
        // Defence-in-depth: even a Published room is invisible when its venue sits outside the area.
        var room = CreateRoom(RoomStatus.Published, latitude: 40.0, longitude: -75.0);
        var service = CreateService(room);

        var detail = await service.GetByIdAsync(room.Id);

        Assert.Null(detail);
    }

    private static ListingService CreateService(Room room) =>
        new(new StubRoomRepository(room), CreatePolicy(), new NullAnalyticsSink());

    private static Room CreateRoom(RoomStatus status, double latitude = InAreaLatitude, double longitude = InAreaLongitude)
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "St. Andrew's",
            Slug = "st-andrews",
            Suburb = "Vienna",
            Latitude = latitude,
            Longitude = longitude,
        };
        return new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Venue = venue,
            Name = "Main Hall",
            Slug = "main-hall",
            Capacity = 40,
            Status = status,
        };
    }

    private static GeofencePolicy CreatePolicy() =>
        new(Options.Create(new GeofenceOptions
        {
            AreaName = "Vienna & nearby (Northern Virginia)",
            MinLatitude = 38.84,
            MaxLatitude = 38.96,
            MinLongitude = -77.34,
            MaxLongitude = -77.12,
            CenterLatitude = InAreaLatitude,
            CenterLongitude = InAreaLongitude,
        }));

    /// <summary>Returns the single configured room for any id/slug lookup; search is unused here.</summary>
    private sealed class StubRoomRepository : IRoomRepository
    {
        private readonly Room _room;

        public StubRoomRepository(Room room) => _room = room;

        public Task<Room?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<Room?>(id == _room.Id ? _room : null);

        public Task<Room?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default) =>
            Task.FromResult<Room?>(venueSlug == _room.Venue!.Slug && roomSlug == _room.Slug ? _room : null);

        public Task<IReadOnlyList<Room>> SearchAsync(RoomSearchCriteria criteria, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Room>>([]);

        public Task<int> CountAsync(RoomSearchCriteria criteria, CancellationToken ct = default) =>
            Task.FromResult(0);

        public Task<IReadOnlyList<string>> GetPublishedSuburbsAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<string>>([]);

        public Task<IReadOnlyList<SitemapEntry>> GetPublishedForSitemapAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<SitemapEntry>>([]);
    }

    private sealed class NullAnalyticsSink : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }
}
