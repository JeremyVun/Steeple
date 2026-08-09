using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Retention;

/// <summary>
/// Applies the owner-approved retention policy in bounded, oldest-first batches. Financial and
/// legal rows are never deletion targets: correspondence cleanup removes user-authored text while
/// preserving the application/booking/payment graph, and agreements are not queried at all.
/// </summary>
public sealed class DataRetentionService : IDataRetentionService
{
    private const int MaximumBatchSize = 500;

    private readonly SteepleDbContext _db;
    private readonly DataRetentionOptions _options;

    /// <summary>Creates the scoped sweep.</summary>
    public DataRetentionService(SteepleDbContext db, IOptions<DataRetentionOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    /// <inheritdoc />
    public async Task<DataRetentionSweepResult> RunOnceAsync(
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var batchSize = Math.Clamp(_options.BatchSize, 1, MaximumBatchSize);

        await using var transaction = await _db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);

        var refreshTokens = await DeleteRefreshTokensAsync(
            now - PositiveOrDefault(_options.RefreshTokenRetention, TimeSpan.FromDays(30)),
            batchSize,
            ct).ConfigureAwait(false);
        var notifications = await DeleteNotificationsAsync(
            now - PositiveOrDefault(_options.NotificationRetention, TimeSpan.FromDays(365)),
            batchSize,
            ct).ConfigureAwait(false);
        var idempotency = await DeleteIdempotencyAsync(
            now - PositiveOrDefault(_options.IdempotencyRetention, TimeSpan.FromDays(30)),
            batchSize,
            ct).ConfigureAwait(false);
        var correspondence = await DeleteCorrespondenceAsync(
            now - PositiveOrDefault(_options.CorrespondenceRetention, TimeSpan.FromDays(730)),
            batchSize,
            ct).ConfigureAwait(false);
        var outbox = await DeleteNotificationOutboxAsync(
            now - PositiveOrDefault(_options.NotificationOutboxRetention, TimeSpan.FromDays(30)),
            batchSize,
            ct).ConfigureAwait(false);

        await transaction.CommitAsync(ct).ConfigureAwait(false);
        return new DataRetentionSweepResult(refreshTokens, notifications, idempotency, correspondence, outbox);
    }

    private async Task<int> DeleteRefreshTokensAsync(
        DateTimeOffset cutoff,
        int limit,
        CancellationToken ct)
    {
        var ids = await _db.RefreshTokens
            .Where(token => token.RevokedAtUtc != null
                ? token.RevokedAtUtc <= cutoff
                : token.ExpiresAtUtc <= cutoff)
            .OrderBy(token => token.RevokedAtUtc ?? token.ExpiresAtUtc)
            .ThenBy(token => token.Id)
            .Select(token => token.Id)
            .Take(limit)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return ids.Count == 0
            ? 0
            : await _db.RefreshTokens.Where(token => ids.Contains(token.Id))
                .ExecuteDeleteAsync(ct).ConfigureAwait(false);
    }

    private async Task<int> DeleteNotificationsAsync(
        DateTimeOffset cutoff,
        int limit,
        CancellationToken ct)
    {
        var ids = await _db.Notifications
            .Where(notification => notification.CreatedAtUtc <= cutoff)
            .OrderBy(notification => notification.CreatedAtUtc)
            .ThenBy(notification => notification.Id)
            .Select(notification => notification.Id)
            .Take(limit)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return ids.Count == 0
            ? 0
            : await _db.Notifications.Where(notification => ids.Contains(notification.Id))
                .ExecuteDeleteAsync(ct).ConfigureAwait(false);
    }

    private async Task<int> DeleteIdempotencyAsync(
        DateTimeOffset cutoff,
        int limit,
        CancellationToken ct)
    {
        var records = await _db.IdempotencyRecords
            .Where(record => record.CreatedAtUtc <= cutoff)
            .OrderBy(record => record.CreatedAtUtc)
            .ThenBy(record => record.UserId)
            .ThenBy(record => record.Scope)
            .ThenBy(record => record.Key)
            .Take(limit)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        if (records.Count > 0)
        {
            _db.IdempotencyRecords.RemoveRange(records);
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        }

        var remaining = limit - records.Count;
        if (remaining == 0)
        {
            return records.Count;
        }

        var applicationIds = await _db.Applications
            .Where(application => application.IdempotencyKey != null && application.CreatedAtUtc <= cutoff)
            .OrderBy(application => application.CreatedAtUtc)
            .ThenBy(application => application.Id)
            .Select(application => application.Id)
            .Take(remaining)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        var cleared = applicationIds.Count == 0
            ? 0
            : await _db.Applications
                .Where(application => applicationIds.Contains(application.Id))
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(application => application.IdempotencyKey, (Guid?)null),
                    ct)
                .ConfigureAwait(false);

        return records.Count + cleared;
    }

    private async Task<int> DeleteCorrespondenceAsync(
        DateTimeOffset cutoff,
        int limit,
        CancellationToken ct)
    {
        var handled = 0;
        var closedApplicationIds = ClosedApplications(cutoff).Select(application => application.Id);

        var messageIds = await _db.ApplicationMessages
            .Where(message => message.SentAtUtc <= cutoff)
            .Where(message => closedApplicationIds.Contains(message.ApplicationId))
            .OrderBy(message => message.SentAtUtc)
            .ThenBy(message => message.Id)
            .Select(message => message.Id)
            .Take(limit)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (messageIds.Count > 0)
        {
            handled += await _db.ApplicationMessages
                .Where(message => messageIds.Contains(message.Id))
                .ExecuteDeleteAsync(ct)
                .ConfigureAwait(false);
        }

        if (handled >= limit)
        {
            return handled;
        }

        var applicationIds = await ClosedApplications(cutoff)
            .Where(application => application.IntentText != "" || application.OrganizationName != null)
            .OrderBy(application => application.CreatedAtUtc)
            .ThenBy(application => application.Id)
            .Select(application => application.Id)
            .Take(limit - handled)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (applicationIds.Count > 0)
        {
            handled += await _db.Applications
                .Where(application => applicationIds.Contains(application.Id))
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(application => application.IntentText, "")
                        .SetProperty(application => application.OrganizationName, (string?)null),
                    ct)
                .ConfigureAwait(false);
        }

        if (handled >= limit)
        {
            return handled;
        }

        var counterIds = await _db.ApplicationCounterOffers
            .Where(counter => counter.Message != null && counter.CreatedAtUtc <= cutoff)
            .Where(counter => closedApplicationIds.Contains(counter.ApplicationId))
            .OrderBy(counter => counter.CreatedAtUtc)
            .ThenBy(counter => counter.Id)
            .Select(counter => counter.Id)
            .Take(limit - handled)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (counterIds.Count > 0)
        {
            handled += await _db.ApplicationCounterOffers
                .Where(counter => counterIds.Contains(counter.Id))
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(counter => counter.Message, (string?)null),
                    ct)
                .ConfigureAwait(false);
        }

        if (handled >= limit)
        {
            return handled;
        }

        var bookingIds = await _db.Bookings
            .Where(booking => booking.CancelReason != null
                && booking.Status == BookingStatus.Cancelled
                && booking.CancelledAtUtc <= cutoff)
            .OrderBy(booking => booking.CancelledAtUtc)
            .ThenBy(booking => booking.Id)
            .Select(booking => booking.Id)
            .Take(limit - handled)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (bookingIds.Count > 0)
        {
            handled += await _db.Bookings
                .Where(booking => bookingIds.Contains(booking.Id))
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(booking => booking.CancelReason, (string?)null),
                    ct)
                .ConfigureAwait(false);
        }

        return handled;
    }

    /// <summary>
    /// Closure is judged on effective status, not stored status. Expiry is only persisted by a
    /// read path's lazy sweep, so an abandoned application nobody ever opens again stays stored
    /// <see cref="ApplicationStatus.Pending"/> forever — its deadline still closes the
    /// correspondence, and the two-year clock runs from <c>ExpiresAtUtc</c> either way.
    /// </summary>
    private IQueryable<Application> ClosedApplications(DateTimeOffset cutoff) =>
        _db.Applications
            .Where(application => application.CreatedAtUtc <= cutoff)
            .Where(application =>
                application.Booking == null
                    ? ((application.Status == ApplicationStatus.Declined
                            || application.Status == ApplicationStatus.Withdrawn)
                            && application.DecidedAtUtc <= cutoff)
                        || ((application.Status == ApplicationStatus.Expired
                                || ApplicationExpiryPolicy.ExpirableStatuses.Contains(application.Status))
                            && application.ExpiresAtUtc <= cutoff)
                    : application.Booking.Status == BookingStatus.Cancelled
                        ? application.Booking.CancelledAtUtc <= cutoff
                        : application.Booking.Occurrences.Any()
                            && !application.Booking.Occurrences.Any(occurrence => occurrence.EndUtc > cutoff));

    private async Task<int> DeleteNotificationOutboxAsync(
        DateTimeOffset cutoff,
        int limit,
        CancellationToken ct)
    {
        var ids = await _db.NotificationOutbox
            .Where(row => row.DeliveredAtUtc <= cutoff || row.FailedAtUtc <= cutoff)
            .OrderBy(row => row.DeliveredAtUtc ?? row.FailedAtUtc)
            .ThenBy(row => row.Id)
            .Select(row => row.Id)
            .Take(limit)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return ids.Count == 0
            ? 0
            : await _db.NotificationOutbox.Where(row => ids.Contains(row.Id))
                .ExecuteDeleteAsync(ct).ConfigureAwait(false);
    }

    private static TimeSpan PositiveOrDefault(TimeSpan value, TimeSpan fallback) =>
        value > TimeSpan.Zero ? value : fallback;
}
