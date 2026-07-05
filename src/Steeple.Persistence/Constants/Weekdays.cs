namespace Steeple.Persistence.Constants;
/// <summary>
/// Bitwise set of weekdays for recurring schedules ("Tuesdays and Thursdays"). Bit n is
/// <c>1 &lt;&lt; (int)System.DayOfWeek</c>, so Sunday is bit 0 — the same 0=Sunday convention the
/// schedule columns have always used.
/// </summary>
[Flags]
public enum Weekdays : int
{
    /// <summary>No weekdays specified.</summary>
    None = 0,
    Sunday = 1,
    Monday = 2,
    Tuesday = 4,
    Wednesday = 8,
    Thursday = 16,
    Friday = 32,
    Saturday = 64
}
