namespace Steeple.Persistence.Models;
/// <summary>
/// One row in the reminder sent-ledger: this occurrence has had this nudge. The unique
/// (occurrence, kind) key is what makes the reminder worker idempotent — it claims the row before
/// dispatching, so a re-run finds the claim and stays quiet (015-reminders.sql).
/// </summary>
public class BookingReminder
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the occurrence being reminded about.</summary>
    public Guid OccurrenceId { get; set; }

    /// <summary>Which nudge this row claims.</summary>
    public BookingReminderKind Kind { get; set; }

    /// <summary>When the claim was made (UTC) — effectively when it was sent.</summary>
    public DateTimeOffset SentAtUtc { get; set; }

    /// <summary>Navigation to the occurrence.</summary>
    public BookingOccurrence? Occurrence { get; set; }
}
