
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Fan-out on write (SYSTEM_DESIGN §8): atomically inserts inbox rows (the record of truth) and
/// durable email/push outbox rows. Provider work happens after commit in a background worker.
/// </summary>
public interface INotificationDispatcher
{
    /// <summary>
    /// Notifies each recipient: one inbox row and push delivery row each, plus an email delivery
    /// row where the recipient has an address and <paramref name="email"/> content is provided.
    /// </summary>
    /// <param name="payload">JSON-serialized (camelCase) into the inbox row's payload document.</param>
    Task NotifyAsync(
        IReadOnlyList<NotificationRecipient> recipients,
        NotificationType type,
        object payload,
        EmailContent? email,
        CancellationToken ct = default);
}

/// <summary>A notification target: the inbox user plus their email address (null = inbox only).</summary>
public sealed record NotificationRecipient(Guid UserId, string? Email);

/// <summary>
/// Transactional email content (CAN-SPAM transactional, no marketing). Plain text is the
/// contract; <paramref name="HtmlBody"/> is an optional richer alternative part — when set, both
/// parts are sent and must say the same thing. The dispatcher appends the deep-link CTA to
/// whichever parts are present (see <see cref="EmailCta"/>), so composition sites never build
/// URLs themselves.
/// </summary>
public sealed record EmailContent(string Subject, string TextBody, string? HtmlBody = null);
