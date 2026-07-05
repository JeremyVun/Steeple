namespace Steeple.Api.Tests.Services;
/// <summary>
/// Unit tests for <see cref="AvailabilityService"/>: manager scoping, the replace-all PUT with its
/// full validation matrix (weekday tokens, time formats, window counts/overlap, blackout limits and
/// past-date rejection computed against venue-local today), and the seven-day Sunday-first GET
/// shape. Ports are hand-rolled in-memory fakes (the no-mocking-library idiom used elsewhere).
/// </summary>
public class AvailabilityServiceTests
{
    // 08:00 America/New_York on 2026-07-05 -> venue-local today is 2026-07-05.
    private static readonly DateTimeOffset FixedNow = new(2026, 7, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly TodayLocal = new(2026, 7, 5);

    // ----- GET shape ---------------------------------------------------------------------------

    [Fact]
    public async Task GetRulesAsync_EmitsAllSevenDaysSundayFirstWithClosedDaysEmpty()
    {
        var (repo, managers, room, manager) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Tuesday, "18:00", "21:00"));
        var service = CreateService(repo, managers, out _);

        var result = await service.GetRulesAsync(manager.Id, room.Id);

        Assert.Null(result.Error);
        var days = result.Value!.Days;
        Assert.Equal(7, days.Count);
        Assert.Equal("sunday", days[0].DayOfWeek);
        Assert.Equal("saturday", days[6].DayOfWeek);
        Assert.Empty(days[0].Windows); // closed
        var tuesday = days.Single(d => d.DayOfWeek == "tuesday");
        Assert.Equal("18:00", tuesday.Windows.Single().StartTime);
        Assert.Equal("21:00", tuesday.Windows.Single().EndTime);
        Assert.Equal("America/New_York", result.Value.Timezone);
    }

    [Fact]
    public async Task GetRulesAsync_CallerIsNotManager_ReturnsNotFound()
    {
        var (repo, managers, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);

        var result = await service.GetRulesAsync(Guid.NewGuid(), room.Id);

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.NotFound, result.Error!.Code);
    }

    [Fact]
    public async Task GetRulesAsync_UnknownRoom_ReturnsNotFound()
    {
        var (repo, managers, _, manager) = NewScenario();
        var service = CreateService(repo, managers, out _);

        var result = await service.GetRulesAsync(manager.Id, Guid.NewGuid());

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.NotFound, result.Error!.Code);
    }

    // ----- Happy save --------------------------------------------------------------------------

    [Fact]
    public async Task SaveRulesAsync_MultiWindowSparseDays_PersistsAndReturnsSavedShape()
    {
        var (repo, managers, room, manager) = NewScenario();
        var service = CreateService(repo, managers, out var analytics);
        var request = new SaveAvailabilityRulesRequest(
            Days:
            [
                new DayOpenHoursDto("monday", [new OpenWindowDto("09:00", "12:00"), new OpenWindowDto("13:00", "17:00")]),
                new DayOpenHoursDto("wednesday", [new OpenWindowDto("18:00", "21:00")]),
            ],
            Blackouts: [new BlackoutDateDto(new DateOnly(2026, 12, 25), "Christmas")]);

        var result = await service.SaveRulesAsync(manager.Id, room.Id, request);

        Assert.Null(result.Error);
        Assert.Equal(3, repo.OpenHours.Count);
        var monday = result.Value!.Days.Single(d => d.DayOfWeek == "monday");
        Assert.Equal(2, monday.Windows.Count);
        Assert.Equal("09:00", monday.Windows[0].StartTime);
        Assert.Single(result.Value.Blackouts);
        Assert.Equal("Christmas", result.Value.Blackouts[0].Reason);
        var evt = Assert.Single(analytics.Events, e => e.EventType == "open_hours_updated");
        Assert.NotNull(evt.Payload);
    }

    [Fact]
    public async Task SaveRulesAsync_AdjacentTouchingWindows_AreAllowed()
    {
        var (repo, managers, room, manager) = NewScenario();
        var service = CreateService(repo, managers, out _);
        var request = Days(new DayOpenHoursDto("monday",
            [new OpenWindowDto("09:00", "12:00"), new OpenWindowDto("12:00", "15:00")]));

        var result = await service.SaveRulesAsync(manager.Id, room.Id, request);

        Assert.Null(result.Error);
        Assert.Equal(2, repo.OpenHours.Count);
    }

    [Fact]
    public async Task SaveRulesAsync_ReplacesExistingRules()
    {
        var (repo, managers, room, manager) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Friday, "08:00", "22:00"));
        repo.Blackouts.Add(Blackout(room.Id, new DateOnly(2026, 8, 1)));
        var service = CreateService(repo, managers, out _);
        var request = Days(new DayOpenHoursDto("monday", [new OpenWindowDto("10:00", "11:00")]));

        var result = await service.SaveRulesAsync(manager.Id, room.Id, request);

        Assert.Null(result.Error);
        var stored = Assert.Single(repo.OpenHours);
        Assert.Equal(DayOfWeek.Monday, stored.DayOfWeek);
        Assert.Empty(repo.Blackouts); // replace-all cleared the old blackout
    }

    [Fact]
    public async Task SaveRulesAsync_EmptyPayload_ClearsAllRules()
    {
        var (repo, managers, room, manager) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Friday, "08:00", "22:00"));
        var service = CreateService(repo, managers, out _);

        var result = await service.SaveRulesAsync(manager.Id, room.Id, new SaveAvailabilityRulesRequest(null, null));

        Assert.Null(result.Error);
        Assert.Empty(repo.OpenHours);
    }

    [Fact]
    public async Task SaveRulesAsync_CallerIsNotManager_ReturnsNotFoundAndPersistsNothing()
    {
        var (repo, managers, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);
        var request = Days(new DayOpenHoursDto("monday", [new OpenWindowDto("10:00", "11:00")]));

        var result = await service.SaveRulesAsync(Guid.NewGuid(), room.Id, request);

        Assert.Equal(ManageErrorCodes.NotFound, result.Error!.Code);
        Assert.Empty(repo.OpenHours);
    }

    // ----- Validation matrix -------------------------------------------------------------------

    [Fact]
    public async Task SaveRulesAsync_UnknownWeekday_ReturnsInvalidAvailability()
    {
        await AssertInvalid(Days(new DayOpenHoursDto("funday", [new OpenWindowDto("09:00", "10:00")])));
    }

    [Fact]
    public async Task SaveRulesAsync_NumericWeekdayToken_ReturnsInvalidAvailability()
    {
        // "0" would parse as Sunday via Enum numeric parsing — must be rejected as a token.
        await AssertInvalid(Days(new DayOpenHoursDto("0", [new OpenWindowDto("09:00", "10:00")])));
    }

    [Fact]
    public async Task SaveRulesAsync_DuplicateWeekday_ReturnsInvalidAvailability()
    {
        await AssertInvalid(new SaveAvailabilityRulesRequest(
            Days:
            [
                new DayOpenHoursDto("monday", [new OpenWindowDto("09:00", "10:00")]),
                new DayOpenHoursDto("monday", [new OpenWindowDto("11:00", "12:00")]),
            ],
            Blackouts: null));
    }

    [Theory]
    [InlineData("9:00", "10:00")]
    [InlineData("09:00", "25:00")]
    [InlineData("0900", "1000")]
    [InlineData("", "10:00")]
    public async Task SaveRulesAsync_BadTimeFormat_ReturnsInvalidAvailability(string start, string end)
    {
        await AssertInvalid(Days(new DayOpenHoursDto("monday", [new OpenWindowDto(start, end)])));
    }

    [Theory]
    [InlineData("10:00", "10:00")] // equal
    [InlineData("11:00", "10:00")] // end before start
    public async Task SaveRulesAsync_EndNotAfterStart_ReturnsInvalidAvailability(string start, string end)
    {
        await AssertInvalid(Days(new DayOpenHoursDto("monday", [new OpenWindowDto(start, end)])));
    }

    [Fact]
    public async Task SaveRulesAsync_MoreThanSixWindowsInADay_ReturnsInvalidAvailability()
    {
        var windows = Enumerable.Range(0, 7)
            .Select(i => new OpenWindowDto($"{i:00}:00", $"{i:00}:30"))
            .ToList();
        await AssertInvalid(Days(new DayOpenHoursDto("monday", windows)));
    }

    [Fact]
    public async Task SaveRulesAsync_OverlappingWindows_ReturnsInvalidAvailability()
    {
        await AssertInvalid(Days(new DayOpenHoursDto("monday",
            [new OpenWindowDto("09:00", "12:00"), new OpenWindowDto("11:00", "13:00")])));
    }

    [Fact]
    public async Task SaveRulesAsync_MoreThan200Blackouts_ReturnsInvalidAvailability()
    {
        var blackouts = Enumerable.Range(0, 201)
            .Select(i => new BlackoutDateDto(TodayLocal.AddDays(i), null))
            .ToList();
        await AssertInvalid(new SaveAvailabilityRulesRequest(null, blackouts));
    }

    [Fact]
    public async Task SaveRulesAsync_PastBlackout_ReturnsInvalidAvailability()
    {
        await AssertInvalid(new SaveAvailabilityRulesRequest(
            null, [new BlackoutDateDto(TodayLocal.AddDays(-1), null)]));
    }

    [Fact]
    public async Task SaveRulesAsync_TodayBlackout_IsAllowed()
    {
        var (repo, managers, room, manager) = NewScenario();
        var service = CreateService(repo, managers, out _);

        var result = await service.SaveRulesAsync(manager.Id, room.Id,
            new SaveAvailabilityRulesRequest(null, [new BlackoutDateDto(TodayLocal, null)]));

        Assert.Null(result.Error);
        Assert.Single(repo.Blackouts);
    }

    [Fact]
    public async Task SaveRulesAsync_ReasonOver200Chars_ReturnsInvalidAvailability()
    {
        await AssertInvalid(new SaveAvailabilityRulesRequest(
            null, [new BlackoutDateDto(TodayLocal.AddDays(3), new string('x', 201))]));
    }

    // ----- Publish gate helper -----------------------------------------------------------------

    [Fact]
    public async Task HasOpenHoursAsync_ReflectsRepository()
    {
        var (repo, managers, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);
        Assert.False(await service.HasOpenHoursAsync(room.Id));

        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Monday, "09:00", "10:00"));
        Assert.True(await service.HasOpenHoursAsync(room.Id));
    }

    [Fact]
    public async Task GetPublicOpenHoursAsync_NoRows_ReturnsNull()
    {
        var (repo, managers, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);

        Assert.Null(await service.GetPublicOpenHoursAsync(room.Id));
    }

    [Fact]
    public async Task GetPublicOpenHoursAsync_WithRows_ReturnsSevenDayShape()
    {
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "10:00"));
        var service = CreateService(repo, managers, out _);

        var days = await service.GetPublicOpenHoursAsync(room.Id);

        Assert.NotNull(days);
        Assert.Equal(7, days.Count);
        Assert.Single(days[0].Windows); // sunday
    }

    // ----- Public availability feed ------------------------------------------------------------

    [Theory]
    [InlineData(-1, 5)]   // from before venue-local today
    [InlineData(5, 2)]    // to before from
    [InlineData(0, 93)]   // span over 92 days
    public async Task GetPublicAvailabilityAsync_OutOfRange_ReturnsInvalidRange(int fromOffset, int toOffset)
    {
        var (repo, managers, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);

        var result = await service.GetPublicAvailabilityAsync(
            room.Id, TodayLocal.AddDays(fromOffset), TodayLocal.AddDays(toOffset));

        Assert.Null(result.Value);
        Assert.False(result.IsNotFound);
        Assert.Equal(AvailabilityErrorCodes.InvalidRange, result.ErrorCode);
    }

    [Fact]
    public async Task GetPublicAvailabilityAsync_SpanExactly92Days_IsValid()
    {
        var (repo, managers, room, _) = NewScenario();
        var service = CreateService(repo, managers, out _);

        var result = await service.GetPublicAvailabilityAsync(room.Id, TodayLocal, TodayLocal.AddDays(92));

        Assert.Null(result.ErrorCode);
        Assert.Equal(93, result.Value!.Days.Count);
    }

    [Fact]
    public async Task GetPublicAvailabilityAsync_DraftRoom_ReturnsNotFound()
    {
        var (repo, managers, room, _) = NewScenario();
        room.Status = RoomStatus.Draft;
        var service = CreateService(repo, managers, out _);

        var result = await service.GetPublicAvailabilityAsync(room.Id, TodayLocal, TodayLocal.AddDays(5));

        Assert.True(result.IsNotFound);
        Assert.Null(result.ErrorCode);
    }

    [Fact]
    public async Task GetPublicAvailabilityAsync_BlackoutDay_IsBlackoutWithNoFreeWindows()
    {
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "17:00")); // TodayLocal is a Sunday
        repo.Blackouts.Add(Blackout(room.Id, TodayLocal));
        var service = CreateService(repo, managers, out _);

        var result = await service.GetPublicAvailabilityAsync(room.Id, TodayLocal, TodayLocal);

        var day = Assert.Single(result.Value!.Days);
        Assert.True(day.IsBlackout);
        Assert.Empty(day.FreeWindows);
    }

    [Fact]
    public async Task GetPublicAvailabilityAsync_ConfirmedBookingSubtracted_PendingAndCancelledDoNot()
    {
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "17:00"));

        // A confirmed, scheduled occurrence 10:00–12:00 local reduces the free window.
        repo.Occurrences.Add(Occurrence(room.Id, TodayLocal, "10:00", "12:00"));
        // A cancelled booking's occurrence 13:00–14:00 must NOT reduce it (pending demand never leaks).
        repo.Occurrences.Add(Occurrence(room.Id, TodayLocal, "13:00", "14:00", bookingStatus: BookingStatus.Cancelled));
        // A cancelled *occurrence* of a confirmed booking must NOT reduce it either.
        repo.Occurrences.Add(Occurrence(room.Id, TodayLocal, "15:00", "16:00", occStatus: OccurrenceStatus.Cancelled));

        var service = CreateService(repo, managers, out _);

        var result = await service.GetPublicAvailabilityAsync(room.Id, TodayLocal, TodayLocal);

        var day = Assert.Single(result.Value!.Days);
        Assert.False(day.IsBlackout);
        Assert.Equal(2, day.FreeWindows.Count);
        Assert.Equal(("09:00", "10:00"), (day.FreeWindows[0].StartTime, day.FreeWindows[0].EndTime));
        Assert.Equal(("12:00", "17:00"), (day.FreeWindows[1].StartTime, day.FreeWindows[1].EndTime));
    }

    [Fact]
    public async Task GetPublicAvailabilityAsync_DstFallBackDate_ConvertsBusyPerOccurrence()
    {
        // 2026-11-01 is the America/New_York fall-back (clocks 02:00→01:00). A confirmed 10:00–12:00
        // local booking must subtract exactly 10:00–12:00 wall-clock on that date, proving the busy
        // interval is derived per-occurrence in venue-local time (never fixed UTC arithmetic).
        var fallBack = new DateOnly(2026, 11, 1); // a Sunday
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "17:00"));
        repo.Occurrences.Add(Occurrence(room.Id, fallBack, "10:00", "12:00"));
        var service = CreateService(repo, managers, out _);

        var result = await service.GetPublicAvailabilityAsync(room.Id, fallBack, fallBack);

        var day = Assert.Single(result.Value!.Days);
        Assert.Equal(2, day.FreeWindows.Count);
        Assert.Equal(("09:00", "10:00"), (day.FreeWindows[0].StartTime, day.FreeWindows[0].EndTime));
        Assert.Equal(("12:00", "17:00"), (day.FreeWindows[1].StartTime, day.FreeWindows[1].EndTime));
    }

    // ----- Schedule check ----------------------------------------------------------------------

    [Fact]
    public async Task CheckScheduleAsync_NoRulesRoom_IsAvailableWithoutClassification()
    {
        var (repo, managers, room, _) = NewScenario(); // no open hours, no blackouts
        var service = CreateService(repo, managers, out _);

        var result = await service.CheckScheduleAsync(
            room.Id, NewSchedule("oneOff", TodayLocal.AddDays(2), "10:00", "12:00"));

        Assert.True(result.Value!.Available);
        Assert.Equal(1, result.Value.TotalOccurrences);
        Assert.Empty(result.Value.Conflicts);
    }

    [Fact]
    public async Task CheckScheduleAsync_InvalidSchedule_ReturnsInvalidApplication()
    {
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "17:00"));
        var service = CreateService(repo, managers, out _);

        // End before start — same rule apply enforces.
        var result = await service.CheckScheduleAsync(
            room.Id, NewSchedule("oneOff", TodayLocal.AddDays(2), "12:00", "10:00"));

        Assert.Null(result.Value);
        Assert.Equal(AvailabilityErrorCodes.InvalidApplication, result.ErrorCode);
    }

    [Fact]
    public async Task CheckScheduleAsync_MixedConflicts_ClassifiesEachOccurrence()
    {
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "12:00"));
        // A confirmed booking on the first Sunday 10:00–11:00 → that occurrence is "booked".
        var firstSunday = TodayLocal; // 2026-07-05
        repo.Occurrences.Add(Occurrence(room.Id, firstSunday, "10:00", "11:00"));
        var service = CreateService(repo, managers, out _);

        // Weekly Sundays 10:00–11:00 for three weeks: first is booked, others fit open hours (available).
        var result = await service.CheckScheduleAsync(
            room.Id,
            new ScheduleDto("recurringWeekly", firstSunday, firstSunday.AddDays(14), ["sunday"], "10:00", "11:00"));

        Assert.Equal(3, result.Value!.TotalOccurrences);
        Assert.False(result.Value.Available);
        var conflict = Assert.Single(result.Value.Conflicts);
        Assert.Equal(firstSunday, conflict.Date);
        Assert.Equal("booked", conflict.Reason);
    }

    [Fact]
    public async Task CheckScheduleAsync_OutsideOpenHours_ClassifiesOutsideOpenHours()
    {
        var (repo, managers, room, _) = NewScenario();
        repo.OpenHours.Add(Hours(room.Id, DayOfWeek.Sunday, "09:00", "11:00"));
        var service = CreateService(repo, managers, out _);

        // 10:00–12:00 doesn't fit inside the single 09:00–11:00 window.
        var result = await service.CheckScheduleAsync(
            room.Id, NewSchedule("oneOff", TodayLocal, "10:00", "12:00"));

        Assert.False(result.Value!.Available);
        Assert.Equal("outsideOpenHours", Assert.Single(result.Value.Conflicts).Reason);
    }

    // ----- Helpers -----------------------------------------------------------------------------

    private static ScheduleDto NewSchedule(string frequency, DateOnly startDate, string startTime, string endTime) =>
        new(frequency, startDate, frequency == "recurringWeekly" ? startDate : null, null, startTime, endTime);

    private BookingOccurrence Occurrence(
        Guid roomId,
        DateOnly localDate,
        string localStart,
        string localEnd,
        OccurrenceStatus occStatus = OccurrenceStatus.Scheduled,
        BookingStatus bookingStatus = BookingStatus.Confirmed)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        DateTimeOffset ToUtc(string time) =>
            new(TimeZoneInfo.ConvertTimeToUtc(localDate.ToDateTime(TimeOnly.Parse(time)), tz), TimeSpan.Zero);

        var booking = new Booking { Id = Guid.NewGuid(), RoomId = roomId, Status = bookingStatus };
        return new BookingOccurrence
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            RoomId = roomId,
            StartUtc = ToUtc(localStart),
            EndUtc = ToUtc(localEnd),
            LocalDate = localDate,
            Status = occStatus,
            Booking = booking,
        };
    }

    private static async Task AssertInvalid(SaveAvailabilityRulesRequest request)
    {
        var (repo, managers, room, manager) = NewScenario();
        var service = CreateService(repo, managers, out _);

        var result = await service.SaveRulesAsync(manager.Id, room.Id, request);

        Assert.Null(result.Value);
        Assert.Equal(ManageErrorCodes.InvalidAvailability, result.Error!.Code);
        Assert.Empty(repo.OpenHours);
        Assert.Empty(repo.Blackouts);
    }

    private static SaveAvailabilityRulesRequest Days(params DayOpenHoursDto[] days) => new(days, null);

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

    private static (FakeAvailabilityRepository Repo, FakeVenueManagerRepository Managers, Room Room, User Manager) NewScenario()
    {
        var venue = new Venue
        {
            Id = Guid.NewGuid(),
            Name = "Grace",
            Slug = $"grace-{Guid.NewGuid():N}",
            Timezone = "America/New_York",
            Latitude = 38.9,
            Longitude = -77.2,
        };
        var room = new Room
        {
            Id = Guid.NewGuid(),
            VenueId = venue.Id,
            Venue = venue,
            Name = "Hall",
            Slug = "hall",
            Capacity = 40,
            Status = RoomStatus.Published,
        };
        var manager = new User { Id = Guid.NewGuid(), DisplayName = "Casey", Email = "c@e.com", CreatedAtUtc = FixedNow };

        var repo = new FakeAvailabilityRepository(room);
        var managers = new FakeVenueManagerRepository();
        managers.AddManager(venue.Id, manager.Id);
        return (repo, managers, room, manager);
    }

    private static AvailabilityService CreateService(
        FakeAvailabilityRepository repo, FakeVenueManagerRepository managers, out FakeAnalyticsSink analytics)
    {
        analytics = new FakeAnalyticsSink();
        return new AvailabilityService(repo, managers, analytics, new FixedTimeProvider(FixedNow));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
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

    private sealed class FakeVenueManagerRepository : IVenueManagerRepository
    {
        private readonly List<(Guid VenueId, Guid UserId)> _managers = [];

        public void AddManager(Guid venueId, Guid userId) => _managers.Add((venueId, userId));

        public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
            Task.FromResult(_managers.Any(m => m.VenueId == venueId && m.UserId == userId));

        public Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Guid>>([]);

        public Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Venue>>([]);

        public Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<User>>([]);
    }

    private sealed class FakeAvailabilityRepository : IAvailabilityRepository
    {
        private readonly Room _room;

        public FakeAvailabilityRepository(Room room) => _room = room;

        public List<RoomOpenHours> OpenHours { get; } = [];

        public List<RoomBlackoutDate> Blackouts { get; } = [];

        public List<BookingOccurrence> Occurrences { get; } = [];

        public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) =>
            Task.FromResult<Room?>(roomId == _room.Id ? _room : null);

        public Task<IReadOnlyList<RoomOpenHours>> GetOpenHoursAsync(Guid roomId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomOpenHours>>(
                OpenHours.Where(h => h.RoomId == roomId).OrderBy(h => h.DayOfWeek).ThenBy(h => h.StartTime).ToList());

        public Task<IReadOnlyList<RoomBlackoutDate>> GetBlackoutsAsync(Guid roomId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomBlackoutDate>>(
                Blackouts.Where(b => b.RoomId == roomId).OrderBy(b => b.Date).ToList());

        public Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default) =>
            Task.FromResult(OpenHours.Any(h => h.RoomId == roomId));

        public Task<IReadOnlyList<BookingOccurrence>> GetConfirmedOccurrencesAsync(
            Guid roomId, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<BookingOccurrence>>(
                Occurrences
                    .Where(o => o.RoomId == roomId
                        && o.Status == OccurrenceStatus.Scheduled
                        && o.Booking!.Status == BookingStatus.Confirmed
                        && o.StartUtc < toUtc
                        && o.EndUtc > fromUtc)
                    .ToList());

        public Task<IReadOnlyList<RoomOpenHours>> GetOpenHoursForRoomsAsync(
            IReadOnlyCollection<Guid> roomIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomOpenHours>>(OpenHours.Where(h => roomIds.Contains(h.RoomId)).ToList());

        public Task<IReadOnlyList<RoomBlackoutDate>> GetBlackoutsForRoomsAsync(
            IReadOnlyCollection<Guid> roomIds, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomBlackoutDate>>(Blackouts.Where(b => roomIds.Contains(b.RoomId)).ToList());

        public Task<IReadOnlyList<BookingOccurrence>> GetConfirmedOccurrencesForRoomsAsync(
            IReadOnlyCollection<Guid> roomIds, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<BookingOccurrence>>(
                Occurrences
                    .Where(o => roomIds.Contains(o.RoomId)
                        && o.Status == OccurrenceStatus.Scheduled
                        && o.Booking!.Status == BookingStatus.Confirmed
                        && o.StartUtc < toUtc
                        && o.EndUtc > fromUtc)
                    .ToList());

        public Task ReplaceRulesAsync(
            Guid roomId,
            IReadOnlyList<RoomOpenHours> openHours,
            IReadOnlyList<RoomBlackoutDate> blackouts,
            CancellationToken ct = default)
        {
            OpenHours.RemoveAll(h => h.RoomId == roomId);
            Blackouts.RemoveAll(b => b.RoomId == roomId);
            OpenHours.AddRange(openHours);
            Blackouts.AddRange(blackouts);
            return Task.CompletedTask;
        }
    }
}
