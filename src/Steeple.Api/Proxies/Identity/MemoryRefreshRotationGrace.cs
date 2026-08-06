using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Identity;
/// <summary>
/// In-process adapter for <see cref="IRefreshRotationGrace"/>: a concurrent dictionary of
/// {presented token hash → the pair it rotated into}, each entry living only for
/// <see cref="AuthOptions.RefreshReuseGraceSeconds"/>.
///
/// In-memory on purpose. The entries hold *raw* successor tokens for a few seconds, which is
/// exactly the material the database deliberately does not keep — writing them to Postgres would
/// undo the reason refresh tokens are stored hashed at all. The deployment is a single API
/// instance (SYSTEM_DESIGN §2's lean ceiling), and the cost of being wrong is bounded: a restart
/// mid-race, or a second instance, degrades to today's behaviour — the losing tab is signed out.
/// Never to a security hole, because the database's conditional rotation still decides who really
/// rotated (<see cref="IIdentityRepository.TryReplaceRefreshTokenAsync"/>).
/// </summary>
public sealed class MemoryRefreshRotationGrace : IRefreshRotationGrace
{
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly TimeProvider _clock;
    private readonly AuthOptions _options;

    /// <summary>Creates the cache.</summary>
    public MemoryRefreshRotationGrace(IOptions<AuthOptions> options, TimeProvider clock)
    {
        _options = options.Value;
        _clock = clock;
    }

    /// <inheritdoc />
    public RefreshResponse Claim(string presentedTokenHash, Guid userId, Guid familyId, RefreshResponse candidate)
    {
        if (_options.RefreshReuseGraceSeconds <= 0)
        {
            return candidate;
        }

        var now = _clock.GetUtcNow();
        Sweep(now);
        var mine = new Entry(candidate, userId, familyId, now.AddSeconds(_options.RefreshReuseGraceSeconds));

        // AddOrUpdate rather than GetOrAdd: an entry that has aged out of the window belongs to a
        // rotation that is over, and the next caller is starting a new one.
        var held = _entries.AddOrUpdate(
            presentedTokenHash,
            mine,
            (_, existing) => existing.ExpiresAtUtc > now ? existing : mine);

        return held.Response;
    }

    /// <inheritdoc />
    public RefreshResponse? Recall(string presentedTokenHash) =>
        _entries.TryGetValue(presentedTokenHash, out var entry) && entry.ExpiresAtUtc > _clock.GetUtcNow()
            ? entry.Response
            : null;

    /// <inheritdoc />
    public void Release(string presentedTokenHash) => _entries.TryRemove(presentedTokenHash, out _);

    /// <inheritdoc />
    public void ForgetFamily(Guid familyId) => Forget(entry => entry.FamilyId == familyId);

    /// <inheritdoc />
    public void ForgetUser(Guid userId) => Forget(entry => entry.UserId == userId);

    private void Forget(Func<Entry, bool> matches)
    {
        foreach (var pair in _entries)
        {
            if (matches(pair.Value))
            {
                _entries.TryRemove(pair);
            }
        }
    }

    /// <summary>
    /// Drops expired entries opportunistically. Nothing here justifies a background timer: the map
    /// only grows when someone refreshes, so the only moment it can need trimming is a refresh.
    /// </summary>
    private void Sweep(DateTimeOffset now)
    {
        foreach (var pair in _entries)
        {
            if (pair.Value.ExpiresAtUtc <= now)
            {
                _entries.TryRemove(pair);
            }
        }
    }

    private sealed record Entry(RefreshResponse Response, Guid UserId, Guid FamilyId, DateTimeOffset ExpiresAtUtc);
}
