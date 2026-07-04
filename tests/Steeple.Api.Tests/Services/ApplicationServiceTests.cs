namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="ApplicationService"/>: submission validation + idempotency, the
/// ask/answer thread's status flips, the provider decision, withdrawal, party scoping, and lazy
/// expiry (SYSTEM_DESIGN §5/§7). Repository, venue-manager repository, notification dispatcher,
/// turnstile verifier, analytics sink and clock are all hand-rolled in-memory fakes, matching the
/// no-mocking-library idiom used elsewhere in this test project (see
/// <c>IdentityServiceTests</c>).
/// </summary>
public class ApplicationServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // ----- Submit ---------------------------------------------------------------------------

    [Fact]
    public async Task SubmitAsync_HappyPath_CreatesPendingApplicationAndNotifiesManagers()
    {
        var (repo, managers, venue, room, organizer, manager) = NewScenario();
        var service = CreateService(repo, managers, out var notifications, out _, out var analytics);

        var result = await service.SubmitAsync(room.Id, organizer.Id, NewSubmitRequest(), idempotencyKey: null, remoteIp: "1.2.3.4");

        Assert.Null(result.Error);
        Assert.NotNull(result.Value);
        Assert.True(result.Value!.Created);

        var created = Assert.Single(repo.Applications);
        Assert.Equal(ApplicationStatus.Pending, created.Status);
        Assert.Equal(FixedNow, created.CreatedAtUtc);
        Assert.Equal(FixedNow.AddDays(14), created.ExpiresAtUtc);

        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.ApplicationReceived, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == manager.Id);
        Assert.NotNull(notification.Email);

        Assert.Contains(analytics.Events, e => e.EventType == "application_submitted");
    }

    [Fact]
    public async Task SubmitAsync_ReplayedIdempotencyKey_ReturnsOriginalWithoutCreatingSecondApplication()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var service = CreateService(repo, managers, out _, out _, out _);
        var key = Guid.NewGuid();

        var first = await service.SubmitAsync(room.Id, organizer.Id, NewSubmitRequest(), key, remoteIp: null);
        var second = await service.SubmitAsync(room.Id, organizer.Id, NewSubmitRequest(), key, remoteIp: null);

        Assert.True(first.Value!.Created);
        Assert.False(second.Value!.Created);
        Assert.Equal(first.Value.Application.Id, second.Value.Application.Id);
        Assert.Single(repo.Applications);
    }

    [Fact]
    public async Task SubmitAsync_UnknownActivityToken_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(activityType: "not-a-real-type"));

    [Fact]
    public async Task SubmitAsync_RecurringWithoutEndDate_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(
            schedule: NewSchedule(frequency: "recurringWeekly", endDate: null, dayOfWeek: "monday")));

    [Fact]
    public async Task SubmitAsync_RecurringWithoutDayOfWeek_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(
            schedule: NewSchedule(frequency: "recurringWeekly", endDate: Today().AddDays(30), dayOfWeek: null)));

    [Fact]
    public async Task SubmitAsync_EndTimeNotAfterStartTime_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(
            schedule: NewSchedule(startTime: "11:00", endTime: "11:00")));

    [Fact]
    public async Task SubmitAsync_StartDateInThePast_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(
            schedule: NewSchedule(startDate: Today().AddDays(-1))));

    [Fact]
    public async Task SubmitAsync_OneOffWithDifferentEndDate_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(
            schedule: NewSchedule(frequency: "oneOff", startDate: Today().AddDays(2), endDate: Today().AddDays(3))));

    [Fact]
    public async Task SubmitAsync_GroupSizeZero_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(groupSize: 0));

    [Fact]
    public async Task SubmitAsync_RecurringTermLongerThanAYear_ReturnsInvalidApplication() =>
        await AssertInvalidSubmissionAsync(NewSubmitRequest(
            schedule: NewSchedule(frequency: "recurringWeekly", endDate: Today().AddDays(400), dayOfWeek: "monday")));

    [Fact]
    public async Task SubmitAsync_UnknownRoom_ReturnsRoomNotBookable()
    {
        var repo = new FakeApplicationRepository();
        var managers = new FakeVenueManagerRepository();
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.SubmitAsync(Guid.NewGuid(), Guid.NewGuid(), NewSubmitRequest(), null, null);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.RoomNotBookable, result.Error!.Code);
    }

    [Fact]
    public async Task SubmitAsync_DraftRoom_ReturnsRoomNotBookable()
    {
        var venue = NewVenue();
        var room = NewRoom(venue, status: RoomStatus.Draft);
        var repo = new FakeApplicationRepository();
        repo.Rooms.Add(room);
        var managers = new FakeVenueManagerRepository();
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.SubmitAsync(room.Id, Guid.NewGuid(), NewSubmitRequest(), null, null);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.RoomNotBookable, result.Error!.Code);
    }

    [Fact]
    public async Task SubmitAsync_TurnstileFails_ReturnsTurnstileFailedAndCreatesNothing()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var service = CreateService(repo, managers, out _, out var turnstile, out _);
        turnstile.ShouldPass = false;

        var result = await service.SubmitAsync(room.Id, organizer.Id, NewSubmitRequest(), null, null);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.TurnstileFailed, result.Error!.Code);
        Assert.Empty(repo.Applications);
    }

    // ----- AddMessage ------------------------------------------------------------------------

    [Fact]
    public async Task AddMessageAsync_ManagerMessageOnPending_FlipsToNeedsInfoAndNotifiesOrganizer()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer, ApplicationStatus.Pending);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out var notifications, out _, out _);

        var result = await service.AddMessageAsync(application.Id, manager.Id, new ApplicationMessageRequest("Could you clarify the group size?"));

        Assert.Null(result.Error);
        Assert.Equal(ApplicationStatus.NeedsInfo, repo.Applications.Single().Status);
        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.ApplicationMessage, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == organizer.Id);
    }

    [Fact]
    public async Task AddMessageAsync_OrganizerMessageOnNeedsInfo_FlipsToPendingAndNotifiesManagers()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer, ApplicationStatus.NeedsInfo);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out var notifications, out _, out _);

        var result = await service.AddMessageAsync(application.Id, organizer.Id, new ApplicationMessageRequest("20 people, all adults."));

        Assert.Null(result.Error);
        Assert.Equal(ApplicationStatus.Pending, repo.Applications.Single().Status);
        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.ApplicationMessage, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == manager.Id);
    }

    [Fact]
    public async Task AddMessageAsync_OnApprovedApplication_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(room, organizer, ApplicationStatus.Approved, decidedAtUtc: FixedNow);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.AddMessageAsync(application.Id, organizer.Id, new ApplicationMessageRequest("Still good?"));

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task AddMessageAsync_EmptyBody_ReturnsInvalidApplication()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.AddMessageAsync(application.Id, organizer.Id, new ApplicationMessageRequest("   "));

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.InvalidApplication, result.Error!.Code);
    }

    // ----- Decide ------------------------------------------------------------------------------

    [Fact]
    public async Task DecideAsync_ManagerApproves_SetsApprovedAndDecidedAtUtcAndNotifiesOrganizer()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out var notifications, out _, out var analytics);

        var result = await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("approve", null));

        Assert.Null(result.Error);
        var stored = repo.Applications.Single();
        Assert.Equal(ApplicationStatus.Approved, stored.Status);
        Assert.Equal(FixedNow, stored.DecidedAtUtc);
        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.ApplicationApproved, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == organizer.Id);
        Assert.Contains(analytics.Events, e => e.EventType == "application_decided");
    }

    [Fact]
    public async Task DecideAsync_ManagerDeclines_SetsDeclinedAndNotifiesOrganizer()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out var notifications, out _, out _);

        var result = await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("decline", null));

        Assert.Null(result.Error);
        Assert.Equal(ApplicationStatus.Declined, repo.Applications.Single().Status);
        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.ApplicationDeclined, notification.Type);
    }

    [Fact]
    public async Task DecideAsync_OrganizerWhoIsNotManager_ReturnsNotVenueManager()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.DecideAsync(application.Id, organizer.Id, new ApplicationDecisionRequest("approve", null));

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.NotVenueManager, result.Error!.Code);
        Assert.Equal(ApplicationStatus.Pending, repo.Applications.Single().Status);
    }

    [Fact]
    public async Task DecideAsync_AlreadyDecided_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);
        await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("approve", null));

        var result = await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("decline", null));

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task DecideAsync_UnknownDecisionToken_ReturnsInvalidApplication()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("maybe", null));

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.InvalidApplication, result.Error!.Code);
    }

    [Fact]
    public async Task DecideAsync_ApproveWhenSlotTaken_AutoDeclinesAndNotifiesOrganizer()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var bookings = new FakeBookingService { SlotTaken = true };
        var service = CreateService(repo, managers, out var notifications, out _, out var analytics, bookings);

        var result = await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("approve", null));

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.SlotTaken, result.Error!.Code);
        var stored = repo.Applications.Single();
        Assert.Equal(ApplicationStatus.Declined, stored.Status);
        Assert.Equal(FixedNow, stored.DecidedAtUtc);
        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.ApplicationDeclined, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == organizer.Id);
        Assert.Contains(analytics.Events, e => e.EventType == "application_decided");
        Assert.Empty(bookings.Confirmed);
    }

    [Fact]
    public async Task DecideAsync_ApproveSuccess_ConfirmsBookingAndSetsApproved()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var bookings = new FakeBookingService();
        var service = CreateService(repo, managers, out _, out _, out _, bookings);

        var result = await service.DecideAsync(application.Id, manager.Id, new ApplicationDecisionRequest("approve", null));

        Assert.Null(result.Error);
        Assert.Contains(application, bookings.Confirmed);
        Assert.Equal(ApplicationStatus.Approved, repo.Applications.Single().Status);
    }

    // ----- Withdraw ------------------------------------------------------------------------------

    [Fact]
    public async Task WithdrawAsync_OrganizerWithdrawsPending_SetsWithdrawn()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.WithdrawAsync(application.Id, organizer.Id);

        Assert.Null(result.Error);
        Assert.Equal(ApplicationStatus.Withdrawn, repo.Applications.Single().Status);
    }

    [Fact]
    public async Task WithdrawAsync_AfterDecision_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(room, organizer, ApplicationStatus.Approved, decidedAtUtc: FixedNow);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.WithdrawAsync(application.Id, organizer.Id);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.InvalidState, result.Error!.Code);
    }

    // ----- Party scoping & lazy expiry -------------------------------------------------------------

    [Fact]
    public async Task GetAsync_CallerIsNeitherOrganizerNorManager_ReturnsNotFound()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(room, organizer);
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);
        var stranger = Guid.NewGuid();

        var result = await service.GetAsync(application.Id, stranger);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.NotFound, result.Error!.Code);
    }

    [Fact]
    public async Task GetAsync_PendingApplicationPastExpiry_ReturnsExpiredAndPersistsTheFlip()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var application = NewApplication(
            room, organizer, ApplicationStatus.Pending,
            createdAtUtc: FixedNow.AddDays(-20), expiresAtUtc: FixedNow.AddDays(-6));
        repo.Applications.Add(application);
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.GetAsync(application.Id, organizer.Id);

        Assert.Null(result.Error);
        Assert.Equal("expired", result.Value!.Status);
        Assert.Equal(ApplicationStatus.Expired, repo.Applications.Single().Status);
    }

    // ----- Scenario / request builders --------------------------------------------------------

    private static DateOnly Today() => DateOnly.FromDateTime(FixedNow.UtcDateTime.Date);

    private static async Task AssertInvalidSubmissionAsync(SubmitApplicationRequest request)
    {
        var repo = new FakeApplicationRepository();
        var managers = new FakeVenueManagerRepository();
        var service = CreateService(repo, managers, out _, out _, out _);

        var result = await service.SubmitAsync(Guid.NewGuid(), Guid.NewGuid(), request, null, null);

        Assert.Null(result.Value);
        Assert.Equal(ApplicationErrorCodes.InvalidApplication, result.Error!.Code);
    }

    private static (FakeApplicationRepository Repo, FakeVenueManagerRepository Managers, Venue Venue, Room Room, User Organizer, User Manager) NewScenario()
    {
        var venue = NewVenue();
        var room = NewRoom(venue);
        var organizer = NewUser("Jamie Organizer", "jamie@example.com");
        var manager = NewUser("Casey Manager", "casey@example.com");

        var repo = new FakeApplicationRepository();
        repo.Rooms.Add(room);
        repo.Users.Add(organizer);
        repo.Users.Add(manager);

        var managers = new FakeVenueManagerRepository();
        managers.AddManager(venue.Id, manager);

        return (repo, managers, venue, room, organizer, manager);
    }

    private static Venue NewVenue() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Grace Test Venue",
        Slug = $"grace-{Guid.NewGuid():N}",
        CreatedAtUtc = FixedNow,
    };

    private static Room NewRoom(Venue venue, RoomStatus status = RoomStatus.Published) => new()
    {
        Id = Guid.NewGuid(),
        VenueId = venue.Id,
        Venue = venue,
        Name = "Fellowship Hall",
        Slug = $"fellowship-hall-{Guid.NewGuid():N}",
        Status = status,
        CreatedAtUtc = FixedNow,
    };

    private static User NewUser(string displayName, string? email) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = email,
        CreatedAtUtc = FixedNow,
    };

    private static Application NewApplication(
        Room room,
        User organizer,
        ApplicationStatus status = ApplicationStatus.Pending,
        DateTimeOffset? createdAtUtc = null,
        DateTimeOffset? expiresAtUtc = null,
        DateTimeOffset? decidedAtUtc = null)
    {
        var created = createdAtUtc ?? FixedNow;
        return new Application
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            ActivityType = ActivityType.Community,
            GroupSize = 20,
            Frequency = ScheduleFrequency.OneOff,
            StartDate = Today().AddDays(2),
            EndDate = null,
            DayOfWeek = null,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            IntentText = "We'd like to host a community meetup.",
            Status = status,
            CreatedAtUtc = created,
            DecidedAtUtc = decidedAtUtc,
            ExpiresAtUtc = expiresAtUtc ?? created.AddDays(14),
            Room = room,
            Organizer = organizer,
        };
    }

    private static ScheduleDto NewSchedule(
        string frequency = "oneOff",
        DateOnly? startDate = null,
        DateOnly? endDate = null,
        string? dayOfWeek = null,
        string startTime = "09:00",
        string endTime = "11:00") => new(
        Frequency: frequency,
        StartDate: startDate ?? Today().AddDays(2),
        EndDate: endDate,
        DayOfWeek: dayOfWeek,
        StartTime: startTime,
        EndTime: endTime);

    private static SubmitApplicationRequest NewSubmitRequest(
        string activityType = "community",
        int groupSize = 20,
        ScheduleDto? schedule = null,
        string intentText = "We'd like to host a community meetup for local families.",
        string? turnstileToken = "turnstile-token") => new(
        ActivityType: activityType,
        GroupSize: groupSize,
        Schedule: schedule ?? NewSchedule(),
        IntentText: intentText,
        TurnstileToken: turnstileToken);

    private static ApplicationService CreateService(
        FakeApplicationRepository repo,
        FakeVenueManagerRepository managers,
        out FakeNotificationDispatcher notifications,
        out FakeTurnstileVerifier turnstile,
        out FakeAnalyticsSink analytics,
        FakeBookingService? bookings = null)
    {
        notifications = new FakeNotificationDispatcher();
        turnstile = new FakeTurnstileVerifier();
        analytics = new FakeAnalyticsSink();
        return new ApplicationService(
            repo, managers, bookings ?? new FakeBookingService(), notifications, turnstile, analytics,
            new FixedTimeProvider(FixedNow));
    }

    /// <summary>
    /// Booking confirmation stub: approvals succeed by default; set <see cref="SlotTaken"/> to
    /// exercise the auto-decline path. Only the confirmation seam is reachable from
    /// <see cref="ApplicationService"/> — the read/cancel members throw if touched.
    /// </summary>
    private sealed class FakeBookingService : IBookingService
    {
        public bool SlotTaken { get; set; }

        public List<Application> Confirmed { get; } = [];

        public Task<BookingConfirmation> ConfirmFromApplicationAsync(Application application, CancellationToken ct = default)
        {
            if (SlotTaken)
            {
                return Task.FromResult(new BookingConfirmation(null, SlotTaken: true));
            }

            Confirmed.Add(application);
            return Task.FromResult(new BookingConfirmation(null, SlotTaken: false));
        }

        public Task<BookingResult<Steeple.Api.Contracts.Bookings.BookingListResult>> GetForOrganizerAsync(
            Guid organizerId, string? status, int page, int pageSize, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<BookingResult<Steeple.Api.Contracts.Bookings.BookingListResult>> GetForManagerAsync(
            Guid managerId, string? status, int page, int pageSize, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<BookingResult<Steeple.Api.Contracts.Bookings.BookingDto>> GetAsync(
            Guid bookingId, Guid callerId, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<BookingResult<Steeple.Api.Contracts.Bookings.BookingDto>> CancelAsync(
            Guid bookingId, Guid callerId, Steeple.Api.Contracts.Bookings.CancelBookingRequest request, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<BookingResult<Steeple.Api.Contracts.Bookings.BookingDto>> MarkNoShowAsync(
            Guid occurrenceId, Guid callerId, CancellationToken ct = default) =>
            throw new NotSupportedException();
    }

    /// <summary>A clock frozen at a fixed instant, so tests can pin exact expiry/creation math.</summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }

    private sealed class FakeTurnstileVerifier : ITurnstileVerifier
    {
        public bool ShouldPass { get; set; } = true;

        public Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default) =>
            Task.FromResult(ShouldPass);
    }

    private sealed class FakeAnalyticsSink : IAnalyticsSink
    {
        public List<(string EventType, object? Payload)> Events { get; } = [];

        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default)
        {
            Events.Add((eventType, payload));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeNotificationDispatcher : INotificationDispatcher
    {
        public List<(IReadOnlyList<NotificationRecipient> Recipients, NotificationType Type, object Payload, EmailContent? Email)> Calls { get; } = [];

        public Task NotifyAsync(
            IReadOnlyList<NotificationRecipient> recipients,
            NotificationType type,
            object payload,
            EmailContent? email,
            CancellationToken ct = default)
        {
            Calls.Add((recipients, type, payload, email));
            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// In-memory stand-in for <see cref="IVenueManagerRepository"/>. Rows are (venue, user) pairs,
    /// mirroring the real <c>venue_managers</c> link table.
    /// </summary>
    private sealed class FakeVenueManagerRepository : IVenueManagerRepository
    {
        private readonly List<(Guid VenueId, User User)> _managers = [];

        public void AddManager(Guid venueId, User user) => _managers.Add((venueId, user));

        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(_managers.Any(m => m.VenueId == venueId && m.User.Id == userId));

        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Guid>>(
                _managers.Where(m => m.User.Id == userId).Select(m => m.VenueId).Distinct().ToList());

        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Venue>>([]);

        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<User>>(
                _managers.Where(m => m.VenueId == venueId && m.User.DeletedAtUtc is null).Select(m => m.User).ToList());
    }

    /// <summary>
    /// In-memory stand-in for <see cref="IApplicationRepository"/>. Mutates the same object
    /// references the service holds (mirroring how EF Core's change tracker keeps in-flight
    /// entities identical across calls within one unit of work), and attaches the display graph
    /// (room/venue, organizer) from <see cref="Rooms"/>/<see cref="Users"/> on every load, the way
    /// the EF adapter's <c>.Include(...)</c> chain would.
    /// </summary>
    private sealed class FakeApplicationRepository : IApplicationRepository
    {
        public List<Room> Rooms { get; } = [];

        public List<User> Users { get; } = [];

        public List<Application> Applications { get; } = [];

        public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) =>
            Task.FromResult(Rooms.FirstOrDefault(r => r.Id == roomId));

        public Task<Application?> FindByIdempotencyKeyAsync(Guid organizerId, Guid idempotencyKey, CancellationToken ct = default)
        {
            var application = Applications.FirstOrDefault(a => a.OrganizerId == organizerId && a.IdempotencyKey == idempotencyKey);
            if (application is not null)
            {
                Attach(application);
            }

            return Task.FromResult(application);
        }

        public Task AddAsync(Application application, CancellationToken ct = default)
        {
            Applications.Add(application);
            return Task.CompletedTask;
        }

        public Task<Application?> GetAsync(Guid applicationId, CancellationToken ct = default)
        {
            var application = Applications.FirstOrDefault(a => a.Id == applicationId);
            if (application is not null)
            {
                Attach(application);
            }

            return Task.FromResult(application);
        }

        public Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForOrganizerAsync(
            Guid organizerId, ApplicationStatus? status, int page, int pageSize, CancellationToken ct = default) =>
            Page(Applications.Where(a => a.OrganizerId == organizerId), status, page, pageSize);

        public Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForVenuesAsync(
            IReadOnlyList<Guid> venueIds, ApplicationStatus? status, int page, int pageSize, CancellationToken ct = default) =>
            Page(Applications.Where(a => venueIds.Contains((a.Room ?? Rooms.First(r => r.Id == a.RoomId)).VenueId)), status, page, pageSize);

        public Task AddMessageAsync(ApplicationMessage message, CancellationToken ct = default)
        {
            var application = Applications.Single(a => a.Id == message.ApplicationId);
            message.Application = application;
            application.Messages.Add(message);
            return Task.CompletedTask;
        }

        public Task SaveAsync(CancellationToken ct = default) => Task.CompletedTask;

        private void Attach(Application application)
        {
            application.Room ??= Rooms.FirstOrDefault(r => r.Id == application.RoomId);
            application.Organizer ??= Users.FirstOrDefault(u => u.Id == application.OrganizerId);
        }

        private Task<(IReadOnlyList<Application> Items, int TotalCount)> Page(
            IEnumerable<Application> query, ApplicationStatus? status, int page, int pageSize)
        {
            foreach (var application in query)
            {
                Attach(application);
            }

            if (status is { } s)
            {
                query = query.Where(a => a.Status == s);
            }

            var all = query.OrderByDescending(a => a.CreatedAtUtc).ThenByDescending(a => a.Id).ToList();
            var items = all.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult<(IReadOnlyList<Application>, int)>((items, all.Count));
        }
    }
}
