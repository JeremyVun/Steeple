using Microsoft.EntityFrameworkCore;
using Steeple.Api.Contracts.Bookings;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// <b>The Phase 3 proof</b> (ROADMAP: "this test is the phase"): against a real Postgres with the
/// Liquibase-owned schema, N concurrent approvals of overlapping slots produce exactly one
/// booking — the btree_gist exclusion constraint in 005-bookings.sql, not application code, is
/// what makes double-booking impossible. Also covers the adjacent invariants: back-to-back slots
/// coexist, cancellation frees slots for re-booking, and recurring occurrences materialize
/// DST-correctly all the way into the database.
/// Each test uses its own users/applications and a distinct future time window so tests sharing
/// the container can't collide.
/// </summary>
[Collection(PostgresCollection.Name)]
public class BookingIntegrityTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Fellowship Hall @ Grace Community Church of Vienna — Published, from 002-seed.sql.
    private static readonly Guid FellowshipHallId = Guid.Parse("10000000-0000-0000-0000-000000000001");

    // Music Room @ Vienna Presbyterian — a second Published room, so tests get disjoint slots.
    private static readonly Guid MusicRoomId = Guid.Parse("20000000-0000-0000-0000-000000000001");

    // Gymnasium @ Oakton Baptist.
    private static readonly Guid GymnasiumId = Guid.Parse("30000000-0000-0000-0000-000000000001");

    // Classroom B @ Oakton Baptist.
    private static readonly Guid ClassroomBId = Guid.Parse("30000000-0000-0000-0000-000000000002");

    private readonly PostgresDatabaseFixture _fixture;

    public BookingIntegrityTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task ConcurrentApprovals_OfOverlappingSlots_ExactlyOneBookingWins()
    {
        const int contenders = 6;

        // Six organizers all want Fellowship Hall on the same evening.
        var applicationIds = new List<Guid>();
        await using (var seedDb = CreateContext())
        {
            for (var i = 0; i < contenders; i++)
            {
                var organizer = NewUser($"Contender {i}");
                var application = NewOneOffApplication(
                    organizer.Id, FellowshipHallId,
                    new DateOnly(2026, 10, 9), new TimeOnly(18, 0), new TimeOnly(21, 0));
                seedDb.Users.Add(organizer);
                seedDb.Applications.Add(application);
                applicationIds.Add(application.Id);
            }

            await seedDb.SaveChangesAsync();
        }

        // Every approval races on its own connection/context, exactly like N concurrent requests.
        // A barrier lines them up so they hit SaveChanges as close together as the pool allows.
        using var gate = new Barrier(contenders);
        var results = await Task.WhenAll(applicationIds.Select(applicationId => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var repository = new EfApplicationRepository(db);
            var application = await repository.GetAsync(applicationId)
                ?? throw new InvalidOperationException("Seeded application vanished.");

            application.Status = ApplicationStatus.Approved;
            application.DecidedAtUtc = FixedNow;

            var service = CreateBookingService(db);
            gate.SignalAndWait();
            return await service.ConfirmFromApplicationAsync(application);
        })));

        Assert.Equal(1, results.Count(r => !r.SlotTaken));
        Assert.Equal(contenders - 1, results.Count(r => r.SlotTaken));

        await using var verifyDb = CreateContext();
        var bookings = await verifyDb.Bookings
            .Include(b => b.Occurrences)
            .Where(b => applicationIds.Contains(b.ApplicationId))
            .ToListAsync();

        var winner = Assert.Single(bookings);
        Assert.Equal(BookingStatus.Confirmed, winner.Status);
        Assert.Single(winner.Occurrences);

        // Losing approvals must leave nothing behind: their Approved flips were never committed.
        var approvedCount = await verifyDb.Applications
            .CountAsync(a => applicationIds.Contains(a.Id) && a.Status == ApplicationStatus.Approved);
        Assert.Equal(1, approvedCount);
    }

    [Fact]
    public async Task ConcurrentApprovals_OfRecurringSchedulesOverlappingOnOneWeekday_ExactlyOneWinsTheWholeTerm()
    {
        // Tue+Thu vs Wed+Thu over the same term/time: the sets only collide on Thursdays, but the
        // exclusion constraint must reject the whole losing application's term, not just the
        // colliding Thursday occurrences.
        var (tueThuApp, _) = await SeedApplicationAsync(
            ClassroomBId, ScheduleFrequency.RecurringWeekly,
            new DateOnly(2027, 1, 5), new DateOnly(2027, 1, 19), Weekdays.Tuesday | Weekdays.Thursday,
            new TimeOnly(18, 0), new TimeOnly(20, 0));
        var (wedThuApp, _) = await SeedApplicationAsync(
            ClassroomBId, ScheduleFrequency.RecurringWeekly,
            new DateOnly(2027, 1, 5), new DateOnly(2027, 1, 19), Weekdays.Wednesday | Weekdays.Thursday,
            new TimeOnly(18, 0), new TimeOnly(20, 0));

        using var gate = new Barrier(2);
        var results = await Task.WhenAll(new[] { tueThuApp, wedThuApp }.Select(applicationId => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var repository = new EfApplicationRepository(db);
            var application = await repository.GetAsync(applicationId)
                ?? throw new InvalidOperationException("Seeded application vanished.");

            application.Status = ApplicationStatus.Approved;
            application.DecidedAtUtc = FixedNow;

            var service = CreateBookingService(db);
            gate.SignalAndWait();
            return await service.ConfirmFromApplicationAsync(application);
        })));

        Assert.Equal(1, results.Count(r => !r.SlotTaken));
        Assert.Equal(1, results.Count(r => r.SlotTaken));

        await using var verifyDb = CreateContext();
        var bookings = await verifyDb.Bookings
            .Include(b => b.Occurrences)
            .Where(b => b.ApplicationId == tueThuApp || b.ApplicationId == wedThuApp)
            .ToListAsync();

        // The loser's entire term is rejected — not partially booked around the Thursday clash.
        var winner = Assert.Single(bookings);
        Assert.Equal(BookingStatus.Confirmed, winner.Status);

        var approvedCount = await verifyDb.Applications
            .CountAsync(a => (a.Id == tueThuApp || a.Id == wedThuApp) && a.Status == ApplicationStatus.Approved);
        Assert.Equal(1, approvedCount);
    }

    [Fact]
    public async Task RecurringApproval_BlocksPartiallyOverlappingOneOff_AndMaterializesDstCorrectly()
    {
        var (recurringApp, _) = await SeedApplicationAsync(
            MusicRoomId, ScheduleFrequency.RecurringWeekly,
            new DateOnly(2026, 10, 27), new DateOnly(2026, 11, 10), Weekdays.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(11, 0));

        await using (var db = CreateContext())
        {
            var application = await new EfApplicationRepository(db).GetAsync(recurringApp);
            application!.Status = ApplicationStatus.Approved;
            var confirmation = await CreateBookingService(db).ConfirmFromApplicationAsync(application);
            Assert.False(confirmation.SlotTaken);

            // The venue is America/New_York and Nov 1, 2026 is the fall-back: 9:00 local is
            // 13:00Z before the transition and 14:00Z after. Wrong-by-design fixed-interval
            // materialization would fail this.
            var occurrences = confirmation.Booking!.Occurrences.OrderBy(o => o.StartUtc).ToList();
            Assert.Equal(3, occurrences.Count);
            Assert.Equal(new DateTimeOffset(2026, 10, 27, 13, 0, 0, TimeSpan.Zero), occurrences[0].StartUtc);
            Assert.Equal(new DateTimeOffset(2026, 11, 3, 14, 0, 0, TimeSpan.Zero), occurrences[1].StartUtc);
            Assert.Equal(new DateTimeOffset(2026, 11, 10, 14, 0, 0, TimeSpan.Zero), occurrences[2].StartUtc);
        }

        // A one-off overlapping just one of those Tuesdays (10:00–12:00 on Nov 3) must lose.
        var (oneOffApp, _) = await SeedApplicationAsync(
            MusicRoomId, ScheduleFrequency.OneOff,
            new DateOnly(2026, 11, 3), new DateOnly(2026, 11, 3), daysOfWeek: null,
            new TimeOnly(10, 0), new TimeOnly(12, 0));

        await using (var db = CreateContext())
        {
            var application = await new EfApplicationRepository(db).GetAsync(oneOffApp);
            application!.Status = ApplicationStatus.Approved;
            var confirmation = await CreateBookingService(db).ConfirmFromApplicationAsync(application);
            Assert.True(confirmation.SlotTaken);
        }
    }

    [Fact]
    public async Task BackToBackSlots_DoNotConflict()
    {
        var date = new DateOnly(2026, 9, 12);
        var (morning, _) = await SeedApplicationAsync(
            GymnasiumId, ScheduleFrequency.OneOff, date, date, null, new TimeOnly(9, 0), new TimeOnly(11, 0));
        var (afternoon, _) = await SeedApplicationAsync(
            GymnasiumId, ScheduleFrequency.OneOff, date, date, null, new TimeOnly(11, 0), new TimeOnly(13, 0));

        foreach (var applicationId in new[] { morning, afternoon })
        {
            await using var db = CreateContext();
            var application = await new EfApplicationRepository(db).GetAsync(applicationId);
            application!.Status = ApplicationStatus.Approved;
            var confirmation = await CreateBookingService(db).ConfirmFromApplicationAsync(application);

            // '[)' range semantics: …–11:00 and 11:00–… share only the boundary instant.
            Assert.False(confirmation.SlotTaken);
        }
    }

    [Fact]
    public async Task Cancellation_FreesTheSlot_ForANewBooking()
    {
        var date = new DateOnly(2026, 12, 5);
        var (first, firstOrganizer) = await SeedApplicationAsync(
            ClassroomBId, ScheduleFrequency.OneOff, date, date, null, new TimeOnly(14, 0), new TimeOnly(16, 0));

        Guid bookingId;
        await using (var db = CreateContext())
        {
            var application = await new EfApplicationRepository(db).GetAsync(first);
            application!.Status = ApplicationStatus.Approved;
            var confirmation = await CreateBookingService(db).ConfirmFromApplicationAsync(application);
            Assert.False(confirmation.SlotTaken);
            bookingId = confirmation.Booking!.Id;
        }

        // The organizer cancels well outside the 48h notice window → the occurrence is freed.
        await using (var db = CreateContext())
        {
            var result = await CreateBookingService(db).CancelAsync(
                bookingId, firstOrganizer, new CancelBookingRequest("Plans changed."));
            Assert.Null(result.Error);
            Assert.Equal("cancelled", result.Value!.Status);
            Assert.All(result.Value.Occurrences, o => Assert.Equal("cancelled", o.Status));
        }

        // The same slot can now be booked by someone else.
        var (second, _) = await SeedApplicationAsync(
            ClassroomBId, ScheduleFrequency.OneOff, date, date, null, new TimeOnly(14, 0), new TimeOnly(16, 0));

        await using (var verifyDb = CreateContext())
        {
            var application = await new EfApplicationRepository(verifyDb).GetAsync(second);
            application!.Status = ApplicationStatus.Approved;
            var confirmation = await CreateBookingService(verifyDb).ConfirmFromApplicationAsync(application);
            Assert.False(confirmation.SlotTaken);
        }
    }

    // ----- Test rig ------------------------------------------------------------------------------

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    /// <summary>The real service over the real repository; notification/analytics ports are inert.</summary>
    private static BookingService CreateBookingService(SteepleDbContext db) => new(
        new EfBookingRepository(db),
        new NullVenueManagers(),
        new NullRatings(),
        new NullNotifications(),
        new NullAnalytics(),
        new FixedTimeProvider(FixedNow));

    private async Task<(Guid ApplicationId, Guid OrganizerId)> SeedApplicationAsync(
        Guid roomId, ScheduleFrequency frequency, DateOnly startDate, DateOnly endDate,
        Weekdays? daysOfWeek, TimeOnly startTime, TimeOnly endTime)
    {
        await using var db = CreateContext();
        var organizer = NewUser("Organizer");
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 15,
            Frequency = frequency,
            StartDate = startDate,
            EndDate = frequency == ScheduleFrequency.RecurringWeekly ? endDate : null,
            DaysOfWeek = daysOfWeek,
            StartTime = startTime,
            EndTime = endTime,
            IntentText = "Weekly community gathering.",
            Status = ApplicationStatus.Pending,
            CreatedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };
        db.Users.Add(organizer);
        db.Applications.Add(application);
        await db.SaveChangesAsync();
        return (application.Id, organizer.Id);
    }

    private static User NewUser(string displayName) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = $"{Guid.NewGuid():N}@example.com",
        CreatedAtUtc = FixedNow,
    };

    private static Application NewOneOffApplication(
        Guid organizerId, Guid roomId, DateOnly date, TimeOnly startTime, TimeOnly endTime) => new()
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
        CreatedAtUtc = FixedNow,
        ExpiresAtUtc = FixedNow.AddDays(14),
    };

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NullVenueManagers : IVenueManagerRepository
    {
        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(false);

        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Guid>>([]);

        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Venue>>([]);

        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<User>>([]);
    }

    private sealed class NullNotifications : INotificationDispatcher
    {
        public Task NotifyAsync(
            IReadOnlyList<NotificationRecipient> recipients, NotificationType type, object payload,
            EmailContent? email, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NullRatings : IRatingService
    {
        public Task<BookingResult<RatingSubmissionResult>> SubmitAsync(
            Guid bookingId, Guid callerId, SubmitRatingRequest request, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyDictionary<Guid, BookingRatingsDto>> GetBookingOverviewsAsync(
            IReadOnlyList<Booking> bookings, Guid callerId, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, BookingRatingsDto>>(new Dictionary<Guid, BookingRatingsDto>());

        public Task<IReadOnlyDictionary<Guid, RatingSummaryDto>> GetVenueSummariesAsync(
            IReadOnlyCollection<Guid> venueIds, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, RatingSummaryDto>>(new Dictionary<Guid, RatingSummaryDto>());

        public Task<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>> GetOrganizerSummariesAsync(
            IReadOnlyCollection<Guid> organizerIds, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, OrganizerRatingSummaryDto>>(new Dictionary<Guid, OrganizerRatingSummaryDto>());

        public Task<VenueReviewPageDto> GetVenueReviewsAsync(
            Guid venueId, int page, int pageSize, DateTimeOffset nowUtc, CancellationToken ct = default) =>
            Task.FromResult(new VenueReviewPageDto([], 0, Math.Max(page, 1), Math.Clamp(pageSize, 1, 50)));
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) =>
            Task.CompletedTask;
    }
}
