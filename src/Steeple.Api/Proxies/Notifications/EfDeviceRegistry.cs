using Microsoft.EntityFrameworkCore;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>EF Core adapter for <see cref="IDeviceRegistry"/> over the <c>devices</c> table.</summary>
public sealed class EfDeviceRegistry : IDeviceRegistry
{
    private static readonly string[] ValidPlatforms = ["ios", "android", "web"];
    private const int MaxFcmTokenLength = 512;

    private readonly SteepleDbContext _db;
    private readonly TimeProvider _clock;

    /// <summary>Creates the registry over the EF context.</summary>
    public EfDeviceRegistry(SteepleDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<bool> RegisterAsync(Guid userId, string fcmToken, string platform, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(fcmToken)
            || fcmToken.Length > MaxFcmTokenLength
            || !ValidPlatforms.Contains(platform))
        {
            return false;
        }

        var now = _clock.GetUtcNow();
        var existing = await _db.Devices.SingleOrDefaultAsync(d => d.FcmToken == fcmToken, ct).ConfigureAwait(false);

        if (existing is null)
        {
            _db.Devices.Add(new Device
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                FcmToken = fcmToken,
                Platform = platform,
                CreatedAtUtc = now,
                LastSeenAtUtc = now,
            });
        }
        else
        {
            // Re-registration moves the token to the current caller (e.g. a shared/handed-down
            // device signing in as someone else) — the previous owner simply stops getting pushed.
            existing.UserId = userId;
            existing.Platform = platform;
            existing.LastSeenAtUtc = now;
        }

        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        return true;
    }

    /// <inheritdoc />
    public async Task UnregisterAsync(Guid userId, string fcmToken, CancellationToken ct = default) =>
        await _db.Devices
            .Where(d => d.UserId == userId && d.FcmToken == fcmToken)
            .ExecuteDeleteAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<IReadOnlyList<string>> GetTokensAsync(Guid userId, CancellationToken ct = default) =>
        await _db.Devices
            .Where(d => d.UserId == userId)
            .Select(d => d.FcmToken)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task DeleteByTokenAsync(string fcmToken, CancellationToken ct = default) =>
        await _db.Devices
            .Where(d => d.FcmToken == fcmToken)
            .ExecuteDeleteAsync(ct)
            .ConfigureAwait(false);
}
