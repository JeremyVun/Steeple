using System.Globalization;

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
