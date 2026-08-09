
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: FCM push delivery (CONTRACTS §9). Sends **data messages only** — no notification block —
/// so clients always render from the inbox row, never from push content. Implementations throw on
/// retryable provider failure so the outbox worker can persist retry state; an unregistered token
/// is cleaned up and treated as a successful terminal no-op.
/// </summary>
public interface IPushGateway
{
    /// <summary>Sends one data message to every token.</summary>
    Task SendAsync(IReadOnlyList<string> fcmTokens, PushMessage message, CancellationToken ct = default);
}

/// <summary>
/// The FCM data-message payload (CONTRACTS §9): <paramref name="NotificationId"/> is the
/// recipient's own inbox row id — the client fetches/renders from the inbox, this only points at it.
/// </summary>
public sealed record PushMessage(string NotificationId, string Type, string DeepLink);
