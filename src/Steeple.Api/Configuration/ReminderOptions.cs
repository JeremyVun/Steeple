namespace Steeple.Api.Configuration;
/// <summary>
/// Upcoming-booking reminder worker settings. Defaults are the product behaviour; the knobs exist
/// so a local loop or a test can run the sweep on a short cadence without waiting a quarter hour.
/// </summary>
public sealed class ReminderOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Reminders";

    /// <summary>Runs the sweep at all. Off leaves the notifications untouched (nothing else changes).</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>How often the sweep runs. Reminders are day-grained, so a quarter hour is ample.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromMinutes(15);

    /// <summary>
    /// How far ahead the "coming up" nudge fires, for the booking's first upcoming occurrence only.
    /// </summary>
    public TimeSpan ComingUpLeadTime { get; set; } = TimeSpan.FromDays(7);

    /// <summary>How far ahead the "tomorrow" nudge fires, for every occurrence.</summary>
    public TimeSpan TomorrowLeadTime { get; set; } = TimeSpan.FromHours(24);
}
