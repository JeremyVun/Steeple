
namespace Steeple.Api.Services.Applications;
/// <summary>
/// Port: persistence for the Applications module. Loads return the full display graph
/// (room + venue, organizer, thread messages); each mutating method is a complete unit of work —
/// it saves before returning. Mutations to already-loaded (tracked) entities are persisted by the
/// same save.
/// </summary>
public interface IApplicationRepository
{
    /// <summary>The room with its venue, any status. Null when unknown.</summary>
    Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>An earlier application created with this (organizer, idempotency key), if any.</summary>
    Task<Application?> FindByIdempotencyKeyAsync(Guid organizerId, Guid idempotencyKey, CancellationToken ct = default);

    /// <summary>Persists a new application.</summary>
    Task AddAsync(Application application, CancellationToken ct = default);

    /// <summary>The application with its full graph. Null when unknown.</summary>
    Task<Application?> GetAsync(Guid applicationId, CancellationToken ct = default);

    /// <summary>The organizer's applications (full graph), newest first, paginated.</summary>
    Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForOrganizerAsync(
        Guid organizerId, ApplicationStatus? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Applications for rooms of the given venues (full graph), newest first, paginated.</summary>
    Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForVenuesAsync(
        IReadOnlyList<Guid> venueIds, ApplicationStatus? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// The other undecided (<c>Pending|NeedsInfo</c>) applications on a room, excluding one, each
    /// with its organizer loaded — the competing pending demand shown in the manager-review conflict
    /// digest (CONTRACTS §6). Full graph is not needed; only schedule fields + organizer name.
    /// </summary>
    Task<IReadOnlyList<Application>> GetUndecidedForRoomAsync(
        Guid roomId, Guid excludeApplicationId, CancellationToken ct = default);

    /// <summary>Appends a thread message (also flushing any pending changes to its tracked application).</summary>
    Task AddMessageAsync(ApplicationMessage message, CancellationToken ct = default);

    /// <summary>Flushes mutations made to already-loaded applications (status flips, decisions, expiry).</summary>
    Task SaveAsync(CancellationToken ct = default);
}
