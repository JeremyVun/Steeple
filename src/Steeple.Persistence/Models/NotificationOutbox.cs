namespace Steeple.Persistence.Models;

/// <summary>
/// Durable external-delivery work written atomically with a notification inbox row. Delivery is
/// at-least-once: a worker lease makes abandoned work retryable after process loss.
/// </summary>
public class NotificationOutbox
{
    /// <summary>Primary key and delivery-work identity.</summary>
    public Guid Id { get; set; }

    /// <summary>Email or push.</summary>
    public NotificationOutboxChannel Channel { get; set; }

    /// <summary>The notification event type, available for operational filtering.</summary>
    public NotificationType Kind { get; set; }

    /// <summary>Channel-specific delivery envelope as JSON.</summary>
    public string PayloadJson { get; set; } = "";

    /// <summary>When the work was decided and persisted.</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Number of leases/delivery attempts, including the current one.</summary>
    public int Attempts { get; set; }

    /// <summary>When an unfinished row may next be claimed.</summary>
    public DateTimeOffset NextAttemptAtUtc { get; set; }

    /// <summary>Bounded diagnostic from the most recent provider failure.</summary>
    public string? LastError { get; set; }

    /// <summary>When the provider accepted the delivery; null until successful.</summary>
    public DateTimeOffset? DeliveredAtUtc { get; set; }

    /// <summary>When bounded retries were exhausted; null while retryable.</summary>
    public DateTimeOffset? FailedAtUtc { get; set; }
}
