namespace Steeple.Web.Models;

/// <summary>
/// Display helpers for booking/occurrence wire tokens — the web binding of the DESIGN_SYSTEM
/// §8.4 chip mapping rows that belong to bookings. Occurrence tokens get their own mapping
/// (an occurrence-level "cancelled" is neutral history, not a danger state like a cancelled
/// booking) and their own label voice ("Went ahead").
/// </summary>
public static class BookingDisplay
{
    /// <summary>Occurrence wire status → semantic chip role (§8.4).</summary>
    public static string OccurrenceRole(string status) => status switch
    {
        "scheduled" => "info",
        "noShow" => "danger",
        _ => "neutral", // occurred, cancelled, and any token this build doesn't know yet
    };

    /// <summary>Occurrence wire status → chip label (§8.4; unknown tokens humanize).</summary>
    public static string OccurrenceLabel(string status) => status switch
    {
        "scheduled" => "Scheduled",
        "occurred" => "Went ahead",
        "noShow" => "No-show",
        "cancelled" => "Cancelled",
        _ => DiscoveryViewModel.Humanize(status),
    };

    /// <summary>"Tue, Sep 8, 2026" — occurrence dates are venue-local by construction.</summary>
    public static string FormatLocalDate(DateOnly date) =>
        date.ToString("ddd, MMM d, yyyy", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>The booking's venue-local time window, e.g. "9:00 AM–11:30 AM".</summary>
    public static string TimeWindow(ScheduleDto schedule) =>
        $"{ApplicationDisplay.FormatTime(schedule.StartTime)}–{ApplicationDisplay.FormatTime(schedule.EndTime)}";

    /// <summary>
    /// The list row's right-hand side line: what happens next (or how it ended), venue-local.
    /// </summary>
    public static string NextLine(BookingDto booking) => booking.Status switch
    {
        "confirmed" when booking.NextOccurrence is { } next => $"Next: {FormatLocalDate(next.LocalDate)}",
        "confirmed" => "Starts soon",
        "completed" => $"Ended {FormatLocalDate(booking.EndDate)}",
        "cancelled" => booking.CancelledAtUtc is { } at ? $"Cancelled {ApplicationDisplay.RelativeTime(at)}" : "Cancelled",
        _ => "",
    };
}

/// <summary>View model for the organizer bookings list (and, with <see cref="IsProviderView"/>, the provider's).</summary>
public sealed class BookingsViewModel
{
    public required BookingListResult Result { get; init; }

    /// <summary>The active status-filter wire token, or null for "all".</summary>
    public string? StatusFilter { get; init; }

    /// <summary>True when rendering /manage/bookings (venue perspective) rather than /bookings.</summary>
    public bool IsProviderView { get; init; }

    /// <summary>True when the signed-in user manages at least one venue (shows the hosting tab).</summary>
    public bool IsProvider { get; init; }

    /// <summary>One-shot note carried from an action redirect ("Booking cancelled…"), if any.</summary>
    public string? Flash { get; init; }

    /// <summary>Status-filter tabs offered above the list.</summary>
    public static IReadOnlyList<FilterOption> StatusOptions { get; } =
    [
        new("", "All"),
        new("confirmed", "Confirmed"),
        new("completed", "Completed"),
        new("cancelled", "Cancelled"),
    ];
}

/// <summary>View model for a booking detail page (both perspectives).</summary>
public sealed class BookingDetailViewModel
{
    public required BookingDto Booking { get; init; }

    /// <summary>True when the viewer is the organizer; false when a venue manager.</summary>
    public required bool ViewerIsOrganizer { get; init; }

    /// <summary>Friendly action error (failed cancel/no-show), if any.</summary>
    public string? Error { get; init; }

    /// <summary>One-shot success note ("Booking cancelled"), if any.</summary>
    public string? Flash { get; init; }

    /// <summary>Whether the booking still holds future slots (shows the cancel affordance).</summary>
    public bool IsCancellable => Booking.Status == "confirmed";

    /// <summary>Occurrences that haven't started yet, soonest first.</summary>
    public IReadOnlyList<OccurrenceDto> Upcoming =>
        Booking.Occurrences.Where(o => o.StartUtc > DateTimeOffset.UtcNow).ToList();

    /// <summary>Occurrences already started/passed, most recent first.</summary>
    public IReadOnlyList<OccurrenceDto> Past =>
        Booking.Occurrences.Where(o => o.StartUtc <= DateTimeOffset.UtcNow).Reverse().ToList();

    /// <summary>Whether this past occurrence can still be marked a no-show.</summary>
    public static bool CanMarkNoShow(OccurrenceDto occurrence) =>
        occurrence.Status is "scheduled" or "occurred";

    /// <summary>The name of the other party (who gets notified by viewer actions).</summary>
    public string OtherPartyName => ViewerIsOrganizer ? Booking.VenueName : Booking.OrganizerName;
}
