namespace Steeple.Api.Services.Availability;
/// <summary>
/// Pure venue-local interval math for guest availability (sibling to
/// <see cref="Bookings.ScheduleMaterializer"/>): subtracts confirmed busy time from a room's open
/// windows and classifies a proposed occurrence against the room's rules. All inputs are
/// venue-local wall-clock <see cref="TimeOnly"/>/<see cref="DateOnly"/> with <c>[start, end)</c>
/// semantics — a busy interval ending exactly at a slot's start does <b>not</b> clash. UTC→local
/// conversion happens in callers per occurrence (DST is resolved there), never here, so every case
/// is unit-testable without a clock or a database.
/// </summary>
public static class AvailabilityCalculator
{
    /// <summary>
    /// The free windows left after removing <paramref name="busy"/> from <paramref name="open"/>.
    /// Open windows are treated as non-overlapping (the rules validator guarantees it); busy
    /// intervals may overlap or touch and are merged first. Output is sorted by start and any
    /// touching free segments are merged, so <c>[)</c> adjacency never yields zero-length gaps.
    /// </summary>
    public static IReadOnlyList<(TimeOnly Start, TimeOnly End)> SubtractWindows(
        IReadOnlyList<(TimeOnly Start, TimeOnly End)> open,
        IReadOnlyList<(TimeOnly Start, TimeOnly End)> busy)
    {
        var mergedBusy = Merge(busy);
        var free = new List<(TimeOnly Start, TimeOnly End)>();

        foreach (var (openStart, openEnd) in open.OrderBy(w => w.Start))
        {
            var cursor = openStart;
            foreach (var (busyStart, busyEnd) in mergedBusy)
            {
                if (busyEnd <= cursor)
                {
                    continue; // entirely before the remaining open span
                }

                if (busyStart >= openEnd)
                {
                    break; // no later busy interval can overlap this open window
                }

                if (busyStart > cursor)
                {
                    free.Add((cursor, busyStart));
                }

                if (busyEnd > cursor)
                {
                    cursor = busyEnd;
                }
            }

            if (cursor < openEnd)
            {
                free.Add((cursor, openEnd));
            }
        }

        // Merge touching/adjacent free segments (e.g. from back-to-back open windows) into one.
        return Merge(free);
    }

    /// <summary>
    /// Why a proposed occurrence can't happen, or <c>null</c> when it fits. Precedence (highest
    /// first): <c>"blackout"</c> (the date is closed outright), then <c>"outsideOpenHours"</c>
    /// (the slot doesn't fit entirely within a single open window), then <c>"booked"</c> (the slot
    /// <c>[)</c>-intersects a confirmed busy interval on that date).
    /// </summary>
    public static string? ClassifyOccurrence(
        DateOnly date,
        TimeOnly start,
        TimeOnly end,
        AvailabilityRules rules,
        IReadOnlyList<(TimeOnly Start, TimeOnly End)> busyLocalIntervalsForDate)
    {
        if (rules.BlackoutDates.Contains(date))
        {
            return "blackout";
        }

        var openWindows = rules.OpenHoursByWeekday.GetValueOrDefault(date.DayOfWeek) ?? [];
        if (!openWindows.Any(w => start >= w.Start && end <= w.End))
        {
            // Must fit inside ONE window: a slot spanning two touching open windows is still outside.
            return "outsideOpenHours";
        }

        if (busyLocalIntervalsForDate.Any(b => start < b.End && b.Start < end))
        {
            return "booked";
        }

        return null;
    }

    /// <summary>Sorts by start and coalesces overlapping or touching intervals into a minimal set.</summary>
    private static List<(TimeOnly Start, TimeOnly End)> Merge(IReadOnlyList<(TimeOnly Start, TimeOnly End)> intervals)
    {
        var merged = new List<(TimeOnly Start, TimeOnly End)>();
        foreach (var interval in intervals.OrderBy(i => i.Start).ThenBy(i => i.End))
        {
            if (merged.Count > 0 && interval.Start <= merged[^1].End)
            {
                var last = merged[^1];
                if (interval.End > last.End)
                {
                    merged[^1] = (last.Start, interval.End);
                }
            }
            else
            {
                merged.Add(interval);
            }
        }

        return merged;
    }
}

/// <summary>
/// The venue-local rule inputs <see cref="AvailabilityCalculator.ClassifyOccurrence"/> reads:
/// blackout dates and open windows keyed by weekday. <see cref="HasRules"/> is false for a legacy
/// room with no declared availability — callers treat every occurrence as available in that case.
/// </summary>
public sealed record AvailabilityRules(
    IReadOnlySet<DateOnly> BlackoutDates,
    IReadOnlyDictionary<DayOfWeek, IReadOnlyList<(TimeOnly Start, TimeOnly End)>> OpenHoursByWeekday)
{
    /// <summary>Whether the room declares any open hours or blackouts at all.</summary>
    public bool HasRules => BlackoutDates.Count > 0 || OpenHoursByWeekday.Count > 0;
}
