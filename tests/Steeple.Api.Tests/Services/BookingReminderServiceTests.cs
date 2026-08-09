using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="BookingReminderService"/>: which occurrences are due which nudge
/// (T−7d for the first upcoming one, T−1d for every one), that both parties hear about it, and
/// that the <c>booking_reminders</c> claim makes a re-run silent. The fake repository enforces the
/// same unique (occurrence, kind) key the database does, so the dedup proof here is the real one.
/// Hand-rolled in-memory fakes, matching the no-mocking-library idiom of this test project.
/// </summary>
public class BookingReminderServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task RunOnceAsync_OccurrenceSixDaysOut_SendsComingUpToBothParties()
    {
        var (repo, managers, room, organizer, manager) = NewScenario();
        var booking = NewBooking(room, organizer, [TimeSpan.FromDays(6)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        var sent = await service.RunOnceAsync();

        Assert.Equal(1, sent);
        Assert.Equal(2, notifications.Calls.Count);
        Assert.All(notifications.Calls, c => Assert.Equal(NotificationType.BookingReminder, c.Type));
        Assert.Contains(notifications.Calls, c => c.Recipients.Any(r => r.UserId == organizer.Id));
        Assert.Contains(notifications.Calls, c => c.Recipients.Any(r => r.UserId == manager.Id));
        Assert.All(notifications.Calls, c => Assert.Null(c.Email));
        Assert.Equal("comingUp", GetProp(notifications.Calls[0].Payload, "reminderKind"));
        Assert.Equal($"/bookings/{booking.Id}", GetProp(notifications.Calls[0].Payload, "deepLink"));
    }

    [Fact]
    public async Task RunOnceAsync_OccurrenceTwentyHoursOut_SendsTomorrowToBothParties()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, [TimeSpan.FromHours(20)]);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        var sent = await service.RunOnceAsync();

        Assert.Equal(1, sent);
        Assert.Equal(2, notifications.Calls.Count);
        Assert.All(notifications.Calls, c => Assert.StartsWith("Tomorrow:", c.Email!.Subject, StringComparison.Ordinal));
        Assert.Equal("tomorrow", GetProp(notifications.Calls[0].Payload, "reminderKind"));
    }

    [Fact]
    public async Task RunOnceAsync_RunTwice_NeverSendsTheSameReminderTwice()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        repo.Bookings.Add(NewBooking(room, organizer, [TimeSpan.FromHours(20), TimeSpan.FromDays(6)]));
        var service = CreateService(repo, managers, out var notifications, out _);

        var first = await service.RunOnceAsync();
        var callsAfterFirst = notifications.Calls.Count;
        var second = await service.RunOnceAsync();

        Assert.Equal(1, first); // the 20h occurrence; the 6d one is not "first upcoming"
        Assert.Equal(0, second);
        Assert.Equal(callsAfterFirst, notifications.Calls.Count);
    }

    [Fact]
    public async Task RunOnceAsync_WeeklyRecurring_ComingUpOnlyForTheFirstUpcomingOccurrence()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        // A weekly term whose next three dates are 2, 9 and 16 days out: only the 2-day one is
        // inside the week-out window, and it is the first upcoming — the others wait their turn.
        var booking = NewBooking(
            room, organizer, [TimeSpan.FromDays(2), TimeSpan.FromDays(9), TimeSpan.FromDays(16)],
            BookingType.Recurring);
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        var sent = await service.RunOnceAsync();

        Assert.Equal(1, sent);
        var reminded = Assert.Single(repo.Claims);
        Assert.Equal(BookingReminderKind.ComingUp, reminded.Kind);
        Assert.Equal(booking.Occurrences.OrderBy(o => o.StartUtc).First().Id, reminded.OccurrenceId);
        Assert.All(notifications.Calls, c => Assert.Null(c.Email));
    }

    [Fact]
    public async Task RunOnceAsync_FirstOccurrenceInsideTheDayWindow_SendsTomorrowOnlyNeverBoth()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        repo.Bookings.Add(NewBooking(room, organizer, [TimeSpan.FromHours(6)]));
        var service = CreateService(repo, managers, out _, out _);

        await service.RunOnceAsync();

        var claim = Assert.Single(repo.Claims);
        Assert.Equal(BookingReminderKind.Tomorrow, claim.Kind);
    }

    [Fact]
    public async Task RunOnceAsync_LaterRecurringOccurrenceTomorrow_UsesInboxAndPushWithoutEmail()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        var booking = NewBooking(
            room,
            organizer,
            [TimeSpan.FromDays(-7), TimeSpan.FromHours(20)],
            BookingType.Recurring);
        booking.Occurrences.OrderBy(item => item.StartUtc).First().Status = OccurrenceStatus.Occurred;
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        Assert.Equal(1, await service.RunOnceAsync());
        Assert.Equal(2, notifications.Calls.Count);
        Assert.All(notifications.Calls, call => Assert.Null(call.Email));
    }

    [Fact]
    public async Task RunOnceAsync_CancelledOccurrence_IsNeverReminded()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        var booking = NewBooking(room, organizer, [TimeSpan.FromHours(20)]);
        booking.Occurrences.Single().Status = OccurrenceStatus.Cancelled;
        repo.Bookings.Add(booking);
        var service = CreateService(repo, managers, out var notifications, out _);

        Assert.Equal(0, await service.RunOnceAsync());
        Assert.Empty(notifications.Calls);
        Assert.Empty(repo.Claims);
    }

    [Fact]
    public async Task RunOnceAsync_VenueWithNoLinkedManager_StillRemindsTheOrganizer()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        managers.Clear();
        repo.Bookings.Add(NewBooking(room, organizer, [TimeSpan.FromHours(20)]));
        var service = CreateService(repo, managers, out var notifications, out _);

        Assert.Equal(1, await service.RunOnceAsync());
        var call = Assert.Single(notifications.Calls);
        Assert.Equal(organizer.Id, Assert.Single(call.Recipients).UserId);
    }

    [Fact]
    public async Task RunOnceAsync_DispatchFails_ReleasesTheClaimSoTheNextSweepRetries()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        repo.Bookings.Add(NewBooking(room, organizer, [TimeSpan.FromHours(20)]));
        var notifications = new FakeNotificationDispatcher { ThrowOnce = true };
        var service = CreateService(repo, managers, notifications, new FakeAnalyticsSink());

        Assert.Equal(0, await service.RunOnceAsync());
        Assert.Empty(repo.Claims);

        Assert.Equal(1, await service.RunOnceAsync());
        Assert.Single(repo.Claims);
    }

    [Fact]
    public async Task RunOnceAsync_Sending_TracksBookingReminderSent()
    {
        var (repo, managers, room, organizer, _) = NewScenario();
        repo.Bookings.Add(NewBooking(room, organizer, [TimeSpan.FromHours(20)]));
        var service = CreateService(repo, managers, out _, out var analytics);

        await service.RunOnceAsync();

        var tracked = Assert.Single(analytics.Events);
        Assert.Equal("booking_reminder_sent", tracked.EventType);
        Assert.Equal("tomorrow", GetProp(tracked.Payload, "kind"));
        Assert.Equal(2, GetProp(tracked.Payload, "recipientCount"));
    }

    // ----- Fixtures ------------------------------------------------------------------------------

    private static object? GetProp(object? payload, string name) =>
        payload?.GetType().GetProperty(name)?.GetValue(payload);

    private static (FakeReminderRepository Repo, FakeVenueManagerRepository Managers, Room Room, User Organizer, User Manager)
        NewScenario()
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Grace Test Venue",
            Slug = $"grace-{Guid.NewGuid():N}",
            Timezone = "America/New_York",
            CreatedAtUtc = FixedNow,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Venue = venue,
            Name = "Fellowship Hall",
            Slug = $"fellowship-hall-{Guid.NewGuid():N}",
            Status = RoomStatus.Published,
            CreatedAtUtc = FixedNow,
        };
        var organizer = NewUser("Jamie Organizer", "jamie@example.com");
        var manager = NewUser("Casey Manager", "casey@example.com");

        var managers = new FakeVenueManagerRepository();
        managers.Add(venue.Id, manager);

        return (new FakeReminderRepository(), managers, room, organizer, manager);
    }

    private static User NewUser(string displayName, string email) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = displayName,
        Email = email,
        CreatedAtUtc = FixedNow,
    };

    private static Booking NewBooking(
        Room room, User organizer, IReadOnlyList<TimeSpan> occurrenceOffsets, BookingType type = BookingType.OneOff)
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
            EndDate = today.AddDays(30),
            DaysOfWeek = type == BookingType.Recurring ? (Weekdays?)(1 << (int)FixedNow.DayOfWeek) : null,
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
            booking.Occurrences.Add(new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                BookingId = booking.Id,
                RoomId = room.Id,
                StartUtc = start,
                EndUtc = start + TimeSpan.FromHours(2),
                LocalDate = DateOnly.FromDateTime(start.UtcDateTime),
                Status = OccurrenceStatus.Scheduled,
            });
        }

        return booking;
    }

    private static BookingReminderService CreateService(
        FakeReminderRepository repo,
        FakeVenueManagerRepository managers,
        out FakeNotificationDispatcher notifications,
        out FakeAnalyticsSink analytics)
    {
        notifications = new FakeNotificationDispatcher();
        analytics = new FakeAnalyticsSink();
        return CreateService(repo, managers, notifications, analytics);
    }

    private static BookingReminderService CreateService(
        FakeReminderRepository repo,
        FakeVenueManagerRepository managers,
        FakeNotificationDispatcher notifications,
        FakeAnalyticsSink analytics) =>
        new(repo,
            managers,
            notifications,
            analytics,
            new FixedTimeProvider(FixedNow),
            Options.Create(new ReminderOptions()),
            NullLogger<BookingReminderService>.Instance);

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;

        public FixedTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;
    }

    /// <summary>
    /// In-memory stand-in for the ledger. <see cref="TryClaimAsync"/> enforces the same unique
    /// (occurrence, kind) key as <c>UQ_booking_reminders_OccurrenceId_Kind</c>.
    /// </summary>
    private sealed class FakeReminderRepository : IBookingReminderRepository
    {
        public List<Booking> Bookings { get; } = [];

        public List<(Guid OccurrenceId, BookingReminderKind Kind)> Claims { get; } = [];

        public Task<IReadOnlyList<Booking>> GetDueAsync(
            DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Booking>>(Bookings
                .Where(b => b.Status == BookingStatus.Confirmed
                    && b.Occurrences.Any(o => o.Status == OccurrenceStatus.Scheduled
                        && o.StartUtc > fromUtc && o.StartUtc <= toUtc))
                .ToList());

        public Task<bool> TryClaimAsync(
            Guid occurrenceId, BookingReminderKind kind, DateTimeOffset sentAtUtc, CancellationToken ct = default)
        {
            if (Claims.Contains((occurrenceId, kind)))
            {
                return Task.FromResult(false);
            }

            Claims.Add((occurrenceId, kind));
            return Task.FromResult(true);
        }

        public Task ReleaseClaimAsync(Guid occurrenceId, BookingReminderKind kind, CancellationToken ct = default)
        {
            Claims.Remove((occurrenceId, kind));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeVenueManagerRepository : IVenueManagerRepository
    {
        private readonly Dictionary<Guid, List<User>> _byVenue = [];

        public void Add(Guid venueId, User manager)
        {
            if (!_byVenue.TryGetValue(venueId, out var list))
            {
                _byVenue[venueId] = list = [];
            }

            list.Add(manager);
        }

        public void Clear() => _byVenue.Clear();

        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(_byVenue.TryGetValue(venueId, out var list) && list.Any(m => m.Id == userId));

        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Guid>>(
                _byVenue.Where(kv => kv.Value.Any(m => m.Id == userId)).Select(kv => kv.Key).ToList());

        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Venue>>([]);

        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<User>>(_byVenue.TryGetValue(venueId, out var list) ? list : []);
    }

    private sealed class FakeNotificationDispatcher : INotificationDispatcher
    {
        public List<(IReadOnlyList<NotificationRecipient> Recipients, NotificationType Type, object Payload, EmailContent? Email)>
            Calls { get; } = [];

        /// <summary>Fails the next dispatch, to prove a failed send hands its claim back.</summary>
        public bool ThrowOnce { get; set; }

        public Task NotifyAsync(
            IReadOnlyList<NotificationRecipient> recipients,
            NotificationType type,
            object payload,
            EmailContent? email,
            CancellationToken ct = default)
        {
            if (ThrowOnce)
            {
                ThrowOnce = false;
                throw new InvalidOperationException("Dispatch failed.");
            }

            Calls.Add((recipients, type, payload, email));
            return Task.CompletedTask;
        }
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
}
