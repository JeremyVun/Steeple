using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Steeple.Api.Configuration;
using Steeple.Api.Services;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration test for the time-first ("When") search over real Postgres: the EF-translatable
/// open-hours/blackout SQL prefilter (<see cref="RoomRepository.SearchAllAsync"/>) plus the
/// <see cref="AvailabilityService"/> free-window refinement, driven end-to-end through
/// <see cref="ListingService"/>. Seeds four rooms — only one has a free window matching an explicit
/// 18:00–20:00 request on the target Monday — and asserts the search returns exactly that room with
/// its <c>matchedWindow</c>. Follows the <see cref="GuestAvailabilityIntegrationTests"/> style.
/// </summary>
[Collection(PostgresCollection.Name)]
public class WhenSearchIntegrationTests
{
    // 08:00 America/New_York on Monday 2026-07-06; the target date is the next Monday, 2026-07-13.
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 6, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly TargetMonday = new(2026, 7, 13);
    private static readonly TimeZoneInfo Tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    private readonly PostgresDatabaseFixture _fixture;

    public WhenSearchIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>().UseNpgsql(_fixture.ConnectionString).Options);

    [Fact]
    public async Task WhenSearch_ReturnsOnlyTheRoomWithAMatchingFreeWindow_WithMatchedWindow()
    {
        var venue = NewVenue();
        // matcher: open Monday 09:00–22:00, no bookings -> 18:00–20:00 is free.
        var matcher = NewRoom(venue.Id, "the-matcher");
        // tooShort: open Monday only 09:00–10:00 -> SQL prefilter drops it (no window contains 18–20).
        var tooShort = NewRoom(venue.Id, "too-short");
        // wrongDay: open Tuesday only -> SQL prefilter drops it (no Monday open hours).
        var wrongDay = NewRoom(venue.Id, "wrong-day");
        // booked: open Monday 09:00–22:00 but a confirmed 18:00–20:00 booking on the target date
        //         -> passes the SQL prefilter, dropped by refinement.
        var booked = NewRoom(venue.Id, "booked");

        DateTimeOffset ToUtc(DateOnly d, string t) =>
            new(TimeZoneInfo.ConvertTimeToUtc(d.ToDateTime(TimeOnly.Parse(t)), Tz), TimeSpan.Zero);

        var organizer = new User { Id = Guid.NewGuid(), DisplayName = "Ollie", Email = $"{Guid.NewGuid():N}@e.com", CreatedAtUtc = FixedNow };
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = booked.Id,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 20,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = TargetMonday,
            EndDate = TargetMonday,
            StartTime = new TimeOnly(18, 0),
            EndTime = new TimeOnly(20, 0),
            IntentText = "Booked slot.",
            Status = ApplicationStatus.Approved,
            CreatedAtUtc = FixedNow,
            DecidedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            RoomId = booked.Id,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = TargetMonday,
            EndDate = TargetMonday,
            StartTime = new TimeOnly(18, 0),
            EndTime = new TimeOnly(20, 0),
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = FixedNow,
        };

        await using (var seed = CreateContext())
        {
            seed.Users.Add(organizer);
            seed.Venues.Add(venue);
            seed.Rooms.AddRange(matcher, tooShort, wrongDay, booked);
            seed.Applications.Add(application);
            seed.RoomOpenHours.AddRange(
                OpenHours(matcher.Id, DayOfWeek.Monday, "09:00", "22:00"),
                OpenHours(tooShort.Id, DayOfWeek.Monday, "09:00", "10:00"),
                OpenHours(wrongDay.Id, DayOfWeek.Tuesday, "09:00", "22:00"),
                OpenHours(booked.Id, DayOfWeek.Monday, "09:00", "22:00"));
            seed.Bookings.Add(booking);
            seed.BookingOccurrences.Add(new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RoomId = booked.Id,
                StartUtc = ToUtc(TargetMonday, "18:00"),
                EndUtc = ToUtc(TargetMonday, "20:00"),
                LocalDate = TargetMonday,
                Status = OccurrenceStatus.Scheduled,
            });
            await seed.SaveChangesAsync();
        }

        try
        {
            await using var db = CreateContext();
            var service = CreateListingService(db);

            var when = new AvailabilityFilter(
                IsRecurring: false, Date: TargetMonday, Weekdays: Weekdays.None, RangeKind: WhenRangeKind.Explicit,
                RangeStart: new TimeOnly(18, 0), RangeEnd: new TimeOnly(20, 0), DurationMinutes: 120, TimeOfDayBand: null);

            var result = await service.SearchAsync(new ListingSearchQuery { PageSize = 50 }, when);

            // Only the matcher survives, and it carries the free window that satisfied the request.
            var seededIds = new HashSet<Guid> { matcher.Id, tooShort.Id, wrongDay.Id, booked.Id };
            var mine = result.Items.Where(i => seededIds.Contains(i.RoomId)).ToList();
            var item = Assert.Single(mine);
            Assert.Equal(matcher.Id, item.RoomId);
            Assert.NotNull(item.MatchedWindow);
            Assert.Equal(TargetMonday, item.MatchedWindow!.Date);
            Assert.Equal(("09:00", "22:00"), (item.MatchedWindow.StartTime, item.MatchedWindow.EndTime));
        }
        finally
        {
            // The Postgres container is shared across the collection with no per-test reset, and
            // other classes assert on the seed's exact Published-room counts — so this test removes
            // every row it added (in dependency order) rather than leaking Published rooms.
            await using var cleanup = CreateContext();
            var roomIds = new[] { matcher.Id, tooShort.Id, wrongDay.Id, booked.Id };
            await cleanup.BookingOccurrences.Where(o => roomIds.Contains(o.RoomId)).ExecuteDeleteAsync();
            await cleanup.Bookings.Where(b => roomIds.Contains(b.RoomId)).ExecuteDeleteAsync();
            await cleanup.Applications.Where(a => roomIds.Contains(a.RoomId)).ExecuteDeleteAsync();
            await cleanup.RoomOpenHours.Where(h => roomIds.Contains(h.RoomId)).ExecuteDeleteAsync();
            await cleanup.Rooms.Where(r => r.VenueId == venue.Id).ExecuteDeleteAsync();
            await cleanup.Venues.Where(v => v.Id == venue.Id).ExecuteDeleteAsync();
            await cleanup.Users.Where(u => u.Id == organizer.Id).ExecuteDeleteAsync();
        }
    }

    private ListingService CreateListingService(SteepleDbContext db) =>
        new(
            new RoomRepository(db),
            new GeofencePolicy(Options.Create(new GeofenceOptions
            {
                AreaName = "Vienna",
                MinLatitude = 38.84,
                MaxLatitude = 38.96,
                MinLongitude = -77.34,
                MaxLongitude = -77.12,
                CenterLatitude = 38.9012,
                CenterLongitude = -77.2653,
            })),
            new NullRatings(),
            new AvailabilityService(new EfAvailabilityRepository(db), new EfVenueManagerRepository(db), new NullAnalytics(), new FixedClock(FixedNow)),
            new NullAnalytics(),
            new FixedClock(FixedNow));

    private static Venue NewVenue() => new()
    {
        Id = Guid.NewGuid(),
        Name = "When Search Venue",
        Slug = $"when-search-{Guid.NewGuid():N}",
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

    private static Room NewRoom(Guid venueId, string slug) => new()
    {
        Id = Guid.NewGuid(),
        VenueId = venueId,
        Name = slug,
        Slug = $"{slug}-{Guid.NewGuid():N}"[..Math.Min(slug.Length + 9, 60)],
        Description = "A room.",
        Capacity = 40,
        PricePerHour = 30m,
        Status = RoomStatus.Published,
        CreatedAtUtc = FixedNow,
        UpdatedAtUtc = FixedNow,
    };

    private static RoomOpenHours OpenHours(Guid roomId, DayOfWeek day, string start, string end) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId,
        DayOfWeek = day,
        StartTime = TimeOnly.Parse(start),
        EndTime = TimeOnly.Parse(end),
        CreatedAtUtc = FixedNow,
    };

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NullRatings : IRatingService
    {
        public Task<BookingResult<RatingSubmissionResult>> SubmitAsync(Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyDictionary<Guid, BookingRatingsDto>>(new Dictionary<Guid, BookingRatingsDto>());
        public Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyDictionary<Guid, RatingSummaryDto>>(new Dictionary<Guid, RatingSummaryDto>());
        public Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>>(new Dictionary<Guid, OrganizerRatingSummaryDto>());
        public Task<VenueReviewPageDto> GetVenueReviewsAsync(Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default) => Task.FromResult(new VenueReviewPageDto([], 0, Math.Max(page, 1), Math.Clamp(pageSize, 1, 50)));
    }
}
