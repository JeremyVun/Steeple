using Microsoft.EntityFrameworkCore;
using Steeple.Api.Services;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// Against a real Postgres: the application state machine cannot lose updates. Every transition
/// saves through the row's xmin concurrency token, so approve-vs-withdraw (either order) leaves
/// exactly one winner and a booking that agrees with it — the loser surfaces
/// <see cref="ConcurrentUpdateException"/> instead of silently overwriting. Also proves the
/// idempotent-submit unique index answers concurrent same-key inserts as
/// <see cref="DuplicateIdempotencyKeyException"/> (the replay), and that status-filtered list
/// reads judge <b>effective</b> status (an undecided row past expiry is already expired; a
/// confirmed booking with nothing ahead is already completed).
/// Each test uses its own users/applications and a distinct time window so tests sharing the
/// container can't collide.
/// </summary>
[Collection(PostgresCollection.Name)]
public class ApplicationConcurrencyTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Gymnasium @ Oakton Baptist and Music Room @ Vienna Presbyterian — Published, from 002-seed.sql.
    private static readonly Guid GymnasiumId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly Guid MusicRoomId = Guid.Parse("20000000-0000-0000-0000-000000000001");

    private readonly PostgresDatabaseFixture _fixture;

    public ApplicationConcurrencyTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task StaleWithdraw_AfterApprovalCommitted_ConflictsInsteadOfUnwritingTheBooking()
    {
        var (applicationId, _) = await SeedOneOffAsync(GymnasiumId, new DateOnly(2027, 3, 6), new TimeOnly(9, 0), new TimeOnly(11, 0));

        // The withdraw request loads the application first…
        await using var withdrawDb = CreateContext();
        var withdrawRepo = new EfApplicationRepository(withdrawDb);
        var staleApplication = await withdrawRepo.GetAsync(applicationId)
            ?? throw new InvalidOperationException("Seeded application vanished.");

        // …then an approval on its own connection commits the booking transaction.
        await using (var approveDb = CreateContext())
        {
            var application = await new EfApplicationRepository(approveDb).GetAsync(applicationId);
            application!.Status = ApplicationStatus.Approved;
            application.DecidedAtUtc = FixedNow;
            var confirmation = await CreateBookingService(approveDb).ConfirmFromApplicationAsync(application);
            Assert.False(confirmation.SlotTaken);
        }

        // The withdraw's save must lose on the concurrency token — not flip a booked
        // application to Withdrawn while the booking stands confirmed.
        staleApplication.Status = ApplicationStatus.Withdrawn;
        staleApplication.DecidedAtUtc = FixedNow;
        await Assert.ThrowsAsync<ConcurrentUpdateException>(() => withdrawRepo.SaveAsync());

        await using var verifyDb = CreateContext();
        var persisted = await verifyDb.Applications.SingleAsync(a => a.Id == applicationId);
        Assert.Equal(ApplicationStatus.Approved, persisted.Status);
        Assert.Equal(1, await verifyDb.Bookings.CountAsync(b => b.ApplicationId == applicationId));
    }

    [Fact]
    public async Task StaleApproval_AfterWithdrawCommitted_ConflictsAndBooksNothing()
    {
        var (applicationId, _) = await SeedOneOffAsync(GymnasiumId, new DateOnly(2027, 3, 13), new TimeOnly(9, 0), new TimeOnly(11, 0));

        // The approval loads the application first…
        await using var approveDb = CreateContext();
        var staleApplication = await new EfApplicationRepository(approveDb).GetAsync(applicationId)
            ?? throw new InvalidOperationException("Seeded application vanished.");

        // …then the organizer's withdrawal commits on its own connection.
        await using (var withdrawDb = CreateContext())
        {
            var repo = new EfApplicationRepository(withdrawDb);
            var application = await repo.GetAsync(applicationId);
            application!.Status = ApplicationStatus.Withdrawn;
            application.DecidedAtUtc = FixedNow;
            await repo.SaveAsync();
        }

        // The approval's booking transaction rides the stale Approved flip: the whole save must
        // abort on the concurrency token — a withdrawn application must not gain a booking.
        staleApplication.Status = ApplicationStatus.Approved;
        staleApplication.DecidedAtUtc = FixedNow;
        await Assert.ThrowsAsync<ConcurrentUpdateException>(
            () => CreateBookingService(approveDb).ConfirmFromApplicationAsync(staleApplication));

        await using var verifyDb = CreateContext();
        var persisted = await verifyDb.Applications.SingleAsync(a => a.Id == applicationId);
        Assert.Equal(ApplicationStatus.Withdrawn, persisted.Status);
        Assert.Equal(0, await verifyDb.Bookings.CountAsync(b => b.ApplicationId == applicationId));
    }

    [Fact]
    public async Task DuplicateIdempotencyKey_OnInsert_SurfacesAsTheDomainReplaySignal()
    {
        var key = Guid.NewGuid();
        var (winnerId, organizerId) = await SeedOneOffAsync(
            GymnasiumId, new DateOnly(2027, 3, 20), new TimeOnly(9, 0), new TimeOnly(11, 0), idempotencyKey: key);

        await using var db = CreateContext();
        var repo = new EfApplicationRepository(db);
        var loser = NewOneOffApplication(
            organizerId, GymnasiumId, new DateOnly(2027, 3, 20), new TimeOnly(14, 0), new TimeOnly(16, 0), key);

        await Assert.ThrowsAsync<DuplicateIdempotencyKeyException>(() => repo.AddAsync(loser));

        // The replay path the service takes after the conflict resolves to the winner.
        var winner = await repo.FindByIdempotencyKeyAsync(organizerId, key);
        Assert.Equal(winnerId, winner!.Id);
        Assert.Equal(1, await db.Applications.CountAsync(a => a.OrganizerId == organizerId));
    }

    [Fact]
    public async Task DuplicateIdempotencyKey_OnInstantBookSave_ConflictsAndBooksNothing()
    {
        var key = Guid.NewGuid();
        var (_, organizerId) = await SeedOneOffAsync(
            GymnasiumId, new DateOnly(2027, 3, 27), new TimeOnly(9, 0), new TimeOnly(11, 0), idempotencyKey: key);

        // The instant-book path tracks the application unsaved and commits it with the booking —
        // a concurrent retry that already committed the same key must abort the whole save.
        await using var db = CreateContext();
        var repo = new EfApplicationRepository(db);
        var retry = NewOneOffApplication(
            organizerId, GymnasiumId, new DateOnly(2027, 3, 27), new TimeOnly(14, 0), new TimeOnly(16, 0), key);
        retry.Status = ApplicationStatus.Approved;
        retry.Room = await db.Rooms.Include(r => r.Venue).SingleAsync(r => r.Id == GymnasiumId);
        retry.Organizer = await db.Users.SingleAsync(u => u.Id == organizerId);
        repo.AddPending(retry);

        await Assert.ThrowsAsync<DuplicateIdempotencyKeyException>(
            () => CreateBookingService(db).ConfirmFromApplicationAsync(retry, instant: true));

        await using var verifyDb = CreateContext();
        Assert.Equal(0, await verifyDb.Bookings.CountAsync(b => b.ApplicationId == retry.Id));
        Assert.Equal(1, await verifyDb.Applications.CountAsync(a => a.OrganizerId == organizerId));
    }

    [Fact]
    public async Task StatusFilteredApplicationList_JudgesEffectiveExpiry()
    {
        // One live pending, one pending whose ExpiresAtUtc already passed: before any sweep runs,
        // ?status=pending must exclude the lapsed one and ?status=expired must already claim it.
        var organizer = NewUser("Effective Status Organizer");
        var live = NewOneOffApplication(organizer.Id, MusicRoomId, new DateOnly(2027, 5, 1), new TimeOnly(7, 0), new TimeOnly(8, 0));
        var lapsed = NewOneOffApplication(organizer.Id, MusicRoomId, new DateOnly(2027, 5, 8), new TimeOnly(7, 0), new TimeOnly(8, 0));
        lapsed.ExpiresAtUtc = FixedNow.AddDays(-1);

        await using (var seedDb = CreateContext())
        {
            seedDb.Users.Add(organizer);
            seedDb.Applications.AddRange(live, lapsed);
            await seedDb.SaveChangesAsync();
        }

        await using var db = CreateContext();
        var repo = new EfApplicationRepository(db);

        var pending = await repo.GetForOrganizerAsync(organizer.Id, ApplicationStatus.Pending, FixedNow, page: 1, pageSize: 24);
        Assert.Equal(live.Id, Assert.Single(pending.Items).Id);
        Assert.Equal(1, pending.TotalCount);

        var expired = await repo.GetForOrganizerAsync(organizer.Id, ApplicationStatus.Expired, FixedNow, page: 1, pageSize: 24);
        Assert.Equal(lapsed.Id, Assert.Single(expired.Items).Id);
        Assert.Equal(1, expired.TotalCount);
    }

    [Fact]
    public async Task StatusFilteredBookingList_JudgesEffectiveCompletion()
    {
        // Two confirmed bookings, one entirely in the past: before any sweep runs, it must page
        // under ?status=completed (and be excluded — and uncounted — under ?status=confirmed).
        var (pastAppId, organizerId) = await SeedOneOffAsync(MusicRoomId, new DateOnly(2026, 1, 10), new TimeOnly(7, 0), new TimeOnly(8, 0));
        var (futureAppId, _) = await SeedOneOffAsync(
            MusicRoomId, new DateOnly(2027, 5, 15), new TimeOnly(7, 0), new TimeOnly(8, 0), organizerId: organizerId);

        Guid pastBookingId, futureBookingId;
        await using (var db = CreateContext())
        {
            var repo = new EfApplicationRepository(db);
            var service = CreateBookingService(db);
            var past = await repo.GetAsync(pastAppId);
            past!.Status = ApplicationStatus.Approved;
            pastBookingId = (await service.ConfirmFromApplicationAsync(past)).Booking!.Id;
            var future = await repo.GetAsync(futureAppId);
            future!.Status = ApplicationStatus.Approved;
            futureBookingId = (await service.ConfirmFromApplicationAsync(future)).Booking!.Id;
        }

        await using var readDb = CreateContext();
        var bookings = new EfBookingRepository(readDb);

        var confirmed = await bookings.GetForOrganizerAsync(organizerId, BookingStatus.Confirmed, FixedNow, page: 1, pageSize: 24);
        Assert.Equal(futureBookingId, Assert.Single(confirmed.Items).Id);
        Assert.Equal(1, confirmed.TotalCount);

        var completed = await bookings.GetForOrganizerAsync(organizerId, BookingStatus.Completed, FixedNow, page: 1, pageSize: 24);
        Assert.Equal(pastBookingId, Assert.Single(completed.Items).Id);
        Assert.Equal(1, completed.TotalCount);
    }

    // ----- Test rig ------------------------------------------------------------------------------

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    /// <summary>The real service over the real repository; notification/analytics/payment ports are inert.</summary>
    private static BookingService CreateBookingService(SteepleDbContext db) => new(
        new EfBookingRepository(db),
        new NullVenueManagers(),
        new NullRatings(),
        new NullPaymentService(),
        new TestFeatureFlags(),
        new NullNotifications(),
        new NullAnalytics(),
        new FixedTimeProvider(FixedNow),
        PaymentTestOptions.Payments());

    private async Task<(Guid ApplicationId, Guid OrganizerId)> SeedOneOffAsync(
        Guid roomId, DateOnly date, TimeOnly startTime, TimeOnly endTime,
        Guid? idempotencyKey = null, Guid? organizerId = null)
    {
        await using var db = CreateContext();
        User? organizer = null;
        if (organizerId is null)
        {
            organizer = NewUser("Organizer");
            db.Users.Add(organizer);
        }

        var application = NewOneOffApplication(organizerId ?? organizer!.Id, roomId, date, startTime, endTime, idempotencyKey);
        db.Applications.Add(application);
        await db.SaveChangesAsync();
        return (application.Id, application.OrganizerId);
    }

    private static User NewUser(string displayName) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow,
    };

    private static Application NewOneOffApplication(
        Guid organizerId, Guid roomId, DateOnly date, TimeOnly startTime, TimeOnly endTime, Guid? idempotencyKey = null) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId,
        OrganizerId = organizerId,
        ActivityType = ActivityType.Community,
        GroupSize = 15,
        Frequency = ScheduleFrequency.OneOff,
        StartDate = date,
        EndDate = null,
        DaysOfWeek = null,
        StartTime = startTime,
        EndTime = endTime,
        IntentText = "A community gathering.",
        Status = ApplicationStatus.Pending,
        IdempotencyKey = idempotencyKey,
        CreatedAtUtc = FixedNow,
        ExpiresAtUtc = FixedNow.AddDays(14),
    };

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
