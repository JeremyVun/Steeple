using FirebaseAdmin.Messaging;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// <see cref="IPushGateway"/> adapter over the FirebaseAdmin SDK (Apache-2.0, $0 — SYSTEM_DESIGN
/// §17 decision log). Sends FCM **data messages only** (CONTRACTS §9): no notification block, so
/// the client always renders from the inbox row. An unregistered/invalid token deletes that device
/// row (best-effort) so the registry stops sending to a dead device; every failure is logged, never
/// thrown — callers fire-and-forget this gateway.
/// </summary>
public sealed class FcmPushGateway : IPushGateway
{
    private readonly FirebaseMessaging _messaging;
    private readonly IDeviceRegistry _devices;
    private readonly ILogger<FcmPushGateway> _logger;

    /// <summary>Creates the gateway over an already-initialized <see cref="FirebaseAdmin.FirebaseApp"/>.</summary>
    public FcmPushGateway(FirebaseAdmin.FirebaseApp app, IDeviceRegistry devices, ILogger<FcmPushGateway> logger)
    {
        _messaging = FirebaseMessaging.GetMessaging(app);
        _devices = devices;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task SendAsync(IReadOnlyList<string> fcmTokens, PushMessage message, CancellationToken ct = default)
    {
        foreach (var token in fcmTokens)
        {
            try
            {
                await _messaging.SendAsync(
                    new Message
                    {
                        Token = token,
                        // Data message only (CONTRACTS §9) — no Notification block, so the client
                        // always renders from the inbox row, never from push content.
                        Data = new Dictionary<string, string>
                        {
                            ["notificationId"] = message.NotificationId,
                            ["type"] = message.Type,
                            ["deepLink"] = message.DeepLink,
                        },
                    },
                    ct).ConfigureAwait(false);
            }
            catch (FirebaseMessagingException ex) when (ex.MessagingErrorCode == MessagingErrorCode.Unregistered)
            {
                // The app was uninstalled or the token rotated — stop sending to it.
                await DeleteDeadTokenSafelyAsync(token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "FCM send failed for a push token.");
            }
        }
    }

    private async Task DeleteDeadTokenSafelyAsync(string token)
    {
        try
        {
            await _devices.DeleteByTokenAsync(token, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete a dead push-device token.");
        }
    }
}
