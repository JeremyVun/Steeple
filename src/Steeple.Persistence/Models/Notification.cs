
namespace Steeple.Persistence.Models;
/// <summary>
/// One inbox row for a user-facing event (SYSTEM_DESIGN §8 — inbox = truth). Email/push
/// fan-out is best-effort on top of this row.
/// </summary>
public class Notification
{
    /// <summary>Primary key.</summary>
    public Guid Id { get; set; }

    /// <summary>Foreign key to the recipient.</summary>
    public Guid UserId { get; set; }

    /// <summary>What kind of event this row announces.</summary>
    public NotificationType Type { get; set; }

    /// <summary>The event's JSON document, rendered by clients.</summary>
    public string PayloadJson { get; set; } = "";

    /// <summary>Creation timestamp (UTC).</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>When the recipient read this notification; null while unread.</summary>
    public DateTimeOffset? ReadAtUtc { get; set; }

    /// <summary>Navigation to the recipient.</summary>
    public User? User { get; set; }
}
