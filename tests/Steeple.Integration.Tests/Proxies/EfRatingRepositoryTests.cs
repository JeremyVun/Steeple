using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>Integration tests for the ratings repository against the Liquibase-owned schema.</summary>
[Collection(PostgresCollection.Name)]
public class EfRatingRepositoryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid FellowshipHallId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private readonly PostgresDatabaseFixture _fixture;

    public EfRatingRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task TryAddAsync_DuplicateBookingDirection_ReturnsFalseAndLeavesOneRating()
    {
        var (bookingId, organizerId, venueId) = await SeedCompletedBookingAsync();

        await using var db = CreateContext();
        var repository = new EfRatingRepository(db);
        var first = NewRating(bookingId, organizerId, venueId, stars: 5);
        var duplicate = NewRating(bookingId, organizerId, venueId, stars: 4);

        Assert.True(await repository.TryAddAsync(first));
        Assert.False(await repository.TryAddAsync(duplicate));

        var stored = await db.Ratings.Where(r => r.BookingId == bookingId).ToListAsync();
        var rating = Assert.Single(stored);
        Assert.Equal(5, rating.Stars);
    }

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private async Task<(Guid BookingId, Guid OrganizerId, Guid VenueId)> SeedCompletedBookingAsync()
    {
        await using var db = CreateContext();
        var room = await db.Rooms.AsNoTracking().SingleAsync(r => r.Id == FellowshipHallId);
        var organizer = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Rating Organizer",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 12,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = new DateOnly(2026, 7, 1),
            EndDate = null,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "Completed community booking.",
            Status = ApplicationStatus.Approved,
            CreatedAtUtc = FixedNow.AddDays(-30),
            DecidedAtUtc = FixedNow.AddDays(-29),
            ExpiresAtUtc = FixedNow.AddDays(-16),
        };
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = new DateOnly(2026, 7, 1),
            EndDate = new DateOnly(2026, 7, 1),
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            Status = BookingStatus.Completed,
            CreatedAtUtc = FixedNow.AddDays(-29),
        };
        booking.Occurrences.Add(new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = room.Id,
            StartUtc = FixedNow.AddDays(-19).AddHours(-2),
            EndUtc = FixedNow.AddDays(-19),
            LocalDate = new DateOnly(2026, 7, 1),
            Status = OccurrenceStatus.Occurred,
        });

        db.Users.Add(organizer);
        db.Applications.Add(application);
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();

        return (booking.Id, organizer.Id, room.VenueId);
    }

    private static Rating NewRating(Guid bookingId, Guid organizerId, Guid venueId, short stars) => new()
    {
        Id = Guid.NewGuid(),
        BookingId = bookingId,
        OrganizerId = organizerId,
        VenueId = venueId,
        RaterId = organizerId,
        RateeType = RatingRateeType.Venue,
        Stars = stars,
        CreatedAtUtc = FixedNow,
    };
}
