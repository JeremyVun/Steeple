using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// <see cref="IPushGateway"/> adapter used whenever FCM isn't configured (no
/// <c>Push:ServiceAccountJsonPath</c>/<c>Push:ServiceAccountJson</c>) — logs the intended sends
/// instead of delivering them (dev-friendly; mirrors how <see cref="ResendEmailGateway"/> falls
/// back to log-only mode without a configured key). The inbox row is the record of truth either way.
/// </summary>
public sealed class LoggingPushGateway : IPushGateway
{
    private readonly ILogger<LoggingPushGateway> _logger;

    /// <summary>Creates the gateway over the given logger.</summary>
    public LoggingPushGateway(ILogger<LoggingPushGateway> logger) => _logger = logger;

    /// <inheritdoc />
    public Task SendAsync(IReadOnlyList<string> fcmTokens, PushMessage message, CancellationToken ct = default)
    {
        if (fcmTokens.Count == 0)
        {
            return Task.CompletedTask;
        }

        _logger.LogInformation(
            "Push (log-only mode, no Push:ServiceAccountJson[Path]): tokens={TokenCount} type={Type} notificationId={NotificationId} deepLink={DeepLink}",
            fcmTokens.Count, message.Type, message.NotificationId, message.DeepLink);

        return Task.CompletedTask;
    }
}
