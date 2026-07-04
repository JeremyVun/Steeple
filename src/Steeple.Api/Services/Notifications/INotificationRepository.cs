
namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Port: persistence for inbox rows. Each method is a complete unit of work — it saves before
/// returning.
/// </summary>
public interface INotificationRepository
{
    /// <summary>Persists a batch of inbox rows (one per recipient of an event).</summary>
    Task AddRangeAsync(IReadOnlyList<Notification> notifications, CancellationToken ct = default);

    /// <summary>
    /// A page of the user's rows strictly older than the (<paramref name="beforeCreatedAtUtc"/>,
    /// <paramref name="beforeId"/>) cursor position, newest first. Null cursor = from the top.
    /// </summary>
    Task<IReadOnlyList<Notification>> GetPageAsync(
        Guid userId, DateTimeOffset? beforeCreatedAtUtc, Guid? beforeId, int limit, CancellationToken ct = default);

    /// <summary>Sets ReadAtUtc on the user's unread rows among <paramref name="ids"/>.</summary>
    Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default);
}
