using Microsoft.EntityFrameworkCore;
using Steeple.Api.Contracts.Applications;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration test for the guest availability reads (<see cref="AvailabilityService"/> over the
/// real <see cref="EfAvailabilityRepository"/>) against Postgres with the Liquibase-owned schema.
/// Seeds a published room with open hours + a <b>confirmed</b> booking occurrence, then proves the
/// calendar feed subtracts the booked slot and the schedule check flags an overlapping request as
/// <c>booked</c> — the <c>booking_occurrences</c> read path working end to end.
/// </summary>
[Collection(PostgresCollection.Name)]
public class CancelledAvailabilityTests
{
    // 2026-11-01 is a Sunday and the America/New_York DST fall-back — venue-local today is well before.
    private static readonly DateTimeOffset FixedNow = new(2026, 10, 31, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly BookingDate = new(2026, 11, 1);

    private readonly PostgresDatabaseFixture _fixture;

    public CancelledAvailabilityTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

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
    public async Task CancelWithin48Hours_KeepsScheduledTimeUnavailable()
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Guest Availability Venue",
            Slug = $"guest-avail-{Guid.NewGuid():N}",
            Description = "A space.",
            AddressLine = "1 Test Way",
            Suburb = "Vienna",
            Postcode = "22180",
            Latitude = 0,
            Longitude = 0,
            Timezone = "America/New_York",
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };
        var organizer = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Organizer Ollie",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Name = "Hall",
            Slug = $"hall-{Guid.NewGuid():N}",
            Description = "A hall.",
            Capacity = 40,
            PricePerHour = 30m,
            Status = RoomStatus.Published,
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };

        // Confirmed booking: Sunday 10:00–12:00 venue-local on the booking date.
        var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        DateTimeOffset LocalToUtc(string time) => new(
            TimeZoneInfo.ConvertTimeToUtc(BookingDate.ToDateTime(TimeOnly.Parse(time)), tz), TimeSpan.Zero);

        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 20,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = BookingDate,
            EndDate = BookingDate,
            StartTime = new TimeOnly(10, 0),
            EndTime = new TimeOnly(12, 0),
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
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = BookingDate,
            EndDate = BookingDate,
            StartTime = new TimeOnly(10, 0),
            EndTime = new TimeOnly(12, 0),
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = FixedNow,
        };
        var occurrence = new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = room.Id,
            StartUtc = LocalToUtc("10:00"),
            EndUtc = LocalToUtc("12:00"),
            LocalDate = BookingDate,
            Status = OccurrenceStatus.Scheduled,
        };

        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(organizer);
            seedDb.Venues.Add(venue);
            seedDb.Rooms.Add(room);
            seedDb.RoomOpenHours.Add(new RoomOpenHours
            {
                Id = Guid.NewGuid(),
                RoomId = room.Id,
                DayOfWeek = DayOfWeek.Sunday,
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(17, 0),
                CreatedAtUtc = FixedNow,
            });
            seedDb.Applications.Add(application);
            seedDb.Bookings.Add(booking);
            seedDb.BookingOccurrences.Add(occurrence);
            await seedDb.SaveChangesAsync();
        }

        await using (var db = CreateContext())
        {
            var bookingService = new BookingService(new EfBookingRepository(db), new NullVenueManagers(),
                new NullRatings(), new NullPaymentService(), new TestFeatureFlags(), new NullNotifications(),
                new NullAnalytics(), new FixedTimeProvider(FixedNow), PaymentTestOptions.Payments(), new EfServiceTransaction(db, Microsoft.Extensions.Logging.Abstractions.NullLogger<EfServiceTransaction>.Instance));
            var result = await bookingService.CancelAsync(booking.Id, organizer.Id,
                new Steeple.Api.Contracts.Bookings.CancelBookingRequest("Cannot attend"));
            Assert.Null(result.Error);
        }
        await using (var db = CreateContext())
        {
            var held = await db.BookingOccurrences.SingleAsync(o => o.Id == occurrence.Id);
            Assert.Equal(OccurrenceStatus.Scheduled, held.Status);
            var cancelled = await db.Bookings.SingleAsync(b => b.Id == booking.Id);
            Assert.Equal(BookingStatus.Cancelled, cancelled.Status);
            var service = CreateService(db);
            var feed = await service.GetPublicAvailabilityAsync(room.Id, BookingDate, BookingDate);
            var windows = Assert.Single(feed.Value!.Days).FreeWindows;
            Assert.Equal(new[] { ("09:00", "10:00"), ("12:00", "17:00") },
                windows.Select(w => (w.StartTime, w.EndTime)));
            var check = await service.CheckScheduleAsync(room.Id,
                new ScheduleDto("oneOff", BookingDate, null, null, "10:00", "12:00"));
            Assert.False(check.Value!.Available);
            Assert.Equal("booked", Assert.Single(check.Value.Conflicts).Reason);
            var repository = new EfAvailabilityRepository(db);
            Assert.Single(await repository.GetConfirmedOccurrencesForRoomsAsync([room.Id], LocalToUtc("09:00"), LocalToUtc("17:00")));
            Assert.Single(await repository.GetCalendarOccurrencesAsync([room.Id], LocalToUtc("09:00"), LocalToUtc("17:00")));
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
