using Microsoft.EntityFrameworkCore;
using Steeple.Api.Services.Applications;

namespace Steeple.Api.Proxies.Applications;
/// <summary>
/// EF Core adapter for <see cref="IApplicationRepository"/>. Loads carry the full display graph
/// (room + venue, organizer, messages) — threads are short at this scale, so eager-loading them
/// beats a second query per row. Entities stay tracked so the service's state-machine mutations
/// flush on the next save.
/// </summary>
public class EfApplicationRepository : IApplicationRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the EF context.</summary>
    public EfApplicationRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default) =>
        _db.Rooms.Include(r => r.Venue).FirstOrDefaultAsync(r => r.Id == roomId, ct);

    /// <inheritdoc />
    public Task<Application?> FindByIdempotencyKeyAsync(Guid organizerId, Guid idempotencyKey, CancellationToken ct = default) =>
        Graph().FirstOrDefaultAsync(a => a.OrganizerId == organizerId && a.IdempotencyKey == idempotencyKey, ct);

    /// <inheritdoc />
    public async Task AddAsync(Application application, CancellationToken ct = default)
    {
        _db.Applications.Add(application);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task<Application?> GetAsync(Guid applicationId, CancellationToken ct = default) =>
        Graph().FirstOrDefaultAsync(a => a.Id == applicationId, ct);

    /// <inheritdoc />
    public Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForOrganizerAsync(
        Guid organizerId, ApplicationStatus? status, int page, int pageSize, CancellationToken ct = default) =>
        PageAsync(Graph().Where(a => a.OrganizerId == organizerId), status, page, pageSize, ct);

    /// <inheritdoc />
    public Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForVenuesAsync(
        IReadOnlyList<Guid> venueIds, ApplicationStatus? status, int page, int pageSize, CancellationToken ct = default) =>
        PageAsync(Graph().Where(a => venueIds.Contains(a.Room!.VenueId)), status, page, pageSize, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Application>> GetUndecidedForRoomAsync(
        Guid roomId, Guid excludeApplicationId, CancellationToken ct = default) =>
        await _db.Applications
            .Include(a => a.Organizer)
            .Where(a => a.RoomId == roomId
                && a.Id != excludeApplicationId
                && (a.Status == ApplicationStatus.Pending || a.Status == ApplicationStatus.NeedsInfo))
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task AddMessageAsync(ApplicationMessage message, CancellationToken ct = default)
    {
        _db.ApplicationMessages.Add(message);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task SaveAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);

    private IQueryable<Application> Graph() =>
        _db.Applications
            .Include(a => a.Room!).ThenInclude(r => r.Venue)
            .Include(a => a.Organizer)
            .Include(a => a.Messages)
            .Include(a => a.Booking);

    private static async Task<(IReadOnlyList<Application> Items, int TotalCount)> PageAsync(
        IQueryable<Application> query, ApplicationStatus? status, int page, int pageSize, CancellationToken ct)
    {
        if (status is { } s)
        {
            query = query.Where(a => a.Status == s);
        }

        var total = await query.CountAsync(ct).ConfigureAwait(false);
        var items = await query
            .OrderByDescending(a => a.CreatedAtUtc)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        return (items, total);
    }
}
