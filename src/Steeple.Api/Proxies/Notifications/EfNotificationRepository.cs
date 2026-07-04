using Microsoft.EntityFrameworkCore;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>EF Core adapter for <see cref="INotificationRepository"/>.</summary>
public class EfNotificationRepository : INotificationRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the EF context.</summary>
    public EfNotificationRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task AddRangeAsync(IReadOnlyList<Notification> notifications, CancellationToken ct = default)
    {
        _db.Notifications.AddRange(notifications);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<Notification>> GetPageAsync(
        Guid userId, DateTimeOffset? beforeCreatedAtUtc, Guid? beforeId, int limit, CancellationToken ct = default)
    {
        var query = _db.Notifications.AsNoTracking().Where(n => n.UserId == userId);

        if (beforeCreatedAtUtc is { } createdAt && beforeId is { } id)
        {
            // Strictly older than the cursor position; the Id tiebreak keeps same-instant batch
            // inserts (one fan-out writing several rows) from being skipped or repeated.
            query = query.Where(n =>
                n.CreatedAtUtc < createdAt || (n.CreatedAtUtc == createdAt && n.Id.CompareTo(id) < 0));
        }

        return await query
            .OrderByDescending(n => n.CreatedAtUtc)
            .ThenByDescending(n => n.Id)
            .Take(limit)
            .ToListAsync(ct)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        await _db.Notifications
            .Where(n => n.UserId == userId && ids.Contains(n.Id) && n.ReadAtUtc == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(n => n.ReadAtUtc, now), ct)
            .ConfigureAwait(false);
    }
}
