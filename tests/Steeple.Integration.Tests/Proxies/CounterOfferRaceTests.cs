using Microsoft.EntityFrameworkCore;
using Steeple.Api.Contracts.Bookings;
using Steeple.Api.Services.Bookings;
using Steeple.Integration.Tests.Fixtures;

namespace Steeple.Integration.Tests.Proxies;
/// <summary>
/// The counter-offer counterpart to <see cref="BookingIntegrityTests"/> (CONTRACTS §5): accepting a
/// counter is a booking transaction on the <b>counter's</b> schedule (passed to
/// <see cref="BookingService.ConfirmFromApplicationAsync"/> as a <see cref="ScheduleSpec"/> override),
/// so it competes for the slot under the same btree_gist exclusion constraint as a plain approval.
/// When an organizer accepts a counter for a slot at the same instant another application for that
/// slot is approved, exactly one booking survives and the loser's Approved flip never commits
/// (the auto-decline the service layer then reports as <c>slot_taken</c>).
/// Uses its own users/applications and a distinct future window so it can share the container.
/// </summary>
[Collection(PostgresCollection.Name)]
public class CounterOfferRaceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // Classroom B @ Oakton Baptist — a Published room, from 002-seed.sql.
    private static readonly Guid ClassroomBId = Guid.Parse("30000000-0000-0000-0000-000000000002");

    private readonly PostgresDatabaseFixture _fixture;

    public CounterOfferRaceTests(PostgresDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task AcceptingCounter_RacesApprovalForSameSlot_ExactlyOneBookingWins()
    {
        // A distinct evening slot no other test touches.
        var date = new DateOnly(2027, 5, 20);
        var eveningStart = new TimeOnly(18, 0);
        var eveningEnd = new TimeOnly(21, 0);

        // The counter-offered application: the organizer originally asked for the morning, but the
        // host countered with the evening — accepting books the counter (evening) schedule.
        var counterAppId = await SeedApplicationAsync(
            ClassroomBId, ScheduleFrequency.OneOff, date, new TimeOnly(9, 0), new TimeOnly(11, 0),
            ApplicationStatus.CounterOffered);
        var counterSpec = new ScheduleSpec(ScheduleFrequency.OneOff, date, null, null, eveningStart, eveningEnd);

        // A rival application that asked for the evening directly, approved head-on (no override).
        var rivalAppId = await SeedApplicationAsync(
            ClassroomBId, ScheduleFrequency.OneOff, date, eveningStart, eveningEnd, ApplicationStatus.Pending);

        // Both confirmations race on their own connection/context; the barrier lines them up.
        using var gate = new Barrier(2);
        var attempts = new[]
        {
            (ApplicationId: counterAppId, Spec: (ScheduleSpec?)counterSpec),
            (ApplicationId: rivalAppId, Spec: (ScheduleSpec?)null),
        };

        var results = await Task.WhenAll(attempts.Select(attempt => Task.Run(async () =>
        {
            await using var db = CreateContext();
            var application = await new EfApplicationRepository(db).GetAsync(attempt.ApplicationId)
                ?? throw new InvalidOperationException("Seeded application vanished.");

            application.Status = ApplicationStatus.Approved;
            application.DecidedAtUtc = FixedNow;

            var service = CreateBookingService(db);
            gate.SignalAndWait();
            return await service.ConfirmFromApplicationAsync(application, attempt.Spec);
        })));

        Assert.Equal(1, results.Count(r => !r.SlotTaken));
        Assert.Equal(1, results.Count(r => r.SlotTaken));

        await using var verifyDb = CreateContext();
        var bookings = await verifyDb.Bookings
            .Include(b => b.Occurrences)
            .Where(b => b.ApplicationId == counterAppId || b.ApplicationId == rivalAppId)
            .ToListAsync();

        // Exactly one booking on the contested evening slot; the loser left nothing behind.
        var winner = Assert.Single(bookings);
        Assert.Equal(BookingStatus.Confirmed, winner.Status);
        var occurrence = Assert.Single(winner.Occurrences);
        Assert.Equal(new DateTimeOffset(2027, 5, 20, 22, 0, 0, TimeSpan.Zero), occurrence.StartUtc); // 18:00 EDT = 22:00Z

        var approvedCount = await verifyDb.Applications
            .CountAsync(a => (a.Id == counterAppId || a.Id == rivalAppId) && a.Status == ApplicationStatus.Approved);
        Assert.Equal(1, approvedCount);
    }

    // ----- Test rig ------------------------------------------------------------------------------

    private SteepleDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<SteepleDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options);

    private static BookingService CreateBookingService(SteepleDbContext db) => new(
        new EfBookingRepository(db),
        new NullVenueManagers(),
        new NullRatings(),
        new NullNotifications(),
        new NullAnalytics(),
        new FixedTimeProvider(FixedNow));

    private async Task<Guid> SeedApplicationAsync(
        Guid roomId, ScheduleFrequency frequency, DateOnly date, TimeOnly startTime, TimeOnly endTime, ApplicationStatus status)
    {
        await using var db = CreateContext();
        var organizer = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = "Organizer",
            Email = $"{Guid.NewGuid():N}@example.com",
            CreatedAtUtc = FixedNow,
        };
        var application = new Application
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 15,
            Frequency = frequency,
            StartDate = date,
            EndDate = null,
            DaysOfWeek = null,
            StartTime = startTime,
            EndTime = endTime,
            IntentText = "A community gathering.",
            Status = status,
            CreatedAtUtc = FixedNow,
            ExpiresAtUtc = FixedNow.AddDays(14),
        };
        db.Users.Add(organizer);
        db.Applications.Add(application);
        await db.SaveChangesAsync();
        return application.Id;
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class NullVenueManagers : IVenueManagerRepository
    {
        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) => Task.FromResult(false);

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
