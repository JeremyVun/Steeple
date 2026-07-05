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
