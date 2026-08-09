using FirebaseAdmin.Messaging;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// <see cref="IPushGateway"/> adapter over the FirebaseAdmin SDK (Apache-2.0, $0 — SYSTEM_DESIGN
/// §17 decision log). Sends FCM **data messages only** (CONTRACTS §9): no notification block, so
/// the client always renders from the inbox row. An unregistered/invalid token deletes that device
/// row (best-effort) so the registry stops sending to a dead device; other failures throw so the
/// durable outbox worker can retry. Registered as a <b>singleton</b> because FirebaseMessaging is
/// process-wide; dead-token cleanup opens its own service scope for a fresh device registry.
/// </summary>
public sealed class FcmPushGateway : IPushGateway
{
    private readonly FirebaseMessaging _messaging;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<FcmPushGateway> _logger;

    /// <summary>Creates the gateway over an already-initialized <see cref="FirebaseAdmin.FirebaseApp"/>.</summary>
    public FcmPushGateway(FirebaseAdmin.FirebaseApp app, IServiceScopeFactory scopes, ILogger<FcmPushGateway> logger)
    {
        _messaging = FirebaseMessaging.GetMessaging(app);
        _scopes = scopes;
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
                throw;
            }
        }
    }

    private async Task DeleteDeadTokenSafelyAsync(string token)
    {
        try
        {
            // A fresh scope, not a captured registry: the singleton gateway cannot capture the
            // outbox worker's scoped DbContext.
            await using var scope = _scopes.CreateAsyncScope();
            var devices = scope.ServiceProvider.GetRequiredService<IDeviceRegistry>();
            await devices.DeleteByTokenAsync(token, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete a dead push-device token.");
        }
    }
}
