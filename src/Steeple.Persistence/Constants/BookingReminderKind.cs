namespace Steeple.Persistence.Constants;
/// <summary>
/// Which upcoming-booking nudge a <see cref="Models.BookingReminder"/> ledger row records. The
/// two kinds have deliberately different scopes so a weekly recurring booking isn't emailed twice
/// a week (015-reminders.sql).
/// </summary>
public enum BookingReminderKind
{
    /// <summary>A week out, for the booking's first upcoming occurrence only.</summary>
    ComingUp = 0,

    /// <summary>The day before — sent for every occurrence.</summary>
    Tomorrow = 1,
}
