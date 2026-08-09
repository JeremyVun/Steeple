
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: persistence for inbox rows and their durable delivery work. Each method is a complete
/// unit of work — it saves before returning.
/// </summary>
public interface INotificationRepository
{
    /// <summary>
    /// Persists inbox and outbox rows in one transaction. Either both collections commit or
    /// neither does.
    /// </summary>
    Task AddRangeAsync(
        IReadOnlyList<Notification> notifications,
        IReadOnlyList<NotificationOutbox> deliveries,
        CancellationToken ct = default);

    /// <summary>
    /// Leases a bounded due batch using row locks that skip work claimed by another API replica.
    /// Claiming increments <see cref="NotificationOutbox.Attempts"/> and moves the next-attempt
    /// timestamp to the lease deadline before returning.
    /// </summary>
    Task<IReadOnlyList<NotificationOutbox>> ClaimDueAsync(
        DateTimeOffset nowUtc,
        int limit,
        TimeSpan lease,
        CancellationToken ct = default);

    /// <summary>Stamps one provider-accepted delivery.</summary>
    Task MarkDeliveredAsync(Guid id, DateTimeOffset deliveredAtUtc, CancellationToken ct = default);

    /// <summary>
    /// Records a provider failure. <paramref name="failedAtUtc"/> is set only when retries are
    /// exhausted; otherwise <paramref name="nextAttemptAtUtc"/> schedules the retry.
    /// </summary>
    Task RecordFailureAsync(
        Guid id,
        string error,
        DateTimeOffset nextAttemptAtUtc,
        DateTimeOffset? failedAtUtc,
        CancellationToken ct = default);

    /// <summary>
    /// A page of the user's rows strictly older than the (<paramref name="beforeCreatedAtUtc"/>,
    /// <paramref name="beforeId"/>) cursor position, newest first. Null cursor = from the top.
    /// </summary>
    Task<IReadOnlyList<Notification>> GetPageAsync(
        Guid userId, DateTimeOffset? beforeCreatedAtUtc, Guid? beforeId, int limit, CancellationToken ct = default);

    /// <summary>Sets ReadAtUtc on the user's unread rows among <paramref name="ids"/>.</summary>
    Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default);
}
