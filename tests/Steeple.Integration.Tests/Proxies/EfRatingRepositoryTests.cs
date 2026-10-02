using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
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

    [Fact]
    public async Task PublicReads_FilterRevealRulesInSql_PageResultsAndProjectOnlyReviewFields()
    {
        var fixture = await SeedPublicReadFixtureAsync();
        var capture = new ProjectionCaptureInterceptor();

        await using var db = CreateContext(capture);
        var repository = new EfRatingRepository(db);

        var reviews = await repository.GetPublicVenueReviewsAsync(
            fixture.VenueId, page: 2, pageSize: 50, FixedNow);
        var venueAggregates = await repository.GetVenueSummaryAggregatesAsync([fixture.VenueId], FixedNow);
        var organizerAggregates = await repository.GetOrganizerSummaryAggregatesAsync([fixture.OrganizerId], FixedNow);

        Assert.Equal(54, reviews.TotalCount);
        Assert.Equal(4, reviews.Items.Count);
        Assert.Equal(54, venueAggregates[fixture.VenueId].Count);
        Assert.Equal(52, organizerAggregates[fixture.OrganizerId].Count);
        Assert.DoesNotContain(reviews.Items, review => review.Comment == "Exactly at the reveal boundary.");
        Assert.DoesNotContain(reviews.Items, review => review.Comment == "Hidden rating with an opposite rating.");
        Assert.DoesNotContain(reviews.Items, review => review.Comment == "Visible rating with a hidden opposite rating.");
        Assert.DoesNotContain(reviews.Items, review => review.Comment == "Cancelled at the reveal boundary.");
        Assert.DoesNotContain(reviews.Items, review => review.Comment == "No occurrence to close the rating window.");

        var pageRead = Assert.Single(capture.Reads, read =>
            read.CommandText.Contains("OFFSET", StringComparison.Ordinal));
        Assert.Equal(4, pageRead.FieldCount);
    }

    private SteepleDbContext CreateContext(DbCommandInterceptor? interceptor = null)
    {
        var options = new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString);
        if (interceptor is not null)
        {
            options.AddInterceptors(interceptor);
        }

        return new SteepleDbContext(options.Options);
    }

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

    private async Task<PublicReadFixture> SeedPublicReadFixtureAsync()
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Rating SQL Fixture Venue",
            Slug = $"rating-sql-{Guid.NewGuid():N}",
            Description = "Fixture venue for SQL-backed public rating reads.",
            Type = VenueType.Church,
            AddressLine = "1 Fixture Lane",
            Suburb = "Fixtureton",
            Postcode = "00000",
            Latitude = 38.9,
            Longitude = -77.2,
            ParkingInfo = "Fixture parking.",
            TransitInfo = "Fixture transit.",
            IsIdentityVerified = true,
            Timezone = "America/New_York",
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Name = "Rating SQL Fixture Hall",
            Slug = "rating-sql-hall",
            Description = "Fixture room for SQL-backed public rating reads.",
            Capacity = 30,
            PricePerHour = 25m,
            Currency = "USD",
            Status = RoomStatus.Published,
            FirstPublishedAtUtc = FixedNow,
            CreatedAtUtc = FixedNow,
            UpdatedAtUtc = FixedNow,
        };
        var organizer = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Public Review Organizer",
            Email = $"rating-organizer-{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        var manager = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Public Review Manager",
            Email = $"rating-manager-{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };

        await using var db = CreateContext();
        db.AddRange(venue, room, organizer, manager);

        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Exactly at the reveal boundary.",
            occurrenceEndUtc: FixedNow.AddDays(-14),
            reciprocal: false);
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Elapsed reveal window.",
            occurrenceEndUtc: FixedNow.AddDays(-14).AddHours(-3),
            reciprocal: false);
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Hidden rating with an opposite rating.",
            occurrenceEndUtc: FixedNow.AddHours(-15),
            reciprocal: true,
            hidden: true);
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Visible rating with an opposite rating.",
            occurrenceEndUtc: FixedNow.AddHours(-12),
            reciprocal: true);
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Visible rating with a hidden opposite rating.",
            occurrenceEndUtc: FixedNow.AddHours(-9),
            reciprocal: true,
            hideReciprocal: true);
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Cancelled at the reveal boundary.",
            status: BookingStatus.Cancelled,
            cancelledAtUtc: FixedNow.AddDays(-14));
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "Cancelled after the reveal window.",
            status: BookingStatus.Cancelled,
            cancelledAtUtc: FixedNow.AddDays(-14).AddSeconds(-1));
        AddRatedBooking(
            db, room, organizer, manager,
            comment: "No occurrence to close the rating window.");

        for (var index = 0; index < 51; index++)
        {
            AddRatedBooking(
                db, room, organizer, manager,
                comment: $"Paged public review {index:D2}.",
                occurrenceEndUtc: FixedNow.AddHours(-30 - (index * 3)),
                reciprocal: true,
                createdAtUtc: FixedNow.AddMinutes(-index));
        }

        await db.SaveChangesAsync();
        return new PublicReadFixture(venue.Id, organizer.Id);
    }

    private static void AddRatedBooking(
        SteepleDbContext db,
        Room room,
        User organizer,
        User manager,
        string comment,
        DateTimeOffset? occurrenceEndUtc = null,
        BookingStatus status = BookingStatus.Completed,
        DateTimeOffset? cancelledAtUtc = null,
        bool reciprocal = false,
        bool hidden = false,
        bool hideReciprocal = false,
        DateTimeOffset? createdAtUtc = null)
    {
        var startDate = new DateOnly(2026, 6, 1);
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 12,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = startDate,
            EndDate = startDate,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "Fixture booking for public rating SQL coverage.",
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
            StartDate = startDate,
            EndDate = startDate,
            StartTime = application.StartTime,
            EndTime = application.EndTime,
            Status = status,
            CancelledAtUtc = cancelledAtUtc,
            CreatedAtUtc = FixedNow.AddDays(-29),
        };
        if (occurrenceEndUtc is { } endUtc)
        {
            booking.Occurrences.Add(new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RoomId = room.Id,
                StartUtc = endUtc.AddHours(-2),
                EndUtc = endUtc,
                LocalDate = DateOnly.FromDateTime(endUtc.UtcDateTime),
                Status = OccurrenceStatus.Occurred,
            });
        }

        var created = createdAtUtc ?? FixedNow;
        db.Add(application);
        db.Add(booking);
        db.Add(new Rating
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RaterId = organizer.Id,
            RateeType = RatingRateeType.Venue,
            Stars = 5,
            Comment = comment,
            CreatedAtUtc = created,
            HiddenAtUtc = hidden ? FixedNow : null,
            VenueId = room.VenueId,
            OrganizerId = organizer.Id,
        });
        if (reciprocal)
        {
            db.Add(new Rating
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RaterId = manager.Id,
                RateeType = RatingRateeType.Organizer,
                Stars = 4,
                Comment = null,
                CreatedAtUtc = created,
                HiddenAtUtc = hideReciprocal ? FixedNow : null,
                VenueId = room.VenueId,
                OrganizerId = organizer.Id,
            });
        }
    }

    private sealed record PublicReadFixture(Guid VenueId, Guid OrganizerId);

    private sealed class ProjectionCaptureInterceptor : DbCommandInterceptor
    {
        public List<SqlRead> Reads { get; } = [];

        public override DbDataReader ReaderExecuted(
            DbCommand command,
            CommandExecutedEventData eventData,
            DbDataReader result)
        {
            Reads.Add(new SqlRead(command.CommandText, result.FieldCount));
            return result;
        }

        public override ValueTask<DbDataReader> ReaderExecutedAsync(
            DbCommand command,
            CommandExecutedEventData eventData,
            DbDataReader result,
            CancellationToken cancellationToken = default)
        {
            Reads.Add(new SqlRead(command.CommandText, result.FieldCount));
            return ValueTask.FromResult(result);
        }
    }

    private sealed record SqlRead(string CommandText, int FieldCount);
}
