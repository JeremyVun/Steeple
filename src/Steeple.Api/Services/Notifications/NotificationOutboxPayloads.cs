namespace Steeple.Api.Services.Notifications;

/// <summary>Durable email envelope stored in a notification outbox payload.</summary>
public sealed record EmailOutboxPayload(
    string ToEmail,
    string Subject,
    string TextBody,
    string? HtmlBody);

/// <summary>
/// Durable push envelope. Tokens are resolved at delivery time so a logout/unregister before the
/// worker runs prevents delivery to a device the account no longer owns.
/// </summary>
public sealed record PushOutboxPayload(
    Guid UserId,
    string NotificationId,
    string Type,
    string DeepLink);
