using System.Globalization;
using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Services.Availability;
/// <summary>
/// Default <see cref="IAvailabilityService"/>. Manager-scoped rule reads/writes over the
/// Availability repository, with all validation here (the SQL table has no range type). Save is
/// replace-all in one transaction; past-blackout rejection is computed against the venue-local
/// "today" from the venue's IANA timezone.
/// </summary>
public sealed class AvailabilityService : IAvailabilityService
{
    /// <summary>Max open windows per weekday (CONTRACTS §6a).</summary>
    private const int MaxWindowsPerDay = 6;

    /// <summary>Max blackout dates per room (CONTRACTS §6a).</summary>
    private const int MaxBlackouts = 200;

    /// <summary>Blackout reason column width (mirrors 009-availability.sql varchar(200)).</summary>
    private const int MaxReasonLength = 200;

    private readonly IAvailabilityRepository _repository;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its ports.</summary>
    public AvailabilityService(
        IAvailabilityRepository repository,
        IVenueManagerRepository venueManagers,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _repository = repository;
        _venueManagers = venueManagers;
        _analytics = analytics;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<ManageResult<RoomAvailabilityRulesDto>> GetRulesAsync(Guid callerId, Guid roomId, CancellationToken ct = default)
    {
        var (room, error) = await LoadScopedRoomAsync(callerId, roomId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<RoomAvailabilityRulesDto>(null, error);
        }

        var hours = await _repository.GetOpenHoursAsync(roomId, ct).ConfigureAwait(false);
        var blackouts = await _repository.GetBlackoutsAsync(roomId, ct).ConfigureAwait(false);

        return ManageResult<RoomAvailabilityRulesDto>.Ok(BuildRulesDto(roomId, room!.Venue!.Timezone, hours, blackouts));
    }

    /// <inheritdoc />
    public async Task<ManageResult<RoomAvailabilityRulesDto>> SaveRulesAsync(
        Guid callerId, Guid roomId, SaveAvailabilityRulesRequest request, CancellationToken ct = default)
    {
        var (room, error) = await LoadScopedRoomAsync(callerId, roomId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<RoomAvailabilityRulesDto>(null, error);
        }

        var now = _clock.GetUtcNow();
        var todayLocal = VenueLocalToday(room!.Venue!.Timezone, now);

        var (hours, blackouts, invalid) = BuildAndValidate(roomId, request, todayLocal, now);
        if (invalid is not null)
        {
            return ManageResult<RoomAvailabilityRulesDto>.Fail(ManageErrorCodes.InvalidAvailability, invalid);
        }

        await _repository.ReplaceRulesAsync(roomId, hours!, blackouts!, ct).ConfigureAwait(false);

        await TrackSafelyAsync(
            "open_hours_updated",
            new { roomId, windowCount = hours!.Count, blackoutCount = blackouts!.Count }).ConfigureAwait(false);

        return ManageResult<RoomAvailabilityRulesDto>.Ok(BuildRulesDto(roomId, room.Venue!.Timezone, hours, blackouts));
    }

    /// <inheritdoc />
    public Task<bool> HasOpenHoursAsync(Guid roomId, CancellationToken ct = default) =>
        _repository.HasOpenHoursAsync(roomId, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<DayOpenHoursDto>?> GetPublicOpenHoursAsync(Guid roomId, CancellationToken ct = default)
    {
        var hours = await _repository.GetOpenHoursAsync(roomId, ct).ConfigureAwait(false);
        return hours.Count == 0 ? null : BuildDays(hours);
    }

    /// <summary>Max days a single calendar-feed request may span (CONTRACTS §6).</summary>
    private const int MaxRangeDays = 92;

    /// <summary>Recurring terms are always bounded and never absurdly long (mirrors ApplicationService).</summary>
    private const int MaxTermDays = 366;

    /// <inheritdoc />
    public async Task<AvailabilityReadResult<RoomAvailabilityDto>> GetPublicAvailabilityAsync(
        Guid roomId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room?.Venue is null || room.Status != RoomStatus.Published)
        {
            return AvailabilityReadResult<RoomAvailabilityDto>.NotFound();
        }

        var timezone = room.Venue.Timezone;
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        var todayLocal = VenueLocalToday(timezone, _clock.GetUtcNow());

        if (from < todayLocal || to < from || to.DayNumber - from.DayNumber > MaxRangeDays)
        {
            return AvailabilityReadResult<RoomAvailabilityDto>.Fail(
                AvailabilityErrorCodes.InvalidRange,
                $"'from' must be today or later (venue-local), 'to' on or after 'from', and the range at most {MaxRangeDays} days.");
        }

        var hours = await _repository.GetOpenHoursAsync(roomId, ct).ConfigureAwait(false);
        var blackouts = await _repository.GetBlackoutsAsync(roomId, ct).ConfigureAwait(false);
        var blackoutDates = blackouts.Select(b => b.Date).ToHashSet();
        var openByWeekday = OpenHoursByWeekday(hours);

        // Confirmed busy time across the whole window, grouped to venue-local date (per-occurrence
        // conversion — DST-safe, occurrences never cross midnight).
        var fromUtc = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(from.ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);
        var toUtc = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);
        var occurrences = await _repository.GetConfirmedOccurrencesAsync(roomId, fromUtc, toUtc, ct).ConfigureAwait(false);
        var busyByDate = BusyByDate(occurrences, tz);

        var days = new List<AvailabilityDayDto>(to.DayNumber - from.DayNumber + 1);
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            if (blackoutDates.Contains(date))
            {
                days.Add(new AvailabilityDayDto(date, IsBlackout: true, FreeWindows: []));
                continue;
            }

            var open = openByWeekday.GetValueOrDefault(date.DayOfWeek) ?? [];
            var busy = busyByDate.GetValueOrDefault(date) ?? [];
            var free = AvailabilityCalculator.SubtractWindows(open, busy);
            days.Add(new AvailabilityDayDto(
                date,
                IsBlackout: false,
                FreeWindows: free.Select(w => new OpenWindowDto(Format(w.Start), Format(w.End))).ToList()));
        }

        return AvailabilityReadResult<RoomAvailabilityDto>.Ok(new RoomAvailabilityDto(roomId, timezone, from, to, days));
    }

    /// <inheritdoc />
    public async Task<AvailabilityReadResult<ScheduleCheckResultDto>> CheckScheduleAsync(
        Guid roomId, ScheduleDto? schedule, CancellationToken ct = default)
    {
        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room?.Venue is null || room.Status != RoomStatus.Published)
        {
            return AvailabilityReadResult<ScheduleCheckResultDto>.NotFound();
        }

        var timezone = room.Venue.Timezone;
        var todayLocal = VenueLocalToday(timezone, _clock.GetUtcNow());
        var (parsed, invalid) = ValidateSchedule(schedule, todayLocal);
        if (invalid is not null)
        {
            return AvailabilityReadResult<ScheduleCheckResultDto>.Fail(AvailabilityErrorCodes.InvalidApplication, invalid);
        }

        var (_, total, conflicts) = await ClassifyScheduleAsync(roomId, timezone, parsed, ct).ConfigureAwait(false);
        return AvailabilityReadResult<ScheduleCheckResultDto>.Ok(
            new ScheduleCheckResultDto(Available: conflicts.Count == 0, TotalOccurrences: total, Conflicts: conflicts));
    }

    /// <summary>
    /// Materializes a (venue-local) schedule and classifies each occurrence against the room's rules
    /// and confirmed bookings — the shared core of the advisory check, the submit-time block, and the
    /// manager-review digest. <c>HasRules</c> is false for a legacy room with no declared
    /// availability (classification skipped; every occurrence counts as available).
    /// </summary>
    private async Task<(bool HasRules, int Total, IReadOnlyList<ScheduleConflictDto> Conflicts)> ClassifyScheduleAsync(
        Guid roomId, string timezone, ParsedSchedule parsed, CancellationToken ct)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        var instants = ScheduleMaterializer.Materialize(
            parsed.Frequency, parsed.StartDate, parsed.EndDate, parsed.DaysOfWeek, parsed.StartTime, parsed.EndTime, tz);

        var hours = await _repository.GetOpenHoursAsync(roomId, ct).ConfigureAwait(false);
        var blackouts = await _repository.GetBlackoutsAsync(roomId, ct).ConfigureAwait(false);
        var rules = new AvailabilityRules(blackouts.Select(b => b.Date).ToHashSet(), OpenHoursByWeekday(hours));

        // Legacy room with no declared availability, or a schedule that materializes to nothing:
        // every occurrence is available (no classification).
        if (!rules.HasRules || instants.Count == 0)
        {
            return (rules.HasRules, instants.Count, []);
        }

        var fromUtc = instants.Min(i => i.StartUtc);
        var toUtc = instants.Max(i => i.EndUtc);
        var occurrences = await _repository.GetConfirmedOccurrencesAsync(roomId, fromUtc, toUtc, ct).ConfigureAwait(false);
        var busyByDate = BusyByDate(occurrences, tz);

        var conflicts = new List<ScheduleConflictDto>();
        foreach (var instant in instants)
        {
            var busy = busyByDate.GetValueOrDefault(instant.LocalDate) ?? [];
            var reason = AvailabilityCalculator.ClassifyOccurrence(
                instant.LocalDate, parsed.StartTime, parsed.EndTime, rules, busy);
            if (reason is not null)
            {
                conflicts.Add(new ScheduleConflictDto(instant.LocalDate, reason));
            }
        }

        return (true, instants.Count, conflicts);
    }

    /// <inheritdoc />
    public async Task<StoredScheduleConflicts?> GetStoredScheduleConflictsAsync(
        Guid roomId, ScheduleDto schedule, CancellationToken ct = default)
    {
        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room?.Venue is null || !TryParseStoredSchedule(schedule, out var parsed))
        {
            return null;
        }

        var (hasRules, total, conflicts) = await ClassifyScheduleAsync(roomId, room.Venue.Timezone, parsed, ct).ConfigureAwait(false);
        return hasRules ? new StoredScheduleConflicts(total, conflicts) : null;
    }

    /// <summary>Days a calendar defaults to when <c>to</c> is absent: today plus this many (CONTRACTS §6).</summary>
    private const int DefaultCalendarSpanDays = 27;

    /// <inheritdoc />
    public async Task<AvailabilityReadResult<VenueCalendarDto>> GetVenueCalendarAsync(
        Guid callerId, Guid venueId, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var venue = await _repository.GetVenueWithRoomsAsync(venueId, ct).ConfigureAwait(false);
        if (venue is null || !await _venueManagers.IsManagerAsync(callerId, venueId, ct).ConfigureAwait(false))
        {
            // Unknown and unmanaged answer identically — no existence leak (matches Manage venues).
            return AvailabilityReadResult<VenueCalendarDto>.NotFound();
        }

        var tz = TimeZoneInfo.FindSystemTimeZoneById(venue.Timezone);
        var todayLocal = VenueLocalToday(venue.Timezone, _clock.GetUtcNow());
        var fromDate = from ?? todayLocal;
        var toDate = to ?? todayLocal.AddDays(DefaultCalendarSpanDays);

        if (toDate < fromDate || toDate.DayNumber - fromDate.DayNumber > MaxRangeDays)
        {
            return AvailabilityReadResult<VenueCalendarDto>.Fail(
                AvailabilityErrorCodes.InvalidRange,
                $"'to' must be on or after 'from' and the range at most {MaxRangeDays} days.");
        }

        var rooms = venue.Rooms.OrderBy(r => r.Name).ThenBy(r => r.Id).ToList();
        var roomIds = rooms.Select(r => r.Id).ToList();

        var occurrences = new List<CalendarOccurrenceDto>();
        var pending = new List<CalendarPendingDto>();
        if (roomIds.Count > 0)
        {
            var fromUtc = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(fromDate.ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);
            var toUtc = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(toDate.AddDays(1).ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);

            var occ = await _repository.GetCalendarOccurrencesAsync(roomIds, fromUtc, toUtc, ct).ConfigureAwait(false);
            occurrences = occ
                .OrderBy(o => o.StartUtc)
                .Select(o => new CalendarOccurrenceDto(
                    o.BookingId,
                    o.RoomId,
                    o.Booking!.Organizer!.DisplayName,
                    o.LocalDate,
                    Format(TimeOnly.FromDateTime(TimeZoneInfo.ConvertTime(o.StartUtc, tz).DateTime)),
                    Format(TimeOnly.FromDateTime(TimeZoneInfo.ConvertTime(o.EndUtc, tz).DateTime)),
                    FlagEnumExtensions.ToCamelCaseToken(o.Status.ToString())))
                .ToList();

            var apps = await _repository.GetUndecidedApplicationsForRoomsAsync(roomIds, ct).ConfigureAwait(false);
            foreach (var app in apps)
            {
                var dates = MaterializeLocalDates(app, tz).Where(d => d >= fromDate && d <= toDate).OrderBy(d => d).ToList();
                if (dates.Count == 0)
                {
                    continue; // its projected schedule doesn't touch the window
                }

                pending.Add(new CalendarPendingDto(
                    app.Id, app.RoomId, app.Organizer!.DisplayName, Format(app.StartTime), Format(app.EndTime), dates));
            }
        }

        return AvailabilityReadResult<VenueCalendarDto>.Ok(new VenueCalendarDto(
            venueId,
            venue.Timezone,
            fromDate,
            toDate,
            rooms.Select(r => new CalendarRoomDto(r.Id, r.Name)).ToList(),
            occurrences,
            pending));
    }

    /// <summary>The venue-local dates a stored (application) schedule would occupy if approved.</summary>
    private static IReadOnlyList<DateOnly> MaterializeLocalDates(Application app, TimeZoneInfo tz) =>
        ScheduleMaterializer.Materialize(
            app.Frequency,
            app.StartDate,
            app.EndDate ?? app.StartDate,
            app.Frequency == ScheduleFrequency.RecurringWeekly ? app.DaysOfWeek : null,
            app.StartTime,
            app.EndTime,
            tz)
        .Select(i => i.LocalDate)
        .ToList();

    /// <summary>
    /// Leniently parses a <b>stored</b> (already-valid) schedule into its materializable fields —
    /// unlike <see cref="ValidateSchedule"/> it never rejects a past start date (time may have moved
    /// on since submit). Returns false only on a structurally impossible schedule (defensive).
    /// </summary>
    private static bool TryParseStoredSchedule(ScheduleDto schedule, out ParsedSchedule parsed)
    {
        parsed = default;
        if (!Enum.TryParse<ScheduleFrequency>(schedule.Frequency, ignoreCase: true, out var frequency) || !Enum.IsDefined(frequency))
        {
            return false;
        }

        if (!TryParseTime(schedule.StartTime, out var start) || !TryParseTime(schedule.EndTime, out var end))
        {
            return false;
        }

        if (frequency == ScheduleFrequency.RecurringWeekly)
        {
            if (schedule.EndDate is not { } endDate || schedule.DaysOfWeek is not { Count: > 0 } tokens)
            {
                return false;
            }

            var days = FlagEnumExtensions.CombineTokens<Weekdays>(tokens, out _);
            if (days == Weekdays.None)
            {
                return false;
            }

            parsed = new ParsedSchedule(frequency, schedule.StartDate, endDate, days, start, end);
            return true;
        }

        parsed = new ParsedSchedule(frequency, schedule.StartDate, schedule.StartDate, null, start, end);
        return true;
    }

    /// <summary>Recurring When-search horizon: a match must hold on every matching date in the next 28 days (CONTRACTS §3).</summary>
    private const int RecurringHorizonDays = 28;

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, MatchedWindowDto>> FilterByWhenAsync(
        IReadOnlyList<(Guid RoomId, string Timezone)> candidates,
        AvailabilityFilter filter,
        CancellationToken ct = default)
    {
        var result = new Dictionary<Guid, MatchedWindowDto>();
        if (candidates.Count == 0)
        {
            return result;
        }

        var roomIds = candidates.Select(c => c.RoomId).ToList();
        var now = _clock.GetUtcNow();

        // Batch the three availability reads across the whole candidate set (no per-room round-trips).
        var openHours = (await _repository.GetOpenHoursForRoomsAsync(roomIds, ct).ConfigureAwait(false)).ToLookup(h => h.RoomId);
        var blackouts = (await _repository.GetBlackoutsForRoomsAsync(roomIds, ct).ConfigureAwait(false)).ToLookup(b => b.RoomId);

        // Resolve the target venue-local dates per timezone and the UTC horizon covering them all.
        var tzById = new Dictionary<string, TimeZoneInfo>();
        var datesByTz = new Dictionary<string, IReadOnlyList<DateOnly>>();
        DateTimeOffset? minFromUtc = null, maxToUtc = null;
        foreach (var tzId in candidates.Select(c => c.Timezone).Distinct())
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(tzId);
            tzById[tzId] = tz;
            var todayLocal = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, tz).DateTime);
            var dates = TargetDates(filter, todayLocal);
            datesByTz[tzId] = dates;
            if (dates.Count == 0)
            {
                continue;
            }

            var fromUtc = new DateTimeOffset(
                TimeZoneInfo.ConvertTimeToUtc(dates.Min().ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);
            var toUtc = new DateTimeOffset(
                TimeZoneInfo.ConvertTimeToUtc(dates.Max().AddDays(1).ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);
            minFromUtc = minFromUtc is null || fromUtc < minFromUtc ? fromUtc : minFromUtc;
            maxToUtc = maxToUtc is null || toUtc > maxToUtc ? toUtc : maxToUtc;
        }

        if (minFromUtc is null)
        {
            return result; // no target dates for any candidate (e.g. one-off date already past everywhere)
        }

        var occByRoom = (await _repository
            .GetConfirmedOccurrencesForRoomsAsync(roomIds, minFromUtc.Value, maxToUtc!.Value, ct)
            .ConfigureAwait(false)).ToLookup(o => o.RoomId);

        foreach (var (roomId, tzId) in candidates)
        {
            var dates = datesByTz[tzId];
            if (dates.Count == 0)
            {
                continue;
            }

            var tz = tzById[tzId];
            var rules = new AvailabilityRules(
                blackouts[roomId].Select(b => b.Date).ToHashSet(),
                OpenHoursByWeekday(openHours[roomId].ToList()));
            var busyByDate = BusyByDate(occByRoom[roomId].ToList(), tz);

            (TimeOnly Start, TimeOnly End)? firstWindow = null;
            var satisfiedEveryDate = true;
            foreach (var date in dates)
            {
                var window = MatchFreeWindow(date, rules, busyByDate.GetValueOrDefault(date) ?? [], filter);
                if (window is null)
                {
                    satisfiedEveryDate = false;
                    break;
                }

                firstWindow ??= window;
            }

            if (satisfiedEveryDate && firstWindow is { } w)
            {
                // One-off carries the date; recurring omits it (window shown is the first matching date's).
                result[roomId] = new MatchedWindowDto(
                    filter.IsRecurring ? null : filter.Date, Format(w.Start), Format(w.End));
            }
        }

        return result;
    }

    /// <summary>
    /// The first free window on <paramref name="date"/> that satisfies the filter, or null. Explicit:
    /// a window containing the requested range. Band: a window whose overlap with the band is at least
    /// the duration. Any-window: a window at least the duration long. Free windows are sorted by start.
    /// </summary>
    private static (TimeOnly Start, TimeOnly End)? MatchFreeWindow(
        DateOnly date,
        AvailabilityRules rules,
        IReadOnlyList<(TimeOnly Start, TimeOnly End)> busy,
        AvailabilityFilter filter)
    {
        if (rules.BlackoutDates.Contains(date))
        {
            return null;
        }

        var open = rules.OpenHoursByWeekday.GetValueOrDefault(date.DayOfWeek) ?? [];
        var free = AvailabilityCalculator.SubtractWindows(open, busy);
        var duration = TimeSpan.FromMinutes(filter.DurationMinutes);

        foreach (var w in free)
        {
            switch (filter.RangeKind)
            {
                case WhenRangeKind.Explicit:
                    if (w.Start <= filter.RangeStart && w.End >= filter.RangeEnd)
                    {
                        return w;
                    }

                    break;
                case WhenRangeKind.Band:
                    var overlapStart = w.Start > filter.RangeStart ? w.Start : filter.RangeStart;
                    var overlapEnd = w.End < filter.RangeEnd ? w.End : filter.RangeEnd;
                    if (overlapEnd > overlapStart && overlapEnd - overlapStart >= duration)
                    {
                        return w;
                    }

                    break;
                default:
                    if (w.End - w.Start >= duration)
                    {
                        return w;
                    }

                    break;
            }
        }

        return null;
    }

    /// <summary>The venue-local dates a filter targets: the one-off date (unless past for this tz), or every matching weekday in the 28-day horizon.</summary>
    private static IReadOnlyList<DateOnly> TargetDates(AvailabilityFilter filter, DateOnly todayLocal)
    {
        if (!filter.IsRecurring)
        {
            var date = filter.Date!.Value;
            return date < todayLocal ? [] : [date];
        }

        var dates = new List<DateOnly>();
        for (var i = 0; i < RecurringHorizonDays; i++)
        {
            var date = todayLocal.AddDays(i);
            if ((filter.Weekdays & (Weekdays)(1 << (int)date.DayOfWeek)) != 0)
            {
                dates.Add(date);
            }
        }

        return dates;
    }

    /// <summary>Open windows keyed by weekday, each day's list ordered by start time.</summary>
    private static IReadOnlyDictionary<DayOfWeek, IReadOnlyList<(TimeOnly Start, TimeOnly End)>> OpenHoursByWeekday(
        IReadOnlyList<RoomOpenHours> hours) =>
        hours
            .GroupBy(h => h.DayOfWeek)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<(TimeOnly, TimeOnly)>)g.OrderBy(h => h.StartTime).Select(h => (h.StartTime, h.EndTime)).ToList());

    /// <summary>
    /// Confirmed busy intervals grouped by the venue-local date they render on. Each occurrence's
    /// UTC bounds are converted per-occurrence (DST-correct); occurrences never cross midnight.
    /// </summary>
    private static IReadOnlyDictionary<DateOnly, IReadOnlyList<(TimeOnly Start, TimeOnly End)>> BusyByDate(
        IReadOnlyList<BookingOccurrence> occurrences, TimeZoneInfo tz) =>
        occurrences
            .GroupBy(o => o.LocalDate)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<(TimeOnly, TimeOnly)>)g
                    .Select(o => (
                        TimeOnly.FromDateTime(TimeZoneInfo.ConvertTime(o.StartUtc, tz).DateTime),
                        TimeOnly.FromDateTime(TimeZoneInfo.ConvertTime(o.EndUtc, tz).DateTime)))
                    .ToList());

    /// <summary>
    /// Validates a proposed schedule with the same rules as apply (CONTRACTS §5) so the check
    /// endpoint's 400s match submit's, and parses it into venue-local fields on success.
    /// </summary>
    private static (ParsedSchedule Parsed, string? Invalid) ValidateSchedule(ScheduleDto? schedule, DateOnly todayLocal)
    {
        if (schedule is null)
        {
            return (default, "A proposed schedule is required.");
        }

        if (!Enum.TryParse<ScheduleFrequency>(schedule.Frequency, ignoreCase: true, out var frequency) || !Enum.IsDefined(frequency))
        {
            return (default, $"Unknown frequency '{schedule.Frequency}'.");
        }

        if (!TryParseTime(schedule.StartTime, out var start) || !TryParseTime(schedule.EndTime, out var end))
        {
            return (default, "Times must be HH:mm (24-hour), e.g. \"09:00\".");
        }

        if (end <= start)
        {
            return (default, "The end time must be after the start time.");
        }

        if (schedule.StartDate < todayLocal)
        {
            return (default, "The start date can't be in the past.");
        }

        if (frequency == ScheduleFrequency.RecurringWeekly)
        {
            if (schedule.EndDate is not { } endDate)
            {
                return (default, "A recurring schedule needs an end date (recurring terms are always bounded).");
            }

            if (endDate < schedule.StartDate)
            {
                return (default, "The end date can't be before the start date.");
            }

            if (endDate.DayNumber - schedule.StartDate.DayNumber > MaxTermDays)
            {
                return (default, "A recurring term can run at most a year — renew it when it ends.");
            }

            if (schedule.DaysOfWeek is not { Count: > 0 } dayTokens)
            {
                return (default, "A recurring schedule needs at least one day of the week.");
            }

            var days = FlagEnumExtensions.CombineTokens<Weekdays>(dayTokens, out var unknownDays);
            if (unknownDays.Count > 0)
            {
                return (default, $"Unknown day of the week '{unknownDays[0]}'.");
            }

            if (days == Weekdays.None)
            {
                return (default, "A recurring schedule needs at least one day of the week.");
            }

            return (new ParsedSchedule(frequency, schedule.StartDate, endDate, days, start, end), null);
        }

        if (schedule.EndDate is { } oneOffEnd && oneOffEnd != schedule.StartDate)
        {
            return (default, "A one-off request has a single date — leave the end date empty.");
        }

        return (new ParsedSchedule(frequency, schedule.StartDate, schedule.StartDate, null, start, end), null);
    }

    /// <summary>A validated, venue-local schedule ready to materialize.</summary>
    private readonly record struct ParsedSchedule(
        ScheduleFrequency Frequency, DateOnly StartDate, DateOnly EndDate, Weekdays? DaysOfWeek, TimeOnly StartTime, TimeOnly EndTime);

    private async Task<(Room? Room, ManageError? Error)> LoadScopedRoomAsync(Guid callerId, Guid roomId, CancellationToken ct)
    {
        var room = await _repository.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room?.Venue is null || !await _venueManagers.IsManagerAsync(callerId, room.VenueId, ct).ConfigureAwait(false))
        {
            // Unknown and unmanaged answer identically — no existence leak (matches Manage rooms).
            return (null, new ManageError(ManageErrorCodes.NotFound, "No such room."));
        }

        return (room, null);
    }

    /// <summary>
    /// Validates the payload and, on success, materializes the rows to persist. Returns the first
    /// problem's human detail in <c>Invalid</c>; both row lists are null when validation fails.
    /// </summary>
    private static (IReadOnlyList<RoomOpenHours>? Hours, IReadOnlyList<RoomBlackoutDate>? Blackouts, string? Invalid)
        BuildAndValidate(Guid roomId, SaveAvailabilityRulesRequest request, DateOnly todayLocal, DateTimeOffset now)
    {
        var hours = new List<RoomOpenHours>();
        var seenDays = new HashSet<DayOfWeek>();

        foreach (var day in request.Days ?? [])
        {
            if (!TryParseWeekday(day.DayOfWeek, out var weekday))
            {
                return (null, null, $"Unknown weekday '{day.DayOfWeek}'.");
            }

            if (!seenDays.Add(weekday))
            {
                return (null, null, $"Weekday '{day.DayOfWeek}' appears more than once — list each day once.");
            }

            var windows = day.Windows ?? [];
            if (windows.Count > MaxWindowsPerDay)
            {
                return (null, null, $"{weekday} has more than {MaxWindowsPerDay} windows.");
            }

            var parsed = new List<(TimeOnly Start, TimeOnly End)>();
            foreach (var window in windows)
            {
                if (!TryParseTime(window.StartTime, out var start) || !TryParseTime(window.EndTime, out var end))
                {
                    return (null, null, $"Times must be HH:mm (24-hour) — check {weekday}.");
                }

                if (end <= start)
                {
                    return (null, null, $"{weekday} window {window.StartTime}–{window.EndTime} must end after it starts.");
                }

                parsed.Add((start, end));
            }

            // Touching endpoints ([) adjacency) are fine; a later window may not start before an
            // earlier one ends.
            var ordered = parsed.OrderBy(w => w.Start).ToList();
            for (var i = 1; i < ordered.Count; i++)
            {
                if (ordered[i].Start < ordered[i - 1].End)
                {
                    return (null, null, $"{weekday} has overlapping windows.");
                }
            }

            foreach (var (start, end) in parsed)
            {
                hours.Add(new RoomOpenHours
                {
                    Id = Guid.NewGuid(),
                    RoomId = roomId,
                    DayOfWeek = weekday,
                    StartTime = start,
                    EndTime = end,
                    CreatedAtUtc = now,
                });
            }
        }

        var requestedBlackouts = request.Blackouts ?? [];
        if (requestedBlackouts.Count > MaxBlackouts)
        {
            return (null, null, $"No more than {MaxBlackouts} blackout dates.");
        }

        var blackouts = new List<RoomBlackoutDate>();
        var seenDates = new HashSet<DateOnly>();
        foreach (var blackout in requestedBlackouts)
        {
            if (blackout.Date < todayLocal)
            {
                return (null, null, $"Blackout date {blackout.Date:yyyy-MM-dd} is in the past.");
            }

            if (!seenDates.Add(blackout.Date))
            {
                return (null, null, $"Blackout date {blackout.Date:yyyy-MM-dd} appears more than once.");
            }

            var reason = blackout.Reason?.Trim();
            if (reason is { Length: > MaxReasonLength })
            {
                return (null, null, $"A blackout reason is over {MaxReasonLength} characters.");
            }

            blackouts.Add(new RoomBlackoutDate
            {
                Id = Guid.NewGuid(),
                RoomId = roomId,
                Date = blackout.Date,
                Reason = string.IsNullOrEmpty(reason) ? null : reason,
                CreatedAtUtc = now,
            });
        }

        return (hours, blackouts, null);
    }

    private static RoomAvailabilityRulesDto BuildRulesDto(
        Guid roomId, string timezone, IReadOnlyList<RoomOpenHours> hours, IReadOnlyList<RoomBlackoutDate> blackouts) =>
        new(
            RoomId: roomId,
            Timezone: timezone,
            Days: BuildDays(hours),
            Blackouts: blackouts
                .OrderBy(b => b.Date)
                .Select(b => new BlackoutDateDto(b.Date, b.Reason))
                .ToList());

    /// <summary>All seven days Sunday-first; closed days carry an empty window list.</summary>
    private static IReadOnlyList<DayOpenHoursDto> BuildDays(IReadOnlyList<RoomOpenHours> hours)
    {
        var days = new List<DayOpenHoursDto>(7);
        for (var d = DayOfWeek.Sunday; d <= DayOfWeek.Saturday; d++)
        {
            var windows = hours
                .Where(h => h.DayOfWeek == d)
                .OrderBy(h => h.StartTime)
                .Select(h => new OpenWindowDto(Format(h.StartTime), Format(h.EndTime)))
                .ToList();
            days.Add(new DayOpenHoursDto(d.ToString().ToLowerInvariant(), windows));
        }

        return days;
    }

    private static DateOnly VenueLocalToday(string timezone, DateTimeOffset nowUtc)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(nowUtc, tz).DateTime);
    }

    private static bool TryParseWeekday(string? token, out DayOfWeek weekday) =>
        Enum.TryParse(token, ignoreCase: true, out weekday) && token is { Length: > 0 } && char.IsLetter(token[0]);

    private static bool TryParseTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    private static string Format(TimeOnly time) => time.ToString("HH\\:mm", CultureInfo.InvariantCulture);

    private async Task TrackSafelyAsync(string eventType, object payload)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: analytics must never fail a manage operation.
        }
    }
}
