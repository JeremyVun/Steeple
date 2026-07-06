using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration test for the venue calendar (<see cref="AvailabilityService.GetVenueCalendarAsync"/>
/// over the real <see cref="EfAvailabilityRepository"/>) against a real Postgres with the
/// Liquibase-owned schema. Seeds a managed venue with a confirmed booking occurrence and a pending
/// application, then proves both layers — confirmed occurrences and the pending overlay — survive a
/// round-trip and land in the calendar, venue-local.
/// </summary>
[Collection(PostgresCollection.Name)]
public class VenueCalendarIntegrationTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 5, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresDatabaseFixture _fixture;

    public VenueCalendarIntegrationTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

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
    public async Task GetVenueCalendar_ReturnsConfirmedOccurrencesAndPendingOverlay()
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        DateTimeOffset ToUtc(DateOnly date, TimeOnly time) =>
            new(TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(time), tz), TimeSpan.Zero);

        var manager = new User { Id = Guid.NewGuid(), DisplayName = "Provider Pat", Email = $"{Guid.NewGuid():N}@example.com", CreatedAtUtc = FixedNow };
        var bookedOrganizer = new User { Id = Guid.NewGuid(), DisplayName = "Bella Booked", Email = $"{Guid.NewGuid():N}@example.com", CreatedAtUtc = FixedNow };
        var pendingOrganizer = new User { Id = Guid.NewGuid(), DisplayName = "Priya Pending", Email = $"{Guid.NewGuid():N}@example.com", CreatedAtUtc = FixedNow };
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Calendar Test Venue",
            Slug = $"cal-{Guid.NewGuid():N}",
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
            PricePerHour = 30m,
            // Draft so this seed never pollutes the shared-Postgres search/count tests — the calendar
            // lists rooms of every status regardless (hosts see their whole venue).
            Status = RoomStatus.Draft,
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };

        var bookedDate = new DateOnly(2026, 7, 10);
        var approvedApp = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = bookedOrganizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 20,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = bookedDate,
            EndDate = bookedDate,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "Booked meetup.",
            Status = ApplicationStatus.Approved,
            CreatedAtUtc = FixedNow,
            DecidedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = approvedApp.Id,
            RoomId = room.Id,
            OrganizerId = bookedOrganizer.Id,
            Type = BookingType.OneOff,
            StartDate = bookedDate,
            EndDate = bookedDate,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = FixedNow,
        };
        var occurrence = new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = room.Id,
            StartUtc = ToUtc(bookedDate, new TimeOnly(9, 0)),
            EndUtc = ToUtc(bookedDate, new TimeOnly(11, 0)),
            LocalDate = bookedDate,
            Status = OccurrenceStatus.Scheduled,
        };

        var pendingDate = new DateOnly(2026, 7, 15);
        var pendingApp = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = pendingOrganizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 12,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = pendingDate,
            EndDate = pendingDate,
            StartTime = new TimeOnly(13, 0),
            EndTime = new TimeOnly(14, 0),
            IntentText = "Would like to use the hall.",
            Status = ApplicationStatus.Pending,
            CreatedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };

        await using (var seedDb = CreateContext())
        {
            seedDb.Users.AddRange(manager, bookedOrganizer, pendingOrganizer);
            seedDb.Venues.Add(venue);
            seedDb.Rooms.Add(room);
            seedDb.VenueManagers.Add(new VenueManager { Id = Guid.NewGuid(), VenueId = venue.Id, UserId = manager.Id, CreatedAtUtc = FixedNow });
            seedDb.Applications.AddRange(approvedApp, pendingApp);
            seedDb.Bookings.Add(booking);
            seedDb.BookingOccurrences.Add(occurrence);
            await seedDb.SaveChangesAsync();
        }

        await using var db = CreateContext();
        var result = await CreateService(db).GetVenueCalendarAsync(
            manager.Id, venue.Id, new DateOnly(2026, 7, 6), new DateOnly(2026, 8, 1));

        Assert.Null(result.ErrorCode);
        Assert.Equal("America/New_York", result.Value!.Timezone);
        Assert.Contains(result.Value.Rooms, r => r.Id == room.Id);

        var occ = Assert.Single(result.Value.Occurrences);
        Assert.Equal(booking.Id, occ.BookingId);
        Assert.Equal("Bella Booked", occ.OrganizerName);
        Assert.Equal(bookedDate, occ.LocalDate);
        Assert.Equal("09:00", occ.StartTime);
        Assert.Equal("11:00", occ.EndTime);
        Assert.Equal("scheduled", occ.Status);

        var pending = Assert.Single(result.Value.Pending);
        Assert.Equal(pendingApp.Id, pending.ApplicationId);
        Assert.Equal("Priya Pending", pending.OrganizerName);
        Assert.Equal([pendingDate], pending.Dates);
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
