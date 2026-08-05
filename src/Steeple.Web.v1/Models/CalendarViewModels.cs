using System.Globalization;

namespace Steeple.Web.Models;

// ------------------------------------------------------------------------------------------------
// Venue calendar (CONTRACTS §6 "Host review & venue calendar", DESIGN_SYSTEM §8.13 tokens). A
// read-and-navigate provider surface: confirmed occurrences as solid lanes, undecided applications
// as a dashed pending overlay. All placement is computed server-side from the venue-local calendar
// payload — the grid always renders exactly what the API returned (no client re-derivation).
// ------------------------------------------------------------------------------------------------

/// <summary>The venue calendar page/partial model: the fetched window plus the nav state.</summary>
public sealed record CalendarViewModel
{
    /// <summary>Venues the caller manages (drives the venue picker; empty ⇒ onboarding).</summary>
    public required IReadOnlyList<ManagedVenueDto> Venues { get; init; }

    /// <summary>The venue currently shown.</summary>
    public required Guid SelectedVenueId { get; init; }

    /// <summary>"week" | "month".</summary>
    public required string View { get; init; }

    /// <summary>Any date inside the shown week (week view) / the shown month (month view).</summary>
    public required DateOnly Anchor { get; init; }

    /// <summary>Venue-local "today" (highlights the current day, never navigates before it visually).</summary>
    public required DateOnly Today { get; init; }

    /// <summary>The active room filter, or null for "all rooms".</summary>
    public Guid? RoomFilter { get; init; }

    /// <summary>The fetched calendar window, or null when the venue has none / the API is unreachable.</summary>
    public VenueCalendarDto? Calendar { get; init; }

    public bool IsMonth => View == "month";
    public bool HasMultipleVenues => Venues.Count > 1;
    public string SelectedVenueName => Venues.FirstOrDefault(v => v.Id == SelectedVenueId)?.Name ?? "";
    public string SelectedVenueSlug => Venues.FirstOrDefault(v => v.Id == SelectedVenueId)?.Slug ?? "";

    /// <summary>Every room the calendar knows about (for the room-filter chips).</summary>
    public IReadOnlyList<CalendarRoomDto> AllRooms => Calendar?.Rooms ?? [];

    /// <summary>The room lanes actually drawn (all, or the single filtered room).</summary>
    public IReadOnlyList<CalendarRoomDto> VisibleRooms =>
        RoomFilter is { } r ? AllRooms.Where(x => x.Id == r).ToList() : AllRooms;

    public bool ShowRoomLabels => VisibleRooms.Count > 1;

    /// <summary>True when the venue has rooms but nothing lands in the shown range.</summary>
    public bool IsEmptyRange =>
        Calendar is not null
        && (Calendar.Occurrences.Count == 0 && Calendar.Pending.Count == 0
            || VisibleDays.All(d => OccurrencesFor(d).Count == 0 && PendingFor(d).Count == 0));

    // --- Range geometry (Sunday-first, mirrors the availability calendar) -------------------------

    /// <summary>Sunday that opens the shown week.</summary>
    public DateOnly WeekStart => Anchor.AddDays(-(int)Anchor.DayOfWeek);

    /// <summary>First day of the shown month.</summary>
    public DateOnly MonthFirst => new(Anchor.Year, Anchor.Month, 1);

    private DateOnly MonthLast => MonthFirst.AddMonths(1).AddDays(-1);

    /// <summary>Sunday on/before the 1st (the month grid's leading edge).</summary>
    public DateOnly MonthGridStart => MonthFirst.AddDays(-(int)MonthFirst.DayOfWeek);

    /// <summary>Saturday on/after the last day, capped to 6 weeks (42 days) per fetch.</summary>
    public DateOnly MonthGridEnd
    {
        get
        {
            var end = MonthLast.AddDays(6 - (int)MonthLast.DayOfWeek);
            var capped = MonthGridStart.AddDays(41);
            return end < capped ? end : capped;
        }
    }

    /// <summary>The range fetched from the API (≤ 6 weeks).</summary>
    public DateOnly RangeStart => IsMonth ? MonthGridStart : WeekStart;
    public DateOnly RangeEnd => IsMonth ? MonthGridEnd : WeekStart.AddDays(6);

    /// <summary>Every day in the shown range, in reading order.</summary>
    public IReadOnlyList<DateOnly> VisibleDays
    {
        get
        {
            var days = new List<DateOnly>();
            for (var d = RangeStart; d <= RangeEnd; d = d.AddDays(1))
            {
                days.Add(d);
            }

            return days;
        }
    }

    /// <summary>The month grid chunked into weeks of 7 (each a row).</summary>
    public IReadOnlyList<IReadOnlyList<DateOnly>> MonthWeeks =>
        VisibleDays.Chunk(7).Select(w => (IReadOnlyList<DateOnly>)w).ToList();

    // --- Navigation targets ----------------------------------------------------------------------

    public DateOnly PrevAnchor => IsMonth ? MonthFirst.AddMonths(-1) : WeekStart.AddDays(-7);
    public DateOnly NextAnchor => IsMonth ? MonthFirst.AddMonths(1) : WeekStart.AddDays(7);

    /// <summary>"Sep 7 – 13, 2026" (week) / "September 2026" (month).</summary>
    public string Heading
    {
        get
        {
            if (IsMonth)
            {
                return MonthFirst.ToString("MMMM yyyy", CultureInfo.InvariantCulture);
            }

            var end = WeekStart.AddDays(6);
            var startText = WeekStart.ToString("MMM d", CultureInfo.InvariantCulture);
            var endText = WeekStart.Month == end.Month
                ? end.ToString("d, yyyy", CultureInfo.InvariantCulture)
                : end.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);
            return $"{startText} – {endText}";
        }
    }

    /// <summary>Builds the <c>/manage/calendar?…</c> query for a nav/filter link (venue/view/anchor/room).</summary>
    public string Link(Guid? venue = null, string? view = null, DateOnly? start = null, Guid? room = null, bool clearRoom = false)
    {
        var v = venue ?? SelectedVenueId;
        var mode = view ?? View;
        var anchor = start ?? Anchor;
        var parts = new List<string>
        {
            $"venue={v}",
            $"view={mode}",
            $"start={anchor:yyyy-MM-dd}",
        };

        var roomValue = clearRoom ? (Guid?)null : room ?? RoomFilter;
        if (roomValue is { } rid)
        {
            parts.Add($"room={rid}");
        }

        return "?" + string.Join("&", parts);
    }

    // --- Placement helpers -----------------------------------------------------------------------

    /// <summary>Confirmed occurrences for a room on a date, earliest first.</summary>
    public IReadOnlyList<CalendarOccurrenceDto> OccurrencesFor(Guid roomId, DateOnly date) =>
        (Calendar?.Occurrences ?? [])
            .Where(o => o.RoomId == roomId && o.LocalDate == date)
            .OrderBy(o => o.StartTime, StringComparer.Ordinal)
            .ToList();

    /// <summary>Pending (undecided) applications projected onto a room's date, earliest first.</summary>
    public IReadOnlyList<CalendarPendingDto> PendingFor(Guid roomId, DateOnly date) =>
        (Calendar?.Pending ?? [])
            .Where(p => p.RoomId == roomId && p.Dates.Contains(date))
            .OrderBy(p => p.StartTime, StringComparer.Ordinal)
            .ToList();

    /// <summary>All confirmed occurrences on a date across the visible rooms (agenda / month dots).</summary>
    public IReadOnlyList<CalendarOccurrenceDto> OccurrencesFor(DateOnly date) =>
        VisibleRooms.SelectMany(r => OccurrencesFor(r.Id, date)).ToList();

    /// <summary>All pending overlays on a date across the visible rooms (agenda / month dots).</summary>
    public IReadOnlyList<CalendarPendingDto> PendingFor(DateOnly date) =>
        VisibleRooms.SelectMany(r => PendingFor(r.Id, date)).ToList();

    public string RoomName(Guid roomId) => AllRooms.FirstOrDefault(r => r.Id == roomId)?.Name ?? "Room";

    /// <summary>"6:00–9:00 PM" venue-local range (§10 voice).</summary>
    public static string TimeRange(string start, string end) => ApplicationDisplay.FormatTimeRange(start, end);
}
