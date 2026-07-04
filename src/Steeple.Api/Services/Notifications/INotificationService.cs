using Steeple.Api.Contracts.Notifications;

namespace Steeple.Api.Services.Notifications;
/// <summary>
/// The signed-in user's inbox (CONTRACTS §5): cursor-paginated reads, newest first, and
/// mark-as-read. The inbox is the payload of record — push/email only ever point at it.
/// </summary>
public interface INotificationService
{
    /// <summary>A page of inbox rows older than <paramref name="after"/> (null = from the top).</summary>
    Task<NotificationListResult> GetPageAsync(Guid userId, string? after, int pageSize, CancellationToken ct = default);

    /// <summary>Marks the given rows read (scoped to the user; unknown ids are ignored).</summary>
    Task MarkReadAsync(Guid userId, IReadOnlyList<Guid> ids, CancellationToken ct = default);
}
