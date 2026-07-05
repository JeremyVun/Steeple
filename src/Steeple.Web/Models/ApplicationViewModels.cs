using System.Globalization;

namespace Steeple.Web.Models;

/// <summary>
/// Display helpers for application/booking wire tokens — the web binding of the DESIGN_SYSTEM
/// §8.4 status-chip mapping and the §10 date/time voice ("Tuesdays 9:00–11:30 AM", venue-local,
/// explicit day names; relative stamps for inbox rows).
/// </summary>
public static class ApplicationDisplay
{
    /// <summary>
    /// Wire status token → semantic chip role (maps to <c>.status-&lt;role&gt;</c> CSS). Covers
    /// application and booking tokens; occurrence tokens have their own mapping
    /// (<see cref="BookingDisplay.OccurrenceRole"/>) because "cancelled" means different things
    /// at the two levels.
    /// </summary>
    public static string StatusRole(string status) => status switch
    {
        "pending" => "warning",
        "needsInfo" => "info",
        "approved" or "confirmed" => "success",
        "declined" or "cancelled" => "danger",
        _ => "neutral", // withdrawn, expired, completed, and any token this build doesn't know yet
    };

    /// <summary>Wire status token → chip label (§8.4; unknown tokens humanize).</summary>
    public static string StatusLabel(string status) => status switch
    {
        "pending" => "Pending",
        "needsInfo" => "Needs info",
        "approved" => "Approved",
        "declined" => "Declined",
        "withdrawn" => "Withdrawn",
        "expired" => "Expired",
        "confirmed" => "Confirmed",
        "completed" => "Completed",
        "cancelled" => "Cancelled",
        _ => DiscoveryViewModel.Humanize(status),
    };

    /// <summary>
    /// The schedule in the venue's local terms: "Tuesdays 9:00–11:30 AM · Sep 1 – Dec 15, 2026"
    /// or "Tue, Sep 1, 2026 · 9:00–11:30 AM".
    /// </summary>
    public static string DescribeSchedule(ScheduleDto schedule)
    {
        var times = $"{FormatTime(schedule.StartTime)}–{FormatTime(schedule.EndTime)}";

        if (schedule.Frequency == "recurringWeekly")
        {
            var days = DescribeDays(schedule.DaysOfWeek);
            var term = schedule.EndDate is { } end
                ? $"{FormatDate(schedule.StartDate)} – {FormatDate(end)}"
                : $"from {FormatDate(schedule.StartDate)}";
            return $"{days} {times} · {term}";
        }

        return $"{schedule.StartDate.ToString("ddd, MMM d, yyyy", CultureInfo.InvariantCulture)} · {times}";
    }

    /// <summary>Inbox-style relative stamp ("just now", "2h ago", "3d ago"), falling back to a date.</summary>
    public static string RelativeTime(DateTimeOffset momentUtc)
    {
        var elapsed = DateTimeOffset.UtcNow - momentUtc;
        return elapsed switch
        {
            { TotalMinutes: < 1 } => "just now",
            { TotalHours: < 1 } => $"{(int)elapsed.TotalMinutes}m ago",
            { TotalDays: < 1 } => $"{(int)elapsed.TotalHours}h ago",
            { TotalDays: < 7 } => $"{(int)elapsed.TotalDays}d ago",
            _ => FormatDate(DateOnly.FromDateTime(momentUtc.UtcDateTime)),
        };
    }

    /// <summary>
    /// Wire weekday tokens → "Tuesdays and Thursdays" (§10 voice: full day names, never
    /// abbreviated in schedule summaries). Empty/null → "Weekly".
    /// </summary>
    public static string DescribeDays(IReadOnlyList<string>? dayTokens)
    {
        if (dayTokens is not { Count: > 0 })
        {
            return "Weekly";
        }

        var names = dayTokens.Select(t => DiscoveryViewModel.Humanize(t) + "s").ToList();
        return names.Count switch
        {
            1 => names[0],
            2 => $"{names[0]} and {names[1]}",
            _ => $"{string.Join(", ", names[..^1])} and {names[^1]}",
        };
    }

    /// <summary>
    /// A tight venue-local time range: "6:00–9:00 PM" (drops the leading meridiem when both ends
    /// share it), else "9:30 AM–1:00 PM". Used for the card "Free …" line (§10 voice).
    /// </summary>
    public static string FormatTimeRange(string startWire, string endWire)
    {
        var start = FormatTime(startWire);
        var end = FormatTime(endWire);
        var split = start.LastIndexOf(' ');
        if (split > 0 && end.EndsWith(start[(split + 1)..], StringComparison.Ordinal))
        {
            return $"{start[..split]}–{end}";
        }

        return $"{start}–{end}";
    }

    /// <summary>"09:00" (wire HH:mm) → "9:00 AM". Unparseable values pass through untouched.</summary>
    public static string FormatTime(string wireTime) =>
        TimeOnly.TryParseExact(wireTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t)
            ? t.ToString("h:mm tt", CultureInfo.InvariantCulture)
            : wireTime;

    private static string FormatDate(DateOnly date) =>
        date.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);
}

/// <summary>
/// Model-bound apply form (venue-local schedule; posted back to the BFF which submits to the API).
/// The idempotency key is minted when the form first renders, so a double-click or a re-post
/// after sign-in can never file two requests.
/// </summary>
public sealed class ApplyFormModel
{
    public string ActivityType { get; set; } = "";
    public int GroupSize { get; set; } = 10;

    /// <summary>"oneOff" | "recurringWeekly".</summary>
    public string Frequency { get; set; } = "oneOff";
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }

    /// <summary>Weekday wire tokens for a weekly request (checkbox chips; one or more).</summary>
    public List<string> DaysOfWeek { get; set; } = [];

    /// <summary>
    /// Legacy single-day shim: pre-uplift session stashes round-trip <c>DayOfWeek</c>; the setter
    /// folds it into <see cref="DaysOfWeek"/> so a draft parked across the wire break survives.
    /// </summary>
    public string? DayOfWeek
    {
        get => null;
        set
        {
            if (!string.IsNullOrEmpty(value) && !DaysOfWeek.Contains(value))
            {
                DaysOfWeek.Add(value);
            }
        }
    }

    public string StartTime { get; set; } = "";
    public string EndTime { get; set; } = "";
    public string IntentText { get; set; } = "";
    public Guid IdempotencyKey { get; set; }
    public string? TurnstileToken { get; set; }
}

/// <summary>View model for the apply page: the listing being applied for plus the form state.</summary>
public sealed class ApplyViewModel
{
    public required RoomDetailDto Room { get; init; }
    public required ApplyFormModel Form { get; init; }

    /// <summary>Friendly submit error (validation echo or API failure), if any.</summary>
    public string? Error { get; init; }

    /// <summary>True when the form was restored from the pre-sign-in stash ("still here" note).</summary>
    public bool Restored { get; init; }

    /// <summary>Turnstile widget site key; empty = widget not rendered.</summary>
    public string TurnstileSiteKey { get; init; } = "";

    /// <summary>
    /// True when <c>web.availability_picker</c> is on: the calendar slot picker enhances the form
    /// (the native date/time inputs stay the canonical fields). Off → today's plain form, no picker.
    /// </summary>
    public bool PickerEnabled { get; init; }

    /// <summary>
    /// Conflict payload from a submit-time <c>409 schedule_unavailable</c>, rendered as the danger
    /// verdict card at the top of the form (§8.13). Null unless the submit was hard-blocked.
    /// </summary>
    public ScheduleCheckResultDto? Conflict { get; init; }

    /// <summary>The month the calendar opens on: the drafted start date's month, else the current month.</summary>
    public DateOnly InitialMonth =>
        new DateOnly((Form.StartDate ?? DateOnly.FromDateTime(DateTime.Today)).Year,
                     (Form.StartDate ?? DateOnly.FromDateTime(DateTime.Today)).Month, 1);

    /// <summary>Activity options limited to what this room accepts (wire token + label).</summary>
    public IReadOnlyList<FilterOption> ActivityOptions =>
        Room.Activities.Select(t => new FilterOption(t, DiscoveryViewModel.Humanize(t))).ToList();

    /// <summary>Weekday options for the recurring picker (wire token + label).</summary>
    public static IReadOnlyList<FilterOption> DayOptions { get; } =
        Enum.GetValues<DayOfWeek>()
            .Select(d => new FilterOption(
                char.ToLowerInvariant(d.ToString()[0]) + d.ToString()[1..],
                d.ToString()))
            .ToList();
}

/// <summary>View model for the organizer inbox (and, with <see cref="IsProviderView"/>, the provider inbox).</summary>
public sealed class InboxViewModel
{
    public required ApplicationListResult Result { get; init; }

    /// <summary>The active status-filter wire token, or null for "all".</summary>
    public string? StatusFilter { get; init; }

    /// <summary>True when rendering /manage/applications (venue perspective) rather than /inbox.</summary>
    public bool IsProviderView { get; init; }

    /// <summary>True when the signed-in user manages at least one venue (shows the hosting tab).</summary>
    public bool IsProvider { get; init; }

    /// <summary>Status-filter tabs offered above the list.</summary>
    public static IReadOnlyList<FilterOption> StatusOptions { get; } =
    [
        new("", "All"),
        new("pending", "Pending"),
        new("needsInfo", "Needs info"),
        new("approved", "Approved"),
        new("declined", "Declined"),
    ];
}

/// <summary>View model for an application thread page (both perspectives).</summary>
public sealed class ApplicationThreadViewModel
{
    public required ApplicationDto Application { get; init; }

    /// <summary>True when the viewer is the organizer; false when a venue manager.</summary>
    public required bool ViewerIsOrganizer { get; init; }

    /// <summary>The signed-in user's id (aligns thread bubbles left/right).</summary>
    public required Guid ViewerId { get; init; }

    /// <summary>Friendly action error (failed reply/decision), if any.</summary>
    public string? Error { get; init; }

    /// <summary>One-shot success note ("Request sent"), if any.</summary>
    public string? Flash { get; init; }

    /// <summary>Whether the thread still accepts messages / decisions.</summary>
    public bool IsUndecided => Application.Status is "pending" or "needsInfo";

    /// <summary>Display name for a thread message's sender.</summary>
    public string SenderName(Guid senderId) =>
        senderId == Application.Organizer.Id ? Application.Organizer.DisplayName : Application.VenueName;
}

// ------------------------------------------------------------------------------------------------
// Availability slot picker (DESIGN_SYSTEM §8.10–8.13) — the web binding of the guest availability
// reads. Day-state classification, open-hours summarizing and next-free are computed here (and in
// the controller), never re-derived in client JS (§8.13): the calendar always shows the server's
// answer. The picker calendar/day/check partials are HTMX-loaded fragments of the apply form.
// ------------------------------------------------------------------------------------------------

/// <summary>A calendar day's availability state (§8.10 table), most-open last.</summary>
public enum AvailabilityDayState { Past, Closed, Blackout, BookedOut, PartlyBooked, Open }

/// <summary>One rendered calendar/strip cell: its date, classified state and free-window count.</summary>
public sealed record AvailabilityDayCell(DateOnly Date, AvailabilityDayState State, int FreeWindowCount)
{
    /// <summary>Only open / partly-booked days are pickable (§8.10 "Interactive?").</summary>
    public bool IsInteractive => State is AvailabilityDayState.Open or AvailabilityDayState.PartlyBooked;

    /// <summary>The §8.10 state class (colours resolve from the §2.3 status tokens in site.css).</summary>
    public string CssClass => State switch
    {
        AvailabilityDayState.Open => "avail-open",
        AvailabilityDayState.PartlyBooked => "avail-partly",
        AvailabilityDayState.BookedOut => "avail-booked",
        AvailabilityDayState.Blackout => "avail-blackout",
        AvailabilityDayState.Closed => "avail-closed",
        _ => "avail-past",
    };

    /// <summary>Plain-language state, carried in the accessible name (colour never alone, §9.5).</summary>
    public string StateLabel => State switch
    {
        AvailabilityDayState.Open => "open",
        AvailabilityDayState.PartlyBooked => "partly booked",
        AvailabilityDayState.BookedOut => "booked out",
        AvailabilityDayState.Blackout => "closed",
        AvailabilityDayState.Closed => "closed",
        _ => "in the past",
    };

    /// <summary>"Tuesday, September 8 — open, 2 free windows" (§8.10 screen-reader name).</summary>
    public string AccessibleName
    {
        get
        {
            var day = Date.ToString("dddd, MMMM d", CultureInfo.InvariantCulture);
            if (FreeWindowCount > 0)
            {
                return $"{day} — {StateLabel}, {FreeWindowCount} free window{(FreeWindowCount == 1 ? "" : "s")}";
            }

            return $"{day} — {StateLabel}";
        }
    }
}

/// <summary>Shared availability computations (day-state, open-hours summary, next-free).</summary>
public static class AvailabilityDisplay
{
    /// <summary>Furthest ahead a guest can browse/apply — mirrors the API's 92-day range cap.</summary>
    public const int MaxHorizonDays = 92;

    /// <summary>
    /// Classifies each day in <c>[start, end]</c> from the guest availability read plus the room's
    /// open hours: a non-blackout day with no free windows is <em>booked out</em> if its weekday has
    /// open hours, otherwise <em>closed</em>; free windows narrower than the weekday's open hours mean
    /// <em>partly booked</em> (§8.10).
    /// </summary>
    public static IReadOnlyList<AvailabilityDayCell> BuildCells(
        DateOnly start, DateOnly end, DateOnly today,
        RoomAvailabilityDto? availability, IReadOnlyList<DayOpenHoursDto>? openHours)
    {
        var byDate = (availability?.Days ?? []).ToDictionary(d => d.Date);
        var openByWeekday = OpenHoursByWeekday(openHours);

        var cells = new List<AvailabilityDayCell>();
        for (var date = start; date <= end; date = date.AddDays(1))
        {
            cells.Add(Classify(date, today, byDate.GetValueOrDefault(date), openByWeekday));
        }

        return cells;
    }

    private static AvailabilityDayCell Classify(
        DateOnly date, DateOnly today, AvailabilityDayDto? day,
        IReadOnlyDictionary<DayOfWeek, IReadOnlyList<OpenWindowDto>> openByWeekday)
    {
        if (date < today)
        {
            return new AvailabilityDayCell(date, AvailabilityDayState.Past, 0);
        }

        if (day is null)
        {
            // Outside the fetched window / room has no rules → treat as closed (not pickable).
            return new AvailabilityDayCell(date, AvailabilityDayState.Closed, 0);
        }

        if (day.IsBlackout)
        {
            return new AvailabilityDayCell(date, AvailabilityDayState.Blackout, 0);
        }

        var openWindows = openByWeekday.GetValueOrDefault(date.DayOfWeek) ?? [];
        if (day.FreeWindows.Count == 0)
        {
            var state = openWindows.Count > 0 ? AvailabilityDayState.BookedOut : AvailabilityDayState.Closed;
            return new AvailabilityDayCell(date, state, 0);
        }

        var partly = openWindows.Count > 0 && !SameWindows(day.FreeWindows, openWindows);
        var open = partly ? AvailabilityDayState.PartlyBooked : AvailabilityDayState.Open;
        return new AvailabilityDayCell(date, open, day.FreeWindows.Count);
    }

    private static bool SameWindows(IReadOnlyList<OpenWindowDto> a, IReadOnlyList<OpenWindowDto> b)
    {
        if (a.Count != b.Count)
        {
            return false;
        }

        static IEnumerable<string> Keys(IReadOnlyList<OpenWindowDto> w) =>
            w.Select(x => $"{x.StartTime}-{x.EndTime}").OrderBy(x => x, StringComparer.Ordinal);
        return Keys(a).SequenceEqual(Keys(b));
    }

    private static Dictionary<DayOfWeek, IReadOnlyList<OpenWindowDto>> OpenHoursByWeekday(
        IReadOnlyList<DayOpenHoursDto>? openHours)
    {
        var map = new Dictionary<DayOfWeek, IReadOnlyList<OpenWindowDto>>();
        foreach (var d in openHours ?? [])
        {
            if (d.Windows.Count > 0 && Enum.TryParse<DayOfWeek>(d.DayOfWeek, ignoreCase: true, out var dow))
            {
                map[dow] = d.Windows;
            }
        }

        return map;
    }

    /// <summary>
    /// Compresses open hours into a one-line summary, grouping consecutive identical days
    /// Monday-first: "Mon–Fri 8 AM–10 PM · Sat 9 AM–5 PM". Null/empty rules → a gentle fallback.
    /// </summary>
    public static string OpenHoursSummary(IReadOnlyList<DayOpenHoursDto>? openHours)
    {
        var openByWeekday = OpenHoursByWeekday(openHours);
        if (openByWeekday.Count == 0)
        {
            return "Open hours aren't listed yet — send a request and ask.";
        }

        // Monday-first reading order for the summary sentence.
        DayOfWeek[] order = [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday,
            DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday];

        var groups = new List<string>();
        var i = 0;
        while (i < order.Length)
        {
            if (!openByWeekday.TryGetValue(order[i], out var windows))
            {
                i++;
                continue;
            }

            var signature = string.Join(", ", windows.Select(w => $"{ShortTime(w.StartTime)}–{ShortTime(w.EndTime)}"));
            var runStart = i;
            while (i + 1 < order.Length
                   && openByWeekday.TryGetValue(order[i + 1], out var next)
                   && SameWindows(next, windows))
            {
                i++;
            }

            var dayLabel = runStart == i
                ? Abbrev(order[runStart])
                : $"{Abbrev(order[runStart])}–{Abbrev(order[i])}";
            groups.Add($"{dayLabel} {signature}");
            i++;
        }

        return string.Join(" · ", groups);
    }

    /// <summary>"Next free" line from a fetched window: "Tuesday 6:00–9:00 PM", or null when none.</summary>
    public static string? NextFree(RoomAvailabilityDto? availability)
    {
        foreach (var day in (availability?.Days ?? []).OrderBy(d => d.Date))
        {
            if (day.FreeWindows.Count > 0)
            {
                var w = day.FreeWindows[0];
                var when = day.Date.ToString("dddd", CultureInfo.InvariantCulture);
                return $"{when} {ApplicationDisplay.FormatTime(w.StartTime)}–{ApplicationDisplay.FormatTime(w.EndTime)}";
            }
        }

        return null;
    }

    /// <summary>"08:00" → "8 AM"; "08:30" → "8:30 AM" (drops :00 minutes for a tighter summary).</summary>
    public static string ShortTime(string wireTime)
    {
        if (!TimeOnly.TryParseExact(wireTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t))
        {
            return wireTime;
        }

        return t.Minute == 0
            ? t.ToString("h tt", CultureInfo.InvariantCulture)
            : t.ToString("h:mm tt", CultureInfo.InvariantCulture);
    }

    private static string Abbrev(DayOfWeek d) => d switch
    {
        DayOfWeek.Sunday => "Sun",
        DayOfWeek.Monday => "Mon",
        DayOfWeek.Tuesday => "Tue",
        DayOfWeek.Wednesday => "Wed",
        DayOfWeek.Thursday => "Thu",
        DayOfWeek.Friday => "Fri",
        _ => "Sat",
    };

    /// <summary>Conflict reason wire token → plain language (§8.13).</summary>
    public static string ConflictReason(string reason) => reason switch
    {
        "outsideOpenHours" => "outside open hours",
        "blackout" => "closed that day",
        "booked" => "already booked",
        _ => DiscoveryViewModel.Humanize(reason),
    };
}

/// <summary>Model for the "when it's open" listing-detail preview (§8.10 mini strip + legend).</summary>
public sealed class AvailabilityPreviewViewModel
{
    public required string OpenHoursSummary { get; init; }
    public required IReadOnlyList<AvailabilityDayCell> Strip { get; init; }

    /// <summary>"Tuesday 6:00–9:00 PM", or null when nothing is free in the fetched horizon.</summary>
    public string? NextFree { get; init; }

    /// <summary>Deep link to the apply page (the no-JS/next-step CTA).</summary>
    public required string ApplyUrl { get; init; }
}

/// <summary>Model for one month of the apply calendar grid (§8.10).</summary>
public sealed class AvailabilityCalendarViewModel
{
    public required string VenueSlug { get; init; }
    public required string RoomSlug { get; init; }

    /// <summary>First day of the rendered month.</summary>
    public required DateOnly Month { get; init; }
    public required DateOnly Today { get; init; }

    /// <summary>The day currently selected in the form (highlighted), if any.</summary>
    public DateOnly? Selected { get; init; }

    /// <summary>Cells for every day of <see cref="Month"/> (state pre-classified).</summary>
    public required IReadOnlyList<AvailabilityDayCell> Days { get; init; }

    /// <summary>Earliest / latest month a guest can browse (clamps prev/next nav).</summary>
    public required DateOnly MinMonth { get; init; }
    public required DateOnly MaxMonth { get; init; }

    public DateOnly PrevMonth => Month.AddMonths(-1);
    public DateOnly NextMonth => Month.AddMonths(1);
    public bool HasPrev => PrevMonth >= MinMonth;
    public bool HasNext => NextMonth <= MaxMonth;

    /// <summary>Leading blank cells before the 1st so columns align Sunday-first (§8.10).</summary>
    public int LeadingBlanks => (int)Month.DayOfWeek; // Sunday = 0
    public string MonthHeading => Month.ToString("MMMM yyyy", CultureInfo.InvariantCulture);
}

/// <summary>Model for the day time-range control (§8.11): free windows + range selects.</summary>
public sealed class DayWindowsViewModel
{
    public required DateOnly Date { get; init; }
    public required IReadOnlyList<OpenWindowDto> FreeWindows { get; init; }

    /// <summary>Human date for the readout ("Tuesday, Sep 8").</summary>
    public string DateLabel => Date.ToString("dddd, MMM d", CultureInfo.InvariantCulture);

    /// <summary>Wire date the picker writes into the canonical StartDate input.</summary>
    public string WireDate => Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}

/// <summary>Model for the verdict card (§8.13), shared by the live check and the submit hard-block.</summary>
public sealed class ConflictSummaryViewModel
{
    public required ScheduleCheckResultDto Result { get; init; }

    /// <summary>True for the submit-time 409 re-render: forces the danger variant + next-action copy.</summary>
    public bool HardBlock { get; init; }

    private int ClashCount => Result.Conflicts.Count;
    private bool FullyBlocked => ClashCount > 0 && (HardBlock || ClashCount >= Result.TotalOccurrences);

    /// <summary>success | warning | danger — the §2.3 status role driving the banner colours.</summary>
    public string Role => Result.Available ? "success" : FullyBlocked ? "danger" : "warning";

    public string Icon => Result.Available ? "✓" : FullyBlocked ? "✕" : "!";

    /// <summary>The banner headline (§8.13 language: advisory, not a promise).</summary>
    public string Headline
    {
        get
        {
            var total = Result.TotalOccurrences;
            if (Result.Available)
            {
                return total == 1 ? "That time looks free." : $"All {total} dates look free.";
            }

            if (FullyBlocked && ClashCount >= total)
            {
                return total == 1 ? "That time isn't available." : $"None of those {total} dates are free.";
            }

            return $"{ClashCount} of {total} dates clash.";
        }
    }

    /// <summary>Next-action line, shown for the danger variant (§8.13).</summary>
    public string? NextAction =>
        Role == "danger" ? "Pick another time — the calendar shows what's free." : null;
}

// ------------------------------------------------------------------------------------------------
// Host review (CONTRACTS §6 "Host review & venue calendar"). The provider-side application detail
// gets the manager-only conflict summary + a CSS-only mini-week strip built from the same payload
// the page already fetched — no extra lazy fetch (§8.13: render exactly what the server returned).
// ------------------------------------------------------------------------------------------------

/// <summary>One Su–Sa column of the host-review mini-week strip.</summary>
public sealed record MiniWeekCell(string DayLabel, string DayInitial, bool Occupied, bool Conflicted)
{
    /// <summary>The occupancy/state class (colours from the §2.3 status tokens).</summary>
    public string CssClass => (Occupied, Conflicted) switch
    {
        (true, true) => "cal-mini-clash",
        (true, false) => "cal-mini-occupied",
        _ => "cal-mini-free",
    };

    /// <summary>Colour-independent state, carried in the accessible name (§9.5).</summary>
    public string StateLabel => (Occupied, Conflicted) switch
    {
        (true, true) => "requested, clashes",
        (true, false) => "requested",
        _ => "not this day",
    };
}

/// <summary>Host-side review helpers: the conflict verdict adapter + the mini-week strip.</summary>
public static class HostReviewDisplay
{
    private static readonly string[] Tokens =
        ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    private static readonly string[] Labels =
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    private static readonly string[] Initials = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    /// <summary>
    /// Adapts the host-only <see cref="ApplicationConflictsDto"/> to the shared verdict card model
    /// (§8.13) — the same all-clear / partial / clash banner the apply flow uses.
    /// </summary>
    public static ConflictSummaryViewModel ToVerdict(ApplicationConflictsDto conflicts) =>
        new()
        {
            Result = new ScheduleCheckResultDto(
                Available: conflicts.Conflicts.Count == 0,
                TotalOccurrences: conflicts.TotalOccurrences,
                Conflicts: conflicts.Conflicts),
        };

    /// <summary>
    /// Seven Su–Sa cells marking which weekdays the request occupies (from the schedule) and which
    /// of those clash (from the conflict dates). A one-off marks its single weekday; a weekly
    /// request marks each selected day.
    /// </summary>
    public static IReadOnlyList<MiniWeekCell> BuildMiniWeek(ScheduleDto schedule, ApplicationConflictsDto? conflicts)
    {
        var occupied = new bool[7];
        if (schedule.Frequency == "recurringWeekly" && schedule.DaysOfWeek is { Count: > 0 } days)
        {
            foreach (var token in days)
            {
                var i = Array.FindIndex(Tokens, t => string.Equals(t, token, StringComparison.OrdinalIgnoreCase));
                if (i >= 0)
                {
                    occupied[i] = true;
                }
            }
        }
        else
        {
            occupied[(int)schedule.StartDate.DayOfWeek] = true;
        }

        var clashed = new bool[7];
        foreach (var clash in conflicts?.Conflicts ?? [])
        {
            clashed[(int)clash.Date.DayOfWeek] = true;
        }

        var cells = new List<MiniWeekCell>(7);
        for (var i = 0; i < 7; i++)
        {
            cells.Add(new MiniWeekCell(Labels[i], Initials[i], occupied[i], occupied[i] && clashed[i]));
        }

        return cells;
    }
}
