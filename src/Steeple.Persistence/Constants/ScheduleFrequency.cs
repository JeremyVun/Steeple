
namespace Steeple.Persistence.Constants;
/// <summary>
/// How often an application's proposed schedule repeats. Recurrence is always bounded — a
/// recurring application must carry an end date (SYSTEM_DESIGN §5 invariants).
/// </summary>
public enum ScheduleFrequency
{
    /// <summary>A single date.</summary>
    OneOff = 0,

    /// <summary>The same weekday and time window every week from start to end date.</summary>
    RecurringWeekly = 1,
}
