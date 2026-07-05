using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="ListingService"/>'s time-first ("When") search path: refinement drops
/// non-matching candidates and only <b>then</b> paginates, survivors carry their
/// <see cref="MatchedWindowDto"/>, and a When filter can never widen the (already geo-filtered)
/// candidate set the repository returns — it is drop-only. The repo is the geofence authority here,
/// so proving the service can't add rooms beyond its candidates is the "never widens geo" guarantee.
/// </summary>
public class ListingServiceWhenTests
{
    private const double InAreaLatitude = 38.9012;
    private const double InAreaLongitude = -77.2653;

    [Fact]
    public async Task WhenFilter_RefinesThenPaginates_SurvivorsCarryMatchedWindow()
    {
        // Three geo-candidates; the refiner matches only two of them.
        var a = Room("Alpha", "alpha-hall");
        var b = Room("Bravo", "bravo-hall");
        var c = Room("Charlie", "charlie-hall");
        var repo = new StubRepo([a, b, c]);
        var window = new MatchedWindowDto(new DateOnly(2026, 7, 13), "18:00", "20:00");
        var avail = new StubAvailability(new Dictionary<Guid, MatchedWindowDto> { [a.Id] = window, [c.Id] = window });
        var service = CreateService(repo, avail);

        var when = new AvailabilityFilter(false, new DateOnly(2026, 7, 13), Weekdays.None, WhenRangeKind.Explicit,
            new TimeOnly(18, 0), new TimeOnly(20, 0), 120, null);
        var result = await service.SearchAsync(new ListingSearchQuery { PageSize = 1, Page = 1 }, when);

        // Only the two matchers count; page 1 holds one (Alpha, alphabetical), and it carries the window.
        Assert.Equal(2, result.TotalCount);
        var item = Assert.Single(result.Items);
        Assert.Equal("alpha-hall", item.RoomSlug);
        Assert.Equal(window, item.MatchedWindow);
        // The refiner saw exactly the repo's geo-candidates — never widened.
        Assert.Equal(new HashSet<Guid> { a.Id, b.Id, c.Id }, avail.SeenRoomIds.ToHashSet());
        Assert.True(repo.SearchAllCalled);
        Assert.NotNull(repo.LastCriteria!.When);
    }

    [Fact]
    public async Task WhenFilter_Page2_ReturnsTheRefinedRemainder()
    {
        var a = Room("Alpha", "alpha-hall");
        var b = Room("Bravo", "bravo-hall");
        var repo = new StubRepo([a, b]);
        var window = new MatchedWindowDto(null, "09:00", "11:00");
        var avail = new StubAvailability(new Dictionary<Guid, MatchedWindowDto> { [a.Id] = window, [b.Id] = window });
        var service = CreateService(repo, avail);

        var when = new AvailabilityFilter(true, null, Weekdays.Tuesday, WhenRangeKind.AnyWindow, default, default, 120, null);
        var result = await service.SearchAsync(new ListingSearchQuery { PageSize = 1, Page = 2 }, when);

        Assert.Equal(2, result.TotalCount);
        Assert.Equal("bravo-hall", Assert.Single(result.Items).RoomSlug);
    }

    [Fact]
    public async Task NoWhenFilter_RefinerNeverConsulted()
    {
        var a = Room("Alpha", "alpha-hall");
        var repo = new StubRepo([a]);
        var avail = new StubAvailability(new Dictionary<Guid, MatchedWindowDto>());
        var service = CreateService(repo, avail);

        var result = await service.SearchAsync(new ListingSearchQuery(), when: null);

        Assert.False(repo.SearchAllCalled); // plain path pages in SQL
        Assert.False(avail.WasCalled);
        Assert.Null(Assert.Single(result.Items).MatchedWindow);
    }

    // ----- helpers -----------------------------------------------------------------------------

    private static ListingService CreateService(StubRepo repo, StubAvailability avail) =>
        new(repo, CreatePolicy(), new FakeRatings(), avail, new NullAnalytics(), new FixedClock());

    private static Room Room(string venueName, string roomSlug)
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = venueName,
            Slug = venueName.ToLowerInvariant(),
            Suburb = "Vienna",
            Timezone = "America/New_York",
            Latitude = InAreaLatitude,
            Longitude = InAreaLongitude,
        };
        return new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Venue = venue,
            Name = roomSlug,
            Slug = roomSlug,
            Capacity = 40,
            Status = RoomStatus.Published,
        };
    }

    private static GeofencePolicy CreatePolicy() =>
        new(Options.Create(new GeofenceOptions
        {
            AreaName = "Vienna",
            MinLatitude = 38.84,
            MaxLatitude = 38.96,
            MinLongitude = -77.34,
            MaxLongitude = -77.12,
            CenterLatitude = InAreaLatitude,
            CenterLongitude = InAreaLongitude,
        }));

    private sealed class StubRepo(IReadOnlyList<Room> rooms) : IRoomRepository
    {
        public bool SearchAllCalled { get; private set; }

        public RoomSearchCriteria? LastCriteria { get; private set; }

        public Task<IReadOnlyList<Room>> SearchAllAsync(RoomSearchCriteria criteria, CancellationToken ct = default)
        {
            SearchAllCalled = true;
            LastCriteria = criteria;
            return Task.FromResult(rooms);
        }

        public Task<IReadOnlyList<Room>> SearchAsync(RoomSearchCriteria criteria, CancellationToken ct = default)
        {
            LastCriteria = criteria;
            return Task.FromResult<IReadOnlyList<Room>>(rooms.Skip(criteria.Skip).Take(criteria.Take).ToList());
        }

        public Task<int> CountAsync(RoomSearchCriteria criteria, CancellationToken ct = default) => Task.FromResult(rooms.Count);
        public Task<Room?> GetByIdAsync(Guid id, CancellationToken ct = default) => Task.FromResult<Room?>(null);
        public Task<Room?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default) => Task.FromResult<Room?>(null);
        public Task<IReadOnlyList<string>> GetPublishedSuburbsAsync(CancellationToken ct = default) => Task.FromResult<IReadOnlyList<string>>([]);
        public Task<IReadOnlyList<SitemapEntry>> GetPublishedForSitemapAsync(CancellationToken ct = default) => Task.FromResult<IReadOnlyList<SitemapEntry>>([]);
    }

    private sealed class StubAvailability(IReadOnlyDictionary<Guid, MatchedWindowDto> matched) : IAvailabilityService
    {
        public bool WasCalled { get; private set; }

        public List<Guid> SeenRoomIds { get; } = [];

        public Task<IReadOnlyDictionary<Guid, MatchedWindowDto>> FilterByWhenAsync(
            IReadOnlyList<(Guid RoomId, string Timezone)> candidates, AvailabilityFilter filter, CancellationToken ct = default)
        {
            WasCalled = true;
            SeenRoomIds.AddRange(candidates.Select(c => c.RoomId));
            return Task.FromResult(matched);
        }

        public Task<ManageResult<RoomAvailabilityRulesDto>> GetRulesAsync(Guid callerId, Guid roomId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<ManageResult<RoomAvailabilityRulesDto>> SaveRulesAsync(Guid callerId, Guid roomId, SaveAvailabilityRulesRequest request, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default) => Task.FromResult(false);
        public Task<IReadOnlyList<DayOpenHoursDto>?> GetPublicOpenHoursAsync(Guid roomId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<DayOpenHoursDto>?>(null);
        public Task<AvailabilityReadResult<RoomAvailabilityDto>> GetPublicAvailabilityAsync(Guid roomId, DateOnly from, DateOnly to, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<AvailabilityReadResult<ScheduleCheckResultDto>> CheckScheduleAsync(Guid roomId, ScheduleDto? schedule, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 7, 6, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class FakeRatings : IRatingService
    {
        public Task<BookingResult<RatingSubmissionResult>> SubmitAsync(Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyDictionary<Guid, BookingRatingsDto>>(new Dictionary<Guid, BookingRatingsDto>());
        public Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyDictionary<Guid, RatingSummaryDto>>(new Dictionary<Guid, RatingSummaryDto>());
        public Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>>(new Dictionary<Guid, OrganizerRatingSummaryDto>());
        public Task<VenueReviewPageDto> GetVenueReviewsAsync(Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult(new VenueReviewPageDto([], 0, Math.Max(page, 1), Math.Clamp(pageSize, 1, 50)));
    }
}
