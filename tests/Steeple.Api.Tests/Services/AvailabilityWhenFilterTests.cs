namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for the time-first ("When") search refinement (<see cref="AvailabilityService.FilterByWhenAsync"/>,
/// CONTRACTS §3): the real free-window match over open hours − blackouts − <b>confirmed</b> bookings.
/// Covers band-vs-open-hours containment, explicit-range freeness, duration fit, the recurring
/// 28-day "every matching date" rule, and blackout exclusion. In-memory fakes, no clock/DB.
/// </summary>
public class AvailabilityWhenFilterTests
{
    // 08:00 America/New_York on Monday 2026-07-06 -> venue-local today is Monday 2026-07-06.
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 6, 12, 0, 0, TimeSpan.Zero);
    private static readonly TimeZoneInfo Tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
    private static readonly DateOnly Monday = new(2026, 7, 6);
    private const string TzId = "America/New_York";

    // ----- one-off, explicit range -------------------------------------------------------------

    [Fact]
    public async Task Explicit_RangeFree_Matches_AndCarriesTheContainingWindow()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "22:00"));

        var matched = await Refine(repo, [room], OneOff(Monday, WhenRangeKind.Explicit, "18:00", "20:00"));

        var window = Assert.Contains(room, matched);
        Assert.Equal(Monday, window.Date);
        Assert.Equal(("09:00", "22:00"), (window.StartTime, window.EndTime));
    }

    [Fact]
    public async Task Explicit_RangeOverlapsAConfirmedBooking_IsExcluded()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "22:00"));
        repo.AddConfirmed(room, Monday, "19:00", "20:00"); // clashes with the requested 18:00–20:00

        var matched = await Refine(repo, [room], OneOff(Monday, WhenRangeKind.Explicit, "18:00", "20:00"));

        Assert.DoesNotContain(room, matched);
    }

    // ----- one-off, band -----------------------------------------------------------------------

    [Fact]
    public async Task Band_OpenWindowInsideBandThatFitsDuration_Matches()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "11:00")); // 120 min inside morning band

        var matched = await Refine(repo, [room], Band(Monday, "morning", durationMinutes: 120));

        Assert.Contains(room, matched);
    }

    [Fact]
    public async Task Band_OpenWindowShorterThanDuration_IsExcluded()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "10:30")); // only 90 min inside the band

        var matched = await Refine(repo, [room], Band(Monday, "morning", durationMinutes: 120));

        Assert.DoesNotContain(room, matched);
    }

    [Fact]
    public async Task Band_FreeTimeFitsDurationButLiesOutsideTheBand_IsExcluded()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        // Plenty free in the afternoon, but the morning band (08:00–12:00) has no qualifying window.
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "13:00", "17:00"));

        var matched = await Refine(repo, [room], Band(Monday, "morning", durationMinutes: 120));

        Assert.DoesNotContain(room, matched);
    }

    // ----- one-off, any-window + duration ------------------------------------------------------

    [Fact]
    public async Task AnyWindow_OnlyA90MinWindowWithDefault120Duration_IsExcluded()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "10:30")); // 90 min < default 120

        var matched = await Refine(repo, [room], DateOnly_(Monday, durationMinutes: 120));

        Assert.DoesNotContain(room, matched);
    }

    [Fact]
    public async Task AnyWindow_WindowLongEnough_Matches()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "12:00"));

        var matched = await Refine(repo, [room], DateOnly_(Monday, durationMinutes: 120));

        Assert.Contains(room, matched);
    }

    // ----- blackout ----------------------------------------------------------------------------

    [Fact]
    public async Task Blackout_OnTheRequestedDate_IsExcluded()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Monday, "09:00", "17:00"));
        repo.Blackouts.Add(Blackout(room, Monday));

        var matched = await Refine(repo, [room], DateOnly_(Monday, durationMinutes: 120));

        Assert.DoesNotContain(room, matched);
    }

    // ----- recurring ---------------------------------------------------------------------------

    [Fact]
    public async Task Recurring_TueThu_AllDatesFree_Matches_WithNoDateOnWindow()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Tuesday, "09:00", "11:00"));
        repo.OpenHours.Add(Hours(room, DayOfWeek.Thursday, "09:00", "11:00"));

        var matched = await Refine(repo, [room], Recurring(Weekdays.Tuesday | Weekdays.Thursday, durationMinutes: 120));

        var window = Assert.Contains(room, matched);
        Assert.Null(window.Date); // recurring omits the date
        Assert.Equal(("09:00", "11:00"), (window.StartTime, window.EndTime));
    }

    [Fact]
    public async Task Recurring_TueThu_MidHorizonThursdayBookingConsumesTheSlot_IsExcluded()
    {
        var room = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(room, DayOfWeek.Tuesday, "09:00", "11:00"));
        repo.OpenHours.Add(Hours(room, DayOfWeek.Thursday, "09:00", "11:00"));
        // Thursday 2026-07-09 falls in the 28-day horizon; a confirmed booking eats the only slot.
        repo.AddConfirmed(room, new DateOnly(2026, 7, 9), "09:00", "11:00");

        var matched = await Refine(repo, [room], Recurring(Weekdays.Tuesday | Weekdays.Thursday, durationMinutes: 120));

        Assert.DoesNotContain(room, matched);
    }

    [Fact]
    public async Task FilterByWhen_OnlyMatchingRoomsSurvive_TheRestAreDropped()
    {
        var good = Guid.NewGuid();
        var bad = Guid.NewGuid();
        var repo = new FakeRepo();
        repo.OpenHours.Add(Hours(good, DayOfWeek.Monday, "09:00", "12:00"));
        repo.OpenHours.Add(Hours(bad, DayOfWeek.Monday, "09:00", "10:00")); // too short for 120

        var matched = await Refine(repo, [good, bad], DateOnly_(Monday, durationMinutes: 120));

        Assert.Contains(good, matched);
        Assert.DoesNotContain(bad, matched);
    }

    // ----- helpers -----------------------------------------------------------------------------

    private static async Task<IReadOnlyDictionary<Guid, MatchedWindowDto>> Refine(
        FakeRepo repo, Guid[] rooms, AvailabilityFilter filter)
    {
        var service = new AvailabilityService(repo, new NullVenueManagers(), new NullAnalytics(), new FixedClock(FixedNow));
        return await service.FilterByWhenAsync(rooms.Select(r => (r, TzId)).ToList(), filter);
    }

    private static AvailabilityFilter OneOff(DateOnly date, WhenRangeKind kind, string start, string end) =>
        new(false, date, Weekdays.None, kind, TimeOnly.Parse(start), TimeOnly.Parse(end), 120, null);

    private static AvailabilityFilter Band(DateOnly date, string band, int durationMinutes)
    {
        var (s, e) = band switch
        {
            "morning" => ("08:00", "12:00"),
            "afternoon" => ("12:00", "17:00"),
            _ => ("17:00", "22:00"),
        };
        return new(false, date, Weekdays.None, WhenRangeKind.Band, TimeOnly.Parse(s), TimeOnly.Parse(e), durationMinutes, band);
    }

    private static AvailabilityFilter DateOnly_(DateOnly date, int durationMinutes) =>
        new(false, date, Weekdays.None, WhenRangeKind.AnyWindow, default, default, durationMinutes, null);

    private static AvailabilityFilter Recurring(Weekdays days, int durationMinutes) =>
        new(true, null, days, WhenRangeKind.AnyWindow, default, default, durationMinutes, null);

    private static RoomOpenHours Hours(Guid roomId, DayOfWeek day, string start, string end) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId,
        DayOfWeek = day,
        StartTime = TimeOnly.Parse(start),
        EndTime = TimeOnly.Parse(end),
        CreatedAtUtc = FixedNow,
    };

    private static RoomBlackoutDate Blackout(Guid roomId, DateOnly date) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = roomId,
        Date = date,
        CreatedAtUtc = FixedNow,
    };

    private sealed class FakeRepo : IAvailabilityRepository
    {
        public List<RoomOpenHours> OpenHours { get; } = [];

        public List<RoomBlackoutDate> Blackouts { get; } = [];

        public List<BookingOccurrence> Occurrences { get; } = [];

        public void AddConfirmed(Guid roomId, DateOnly date, string start, string end)
        {
            DateTimeOffset ToUtc(string t) =>
                new(TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.Parse(t)), Tz), TimeSpan.Zero);
            Occurrences.Add(new BookingOccurrence
            {
                Id = Guid.NewGuid(),
                RoomId = roomId,
                StartUtc = ToUtc(start),
                EndUtc = ToUtc(end),
                LocalDate = date,
                Status = OccurrenceStatus.Scheduled,
                Booking = new Booking { Id = Guid.NewGuid(), RoomId = roomId, Status = BookingStatus.Confirmed },
            });
        }

        public Task<IReadOnlyList<RoomOpenHours>> GetOpenHoursForRoomsAsync(IReadOnlyCollection<Guid> roomIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomOpenHours>>(OpenHours.Where(h => roomIds.Contains(h.RoomId)).ToList());

        public Task<IReadOnlyList<RoomBlackoutDate>> GetBlackoutsForRoomsAsync(IReadOnlyCollection<Guid> roomIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomBlackoutDate>>(Blackouts.Where(b => roomIds.Contains(b.RoomId)).ToList());

        public Task<IReadOnlyList<BookingOccurrence>> GetConfirmedOccurrencesForRoomsAsync(
            IReadOnlyCollection<Guid> roomIds, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<BookingOccurrence>>(
                Occurrences.Where(o => roomIds.Contains(o.RoomId)
                    && o.Status == OccurrenceStatus.Scheduled
                    && o.Booking!.Status == BookingStatus.Confirmed
                    && o.StartUtc < toUtc && o.EndUtc > fromUtc).ToList());

        // Unused by FilterByWhenAsync.
        public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) => Task.FromResult<Room?>(null);
        public Task<IReadOnlyList<RoomOpenHours>> GetOpenHoursAsync(Guid roomId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<RoomBlackoutDate>> GetBlackoutsAsync(Guid roomId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<BookingOccurrence>> GetConfirmedOccurrencesAsync(Guid roomId, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) => throw new NotSupportedException();
        public Task ReplaceRulesAsync(Guid roomId, IReadOnlyList<RoomOpenHours> openHours, IReadOnlyList<RoomBlackoutDate> blackouts, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed class NullVenueManagers : IVenueManagerRepository
    {
        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) => Task.FromResult(false);
        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Guid>>([]);
        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Venue>>([]);
        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<User>>([]);
    }

    private sealed class NullAnalytics : IAnalyticsSink
    {
        public Task TrackAsync(string eventType, object? payload = null, string? sessionId = null, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
