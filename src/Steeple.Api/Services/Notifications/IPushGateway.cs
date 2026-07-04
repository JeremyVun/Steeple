
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: FCM push delivery (CONTRACTS §9). Sends **data messages only** — no notification block —
/// so clients always render from the inbox row, never from push content. Implementations must be
/// safe to fire-and-forget: they throw only for programming errors, and report delivery failures
/// (including invalid/unregistered tokens) by logging.
/// </summary>
public interface IPushGateway
{
    /// <summary>Sends one data message to every token, best-effort.</summary>
    Task SendAsync(IReadOnlyList<string> fcmTokens, PushMessage message, CancellationToken ct = default);
}

/// <summary>
/// The FCM data-message payload (CONTRACTS §9): <paramref name="NotificationId"/> is the
/// recipient's own inbox row id — the client fetches/renders from the inbox, this only points at it.
/// </summary>
public sealed record PushMessage(string NotificationId, string Type, string DeepLink);
