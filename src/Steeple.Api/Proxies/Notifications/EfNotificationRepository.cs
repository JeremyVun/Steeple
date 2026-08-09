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
    public async Task AddRangeAsync(
        IReadOnlyList<Notification> notifications,
        IReadOnlyList<NotificationOutbox> deliveries,
        CancellationToken ct = default)
    {
        _db.Notifications.AddRange(notifications);
        _db.NotificationOutbox.AddRange(deliveries);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<NotificationOutbox>> ClaimDueAsync(
        DateTimeOffset nowUtc,
        int limit,
        TimeSpan lease,
        CancellationToken ct = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);

        var rows = await _db.NotificationOutbox
            .FromSqlInterpolated($$"""
                SELECT *
                FROM notification_outbox
                WHERE "DeliveredAtUtc" IS NULL
                  AND "FailedAtUtc" IS NULL
                  AND "NextAttemptAtUtc" <= {{nowUtc}}
                ORDER BY "NextAttemptAtUtc", "CreatedAtUtc", "Id"
                FOR UPDATE SKIP LOCKED
                LIMIT {{limit}}
                """)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        var leaseUntil = nowUtc + lease;
        foreach (var row in rows)
        {
            row.Attempts++;
            row.NextAttemptAtUtc = leaseUntil;
        }

        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        await transaction.CommitAsync(ct).ConfigureAwait(false);
        return rows;
    }

    /// <inheritdoc />
    public Task MarkDeliveredAsync(Guid id, DateTimeOffset deliveredAtUtc, CancellationToken ct = default) =>
        _db.NotificationOutbox
            .Where(row => row.Id == id && row.DeliveredAtUtc == null && row.FailedAtUtc == null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(row => row.DeliveredAtUtc, deliveredAtUtc)
                    .SetProperty(row => row.LastError, (string?)null),
                ct);

    /// <inheritdoc />
    public Task RecordFailureAsync(
        Guid id,
        string error,
        DateTimeOffset nextAttemptAtUtc,
        DateTimeOffset? failedAtUtc,
        CancellationToken ct = default) =>
        _db.NotificationOutbox
            .Where(row => row.Id == id && row.DeliveredAtUtc == null && row.FailedAtUtc == null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(row => row.LastError, error)
                    .SetProperty(row => row.NextAttemptAtUtc, nextAttemptAtUtc)
                    .SetProperty(row => row.FailedAtUtc, failedAtUtc),
                ct);

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
