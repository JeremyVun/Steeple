
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: push-device registrations (CONTRACTS §4 <c>/me/devices</c>) — the register/unregister
/// use-cases plus the lookup the push fan-out needs. Registration upserts by <c>fcmToken</c>: a
/// token re-registered under a different account moves to that account (the previous owner's
/// push for it simply stops — the same token can only ever belong to one signed-in device).
/// </summary>
public interface IDeviceRegistry
{
    /// <summary>
    /// Validates and upserts a registration for <paramref name="userId"/>. Returns false (nothing
    /// persisted) when <paramref name="platform"/> isn't <c>ios</c>/<c>android</c>/<c>web</c> or
    /// <paramref name="fcmToken"/> is empty or over 512 chars (CONTRACTS §4 <c>invalid_device</c>).
    /// </summary>
    Task<bool> RegisterAsync(Guid userId, string fcmToken, string platform, CancellationToken ct = default);

    /// <summary>Deletes the token if owned by <paramref name="userId"/>; a no-op otherwise (always succeeds from the caller's view).</summary>
    Task UnregisterAsync(Guid userId, string fcmToken, CancellationToken ct = default);

    /// <summary>The user's currently registered FCM tokens (the push fan-out's send list).</summary>
    Task<IReadOnlyList<string>> GetTokensAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Deletes one device by its token, regardless of owner — used when FCM reports a token as
    /// unregistered/invalid so the registry doesn't keep sending to a dead device.
    /// </summary>
    Task DeleteByTokenAsync(string fcmToken, CancellationToken ct = default);
}
