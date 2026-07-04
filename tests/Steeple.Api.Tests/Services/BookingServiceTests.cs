namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="BookingService"/>: cancellation's 48-hour notice window, the
/// no-show state machine, party scoping, and the lazy sweeps (past occurrences → Occurred,
/// finished terms → Completed, the once-only renewal-due nudge) run on read (SYSTEM_DESIGN
/// §5/§7). Repository, venue-manager repository, notification dispatcher, analytics sink and
/// clock are hand-rolled in-memory fakes, matching the no-mocking-library idiom used elsewhere
/// in this test project (see <c>ApplicationServiceTests</c>).
/// </summary>
public class BookingServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    // ----- Cancel ------------------------------------------------------------------------------

    [Fact]
    public async Task CancelAsync_ConfirmedBooking_CancelsAndFreesOccurrencesOutsideNoticeWindow()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [
            TimeSpan.FromHours(1), TimeSpan.FromHours(24), TimeSpan.FromHours(72), TimeSpan.FromHours(240),
        ]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.CancelAsync(booking.Id, organizer.Id, new CancelBookingRequest("Change of plans"));

        Assert.Null(result.Error);
        Assert.Equal(BookingStatus.Cancelled, booking.Status);
        Assert.Equal(organizer.Id, booking.CancelledBy);
        Assert.Equal(FixedNow, booking.CancelledAtUtc);
        Assert.Equal("Change of plans", booking.CancelReason);

        var byOffset = booking.Occurrences.OrderBy(o => o.StartUtc).ToList();
        Assert.Equal(OccurrenceStatus.Scheduled, byOffset[0].Status); // +1h — inside the window
        Assert.Equal(OccurrenceStatus.Scheduled, byOffset[1].Status); // +24h — inside the window
        Assert.Equal(OccurrenceStatus.Cancelled, byOffset[2].Status); // +72h — freed
        Assert.Equal(OccurrenceStatus.Cancelled, byOffset[3].Status); // +240h — freed
    }

    [Fact]
    public async Task CancelAsync_ByOrganizer_NotifiesVenueManagers()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        await service.CancelAsync(booking.Id, organizer.Id, new CancelBookingRequest(null));

        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.BookingCancelled, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == manager.Id);
    }

    [Fact]
    public async Task CancelAsync_ByVenueManager_NotifiesOrganizer()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        await service.CancelAsync(booking.Id, manager.Id, new CancelBookingRequest(null));

        var notification = Assert.Single(notifications.Calls);
        Assert.Equal(NotificationType.BookingCancelled, notification.Type);
        Assert.Contains(notification.Recipients, r => r.UserId == organizer.Id);
    }

    [Fact]
    public async Task CancelAsync_AlreadyCancelled_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out _, out _);
        await service.CancelAsync(booking.Id, organizer.Id, new CancelBookingRequest(null));

        var result = await service.CancelAsync(booking.Id, organizer.Id, new CancelBookingRequest(null));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task CancelAsync_AllOccurrencesPast_SweepCompletesFirstThenReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(-5)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.CancelAsync(booking.Id, organizer.Id, new CancelBookingRequest(null));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
        Assert.Equal(BookingStatus.Completed, booking.Status);
    }

    [Fact]
    public async Task CancelAsync_ReasonOverLimit_ReturnsInvalidBooking()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out _, out _);
        var reason = new string('x', 501);

        var result = await service.CancelAsync(booking.Id, organizer.Id, new CancelBookingRequest(reason));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidBooking, result.Error!.Code);
    }

    [Fact]
    public async Task CancelAsync_Stranger_ReturnsNotFound()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out _, out _);
        var stranger = Guid.NewGuid();

        var result = await service.CancelAsync(booking.Id, stranger, new CancelBookingRequest(null));

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.NotFound, result.Error!.Code);
    }

    // ----- MarkNoShow --------------------------------------------------------------------------

    [Fact]
    public async Task MarkNoShowAsync_PastScheduledOccurrence_MarksNoShowAndTracksAnalytics()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(-2)]);
        repo.Bookings.Add(booking);
        var occurrence = booking.Occurrences.Single();
        var service = CreateService(repo, managers, out _, out var analytics);

        var result = await service.MarkNoShowAsync(occurrence.Id, manager.Id);

        Assert.Null(result.Error);
        Assert.Equal(OccurrenceStatus.NoShow, occurrence.Status);
        Assert.Equal(manager.Id, occurrence.NoShowMarkedBy);
        Assert.Contains(analytics.Events, e => e.EventType == "no_show_marked");
    }

    [Fact]
    public async Task MarkNoShowAsync_FutureOccurrence_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(2)]);
        repo.Bookings.Add(booking);
        var occurrence = booking.Occurrences.Single();
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.MarkNoShowAsync(occurrence.Id, manager.Id);

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task MarkNoShowAsync_CancelledOccurrence_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(-2)]);
        repo.Bookings.Add(booking);
        var occurrence = booking.Occurrences.Single();
        occurrence.Status = OccurrenceStatus.Cancelled;
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.MarkNoShowAsync(occurrence.Id, manager.Id);

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task MarkNoShowAsync_AlreadyNoShow_ReturnsInvalidState()
    {
        var (repo, managers, _, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(-2)]);
        repo.Bookings.Add(booking);
        var occurrence = booking.Occurrences.Single();
        occurrence.Status = OccurrenceStatus.NoShow;
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.MarkNoShowAsync(occurrence.Id, manager.Id);

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidState, result.Error!.Code);
    }

    [Fact]
    public async Task MarkNoShowAsync_Stranger_ReturnsNotFound()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(-2)]);
        repo.Bookings.Add(booking);
        var occurrence = booking.Occurrences.Single();
        var service = CreateService(repo, managers, out _, out _);
        var stranger = Guid.NewGuid();

        var result = await service.MarkNoShowAsync(occurrence.Id, stranger);

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.NotFound, result.Error!.Code);
    }

    // ----- Lazy sweeps via GetAsync -------------------------------------------------------------

    [Fact]
    public async Task GetAsync_AllOccurrencesPast_SweepsOccurrencesAndCompletesBooking()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(-5), TimeSpan.FromHours(-2)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.GetAsync(booking.Id, organizer.Id);

        Assert.Null(result.Error);
        Assert.Equal("completed", result.Value!.Status);
        Assert.All(result.Value.Occurrences, o => Assert.Equal("occurred", o.Status));
    }

    [Fact]
    public async Task GetAsync_RecurringNearingEnd_SendsRenewalNudgeOnceOnly()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var today = DateOnly.FromDateTime(FixedNow.UtcDateTime);
        var booking = NewBooking(
            room, organizer,
            occurrenceOffsets: [TimeSpan.FromHours(48)],
            type: BookingType.Recurring,
            endDate: today.AddDays(10));
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        await service.GetAsync(booking.Id, organizer.Id);
        var firstCallCount = notifications.Calls.Count(c => c.Type == NotificationType.RenewalDue);
        await service.GetAsync(booking.Id, organizer.Id);
        var secondCallCount = notifications.Calls.Count(c => c.Type == NotificationType.RenewalDue);

        Assert.Equal(1, firstCallCount);
        Assert.Equal(1, secondCallCount);
        Assert.Contains(notifications.Calls, c => c.Type == NotificationType.RenewalDue && c.Recipients.Any(r => r.UserId == organizer.Id));
    }

    [Fact]
    public async Task GetAsync_OneOffNearingEnd_SendsNoRenewalNudge()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var today = DateOnly.FromDateTime(FixedNow.UtcDateTime);
        var booking = NewBooking(
            room, organizer,
            occurrenceOffsets: [TimeSpan.FromHours(48)],
            type: BookingType.OneOff,
            endDate: today.AddDays(10));
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        await service.GetAsync(booking.Id, organizer.Id);

        Assert.DoesNotContain(notifications.Calls, c => c.Type == NotificationType.RenewalDue);
    }

    // ----- Organizer listing ---------------------------------------------------------------------

    [Fact]
    public async Task GetForOrganizerAsync_UnknownStatusToken_ReturnsInvalidBooking()
    {
        var (repo, managers, _, _, organizer, _) = NewScenario();
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.GetForOrganizerAsync(organizer.Id, "not-a-status", 1, 24);

        Assert.Null(result.Value);
        Assert.Equal(BookingErrorCodes.InvalidBooking, result.Error!.Code);
    }

    [Fact]
    public async Task GetForOrganizerAsync_ConfirmedFilter_ReturnsOnlyConfirmedBookings()
    {
        var (repo, managers, _, room, organizer, _) = NewScenario();
        var confirmed = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        var cancelled = NewBooking(room, organizer, occurrenceOffsets: [TimeSpan.FromHours(240)]);
        cancelled.Status = BookingStatus.Cancelled;
        repo.Bookings.Add(confirmed);
        repo.Bookings.Add(cancelled);
        var service = CreateService(repo, managers, out _, out _);

        var result = await service.GetForOrganizerAsync(organizer.Id, "confirmed", 1, 24);

        Assert.Null(result.Error);
        var item = Assert.Single(result.Value!.Items);
        Assert.Equal(confirmed.Id, item.Id);
    }

    // ----- Scenario / fixture builders ----------------------------------------------------------

    private static (FakeBookingRepository Repo, FakeVenueManagerRepository Managers, Venue Venue, Room Room, User Organizer, User Manager) NewScenario()
    {
        var venue = NewVenue();
        var room = NewRoom(venue);
        var organizer = NewUser("Jamie Organizer", "jamie@example.com");
        var manager = NewUser("Casey Manager", "casey@example.com");

        var repo = new FakeBookingRepository();
        var managers = new FakeVenueManagerRepository();
        managers.AddManager(venue.Id, manager);

        return (repo, managers, venue, room, organizer, manager);
    }

    private static Venue NewVenue() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Grace Test Venue",
        Slug = $"grace-{Guid.NewGuid():N}",
        Timezone = "America/New_York",
        CreatedAtUtc = FixedNow,
    };

    private static Room NewRoom(Venue venue) => new()
    {
        Id = Guid.NewGuid(),
        VenueId = venue.Id,
        Venue = venue,
        Name = "Fellowship Hall",
        Slug = $"fellowship-hall-{Guid.NewGuid():N}",
        Status = RoomStatus.Published,
        CreatedAtUtc = FixedNow,
    };

    private static User NewUser(string displayName, string? email) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = email,
        CreatedAtUtc = FixedNow,
    };

    private static Booking NewBooking(
        Room room,
        User organizer,
        IReadOnlyList<TimeSpan> occurrenceOffsets,
        BookingType type = BookingType.OneOff,
        DateOnly? endDate = null)
    {
        var today = DateOnly.FromDateTime(FixedNow.UtcDateTime);
        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            ApplicationId = Guid.NewGuid(),
            RoomId = room.Id,
            OrganizerId = organizer.Id,
            Type = type,
            StartDate = today,
            EndDate = endDate ?? today.AddDays(1),
            DayOfWeek = type == BookingType.Recurring ? FixedNow.DayOfWeek : null,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = FixedNow,
            Room = room,
            Organizer = organizer,
        };

        foreach (var offset in occurrenceOffsets)
        {
            var start = FixedNow + offset;
            var occurrence = new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RoomId = room.Id,
                StartUtc = start,
                EndUtc = start.AddHours(2),
                LocalDate = DateOnly.FromDateTime(start.UtcDateTime),
                Status = OccurrenceStatus.Scheduled,
                Booking = booking,
            };
            booking.Occurrences.Add(occurrence);
        }

        return booking;
    }

    private static BookingService CreateService(
        FakeBookingRepository repo,
        FakeVenueManagerRepository managers,
        out FakeNotificationDispatcher notifications,
        out FakeAnalyticsSink analytics)
    {
        notifications = new FakeNotificationDispatcher();
        analytics = new FakeAnalyticsSink();
        return new BookingService(repo, managers, notifications, analytics, new FixedTimeProvider(FixedNow));
    }

    /// <summary>A clock frozen at a fixed instant, so tests can pin exact cancellation/sweep math.</summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
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
    /// In-memory stand-in for <see cref="IBookingRepository"/>. Mutates the same object references
    /// the service holds (mirroring EF Core's change tracker keeping in-flight entities identical
    /// across calls within one unit of work); every booking already carries its full display graph
    /// (room/venue, organizer, occurrences) the way the EF adapter's <c>.Include(...)</c> chain would.
    /// </summary>
    private sealed class FakeBookingRepository : IBookingRepository
    {
        public List<Booking> Bookings { get; } = [];

        public bool NextSaveIsSlotTaken { get; set; }

        public int SaveCount { get; private set; }

        public Task<bool> TrySaveNewAsync(Booking booking, CancellationToken ct = default)
        {
            if (NextSaveIsSlotTaken)
            {
                return Task.FromResult(false);
            }

            Bookings.Add(booking);
            SaveCount++;
            return Task.FromResult(true);
        }

        public Task<Booking?> GetAsync(Guid bookingId, CancellationToken ct = default) =>
            Task.FromResult(Bookings.FirstOrDefault(b => b.Id == bookingId));

        public Task<BookingOccurrence?> GetOccurrenceAsync(Guid occurrenceId, CancellationToken ct = default) =>
            Task.FromResult(Bookings.SelectMany(b => b.Occurrences).FirstOrDefault(o => o.Id == occurrenceId));

        public Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForOrganizerAsync(
            Guid organizerId, BookingStatus? status, int page, int pageSize, CancellationToken ct = default) =>
            Page(Bookings.Where(b => b.OrganizerId == organizerId), status, page, pageSize);

        public Task<(IReadOnlyList<Booking> Items, int TotalCount)> GetForVenuesAsync(
            IReadOnlyList<Guid> venueIds, BookingStatus? status, int page, int pageSize, CancellationToken ct = default) =>
            Page(Bookings.Where(b => venueIds.Contains(b.Room!.VenueId)), status, page, pageSize);

        public Task SaveAsync(CancellationToken ct = default)
        {
            SaveCount++;
            return Task.CompletedTask;
        }

        private static Task<(IReadOnlyList<Booking> Items, int TotalCount)> Page(
            IEnumerable<Booking> query, BookingStatus? status, int page, int pageSize)
        {
            if (status is { } s)
            {
                query = query.Where(b => b.Status == s);
            }

            var all = query.OrderByDescending(b => b.CreatedAtUtc).ThenByDescending(b => b.Id).ToList();
            var items = all.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult<(IReadOnlyList<Booking>, int)>((items, all.Count));
        }
    }
}
