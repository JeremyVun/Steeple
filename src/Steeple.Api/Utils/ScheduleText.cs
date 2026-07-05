namespace Steeple.Api.Utils;
/// <summary>
/// Email-copy formatting for weekday sets ("Tuesdays and Thursdays") — clients humanize wire
/// tokens themselves; this exists only for server-composed email text.
/// </summary>
public static class ScheduleText
{
    /// <summary>"Tuesdays", "Tuesdays and Thursdays", "Mondays, Tuesdays and Fridays" (Sunday-first order).</summary>
    public static string DescribeDays(Weekdays days)
    {
        var names = Enum.GetValues<Weekdays>()
            .Where(day => day != Weekdays.None && days.HasFlag(day))
            .Select(day => $"{day}s")
            .ToList();

        return names.Count switch
        {
            0 => "",
            1 => names[0],
            2 => $"{names[0]} and {names[1]}",
            _ => $"{string.Join(", ", names[..^1])} and {names[^1]}",
        };
    }
}
