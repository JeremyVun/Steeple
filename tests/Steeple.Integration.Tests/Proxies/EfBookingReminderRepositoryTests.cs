using Microsoft.EntityFrameworkCore;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Integration tests for <see cref="EfBookingReminderRepository"/> against a real Postgres. The
/// point of interest is the claim: <c>UQ_booking_reminders_OccurrenceId_Kind</c> (015-reminders.sql)
/// is what stops a second sweep — or a second replica — sending the same nudge twice, and only a
/// real database can prove the <c>ON CONFLICT DO NOTHING</c> insert behaves that way under
/// concurrency. Each test seeds its own booking on a distinct future window so tests sharing the
/// container can't collide.
/// </summary>
[Collection(PostgresCollection.Name)]
public class EfBookingReminderRepositoryTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Renovation Annex @ Oakton Baptist, from 002-seed.sql: a room no other suite books, so
    // these bookings can never contend with theirs for the exclusion constraint.
    private static readonly Guid RoomId = Guid.Parse("30000000-0000-0000-0000-000000000003");

    private readonly PostgresDatabaseFixture _fixture;

    public EfBookingReminderRepositoryTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task TryClaimAsync_SameOccurrenceAndKindTwice_OnlyTheFirstWins()
    {
        var occurrenceId = await SeedBookingAsync(new DateTimeOffset(2028, 3, 1, 14, 0, 0, TimeSpan.Zero));

        await using var db = CreateContext();
        var repository = new EfBookingReminderRepository(db);

        Assert.True(await repository.TryClaimAsync(occurrenceId, BookingReminderKind.Tomorrow, FixedNow));
        Assert.False(await repository.TryClaimAsync(occurrenceId, BookingReminderKind.Tomorrow, FixedNow));

        // A different kind for the same occurrence is a different reminder and claims cleanly.
        Assert.True(await repository.TryClaimAsync(occurrenceId, BookingReminderKind.ComingUp, FixedNow));
    }

    [Fact]
    public async Task TryClaimAsync_ConcurrentSweeps_ExactlyOneClaimsTheReminder()
    {
        const int sweeps = 6;
        var occurrenceId = await SeedBookingAsync(new DateTimeOffset(2028, 3, 2, 14, 0, 0, TimeSpan.Zero));

        using var gate = new Barrier(sweeps);
        var results = await Task.WhenAll(Enumerable.Range(0, sweeps).Select(_ => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var repository = new EfBookingReminderRepository(db);
            gate.SignalAndWait();
            return await repository.TryClaimAsync(occurrenceId, BookingReminderKind.ComingUp, FixedNow);
        })));

        Assert.Equal(1, results.Count(won => won));

        await using var verifyDb = CreateContext();
        Assert.Equal(1, await verifyDb.BookingReminders.CountAsync(r => r.OccurrenceId == occurrenceId));
    }

    [Fact]
    public async Task ReleaseClaimAsync_LetsTheNextSweepRetry()
    {
        var occurrenceId = await SeedBookingAsync(new DateTimeOffset(2028, 3, 3, 14, 0, 0, TimeSpan.Zero));

        await using var db = CreateContext();
        var repository = new EfBookingReminderRepository(db);
        Assert.True(await repository.TryClaimAsync(occurrenceId, BookingReminderKind.Tomorrow, FixedNow));

        await repository.ReleaseClaimAsync(occurrenceId, BookingReminderKind.Tomorrow);

        Assert.True(await repository.TryClaimAsync(occurrenceId, BookingReminderKind.Tomorrow, FixedNow));
    }

    [Fact]
    public async Task GetDueAsync_ReturnsConfirmedBookingsInTheWindowWithTheirDisplayGraph()
    {
        var start = new DateTimeOffset(2028, 3, 4, 14, 0, 0, TimeSpan.Zero);
        var occurrenceId = await SeedBookingAsync(start);

        await using var db = CreateContext();
        var repository = new EfBookingReminderRepository(db);
        var due = await repository.GetDueAsync(start.AddDays(-7), start.AddDays(1));

        var booking = Assert.Single(due, b => b.Occurrences.Any(o => o.Id == occurrenceId));
        Assert.NotNull(booking.Room);
        Assert.NotNull(booking.Room!.Venue);
        Assert.NotNull(booking.Organizer);
    }

    [Fact]
    public async Task GetDueAsync_IgnoresBookingsOutsideTheWindowAndCancelledOccurrences()
    {
        var far = new DateTimeOffset(2028, 4, 1, 14, 0, 0, TimeSpan.Zero);
        var farOccurrenceId = await SeedBookingAsync(far);
        var cancelledOccurrenceId = await SeedBookingAsync(
            new DateTimeOffset(2028, 3, 5, 14, 0, 0, TimeSpan.Zero), OccurrenceStatus.Cancelled);

        await using var db = CreateContext();
        var repository = new EfBookingReminderRepository(db);
        var due = await repository.GetDueAsync(FixedNow, FixedNow.AddDays(7));

        Assert.DoesNotContain(due, b => b.Occurrences.Any(o => o.Id == farOccurrenceId));
        Assert.DoesNotContain(due, b => b.Occurrences.Any(o => o.Id == cancelledOccurrenceId));
    }

    [Fact]
    public async Task DeletingTheOccurrence_TakesItsClaimsWithIt()
    {
        var occurrenceId = await SeedBookingAsync(new DateTimeOffset(2028, 3, 6, 14, 0, 0, TimeSpan.Zero));

        await using (var db = CreateContext())
        {
            Assert.True(await new EfBookingReminderRepository(db)
                .TryClaimAsync(occurrenceId, BookingReminderKind.Tomorrow, FixedNow));
        }

        await using (var db = CreateContext())
        {
            var occurrence = await db.BookingOccurrences.SingleAsync(o => o.Id == occurrenceId);
            db.BookingOccurrences.Remove(occurrence);
            await db.SaveChangesAsync();
        }

        await using var verifyDb = CreateContext();
        Assert.Equal(0, await verifyDb.BookingReminders.CountAsync(r => r.OccurrenceId == occurrenceId));
    }

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    /// <summary>Seeds an organizer, an approved application and a confirmed one-off booking.</summary>
    private async Task<Guid> SeedBookingAsync(
        DateTimeOffset startUtc, OccurrenceStatus occurrenceStatus = OccurrenceStatus.Scheduled)
    {
        await using var db = CreateContext();

        var organizer = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Jamie Organizer",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };

        var date = DateOnly.FromDateTime(startUtc.UtcDateTime);
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = RoomId,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 12,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = date,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "A community gathering.",
            Status = ApplicationStatus.Approved,
            CreatedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };

        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = application.Id,
            RoomId = RoomId,
            OrganizerId = organizer.Id,
            Type = BookingType.OneOff,
            StartDate = date,
            EndDate = date,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = FixedNow,
        };

        var occurrence = new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = RoomId,
            StartUtc = startUtc,
            EndUtc = startUtc.AddHours(2),
            LocalDate = date,
            Status = occurrenceStatus,
        };

        booking.Occurrences.Add(occurrence);
        db.Users.Add(organizer);
        db.Applications.Add(application);
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();

        return occurrence.Id;
    }
}
