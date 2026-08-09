using Microsoft.EntityFrameworkCore;
using Npgsql;
using Steeple.Api.Services.Applications;

namespace Steeple.Api.Proxies.Applications;
/// <summary>
/// EF Core adapter for <see cref="IApplicationRepository"/>. Loads carry the full display graph
/// (room + venue, organizer, messages) — threads are short at this scale, so eager-loading them
/// beats a second query per row. Entities stay tracked so the service's state-machine mutations
/// flush on the next save; saves ride the application's xmin concurrency token, so a transition
/// that lost a race surfaces as <see cref="ConcurrentUpdateException"/> rather than a lost update.
/// </summary>
public class EfApplicationRepository : IApplicationRepository
{
    /// <summary>The filtered unique index behind idempotent submits (004-applications.sql).</summary>
    public const string OrganizerIdempotencyIndex = "IX_applications_OrganizerId_IdempotencyKey";

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
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        // Named index, not just the SQLSTATE — any other 23505 must keep surfacing as the bug it is.
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: OrganizerIdempotencyIndex,
            })
        {
            // A concurrent submit with the same (organizer, key) committed first. Detach the
            // stillborn row so nothing retries the insert; the caller resolves the winner.
            _db.Entry(application).State = EntityState.Detached;
            throw new DuplicateIdempotencyKeyException(ex);
        }
    }

    /// <inheritdoc />
    public void AddPending(Application application) => _db.Applications.Add(application);

    /// <inheritdoc />
    public Task<User?> GetOrganizerAsync(Guid organizerId, CancellationToken ct = default) =>
        _db.Users.FirstOrDefaultAsync(u => u.Id == organizerId, ct);

    /// <inheritdoc />
    public Task<Application?> GetAsync(Guid applicationId, CancellationToken ct = default) =>
        Graph().FirstOrDefaultAsync(a => a.Id == applicationId, ct);

    /// <inheritdoc />
    public Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForOrganizerAsync(
        Guid organizerId, ApplicationStatus? status, DateTimeOffset now, int page, int pageSize, CancellationToken ct = default) =>
        PageAsync(Graph().Where(a => a.OrganizerId == organizerId), status, now, page, pageSize, ct);

    /// <inheritdoc />
    public Task<(IReadOnlyList<Application> Items, int TotalCount)> GetForVenuesAsync(
        IReadOnlyList<Guid> venueIds, ApplicationStatus? status, DateTimeOffset now, int page, int pageSize, CancellationToken ct = default) =>
        PageAsync(Graph().Where(a => venueIds.Contains(a.Room!.VenueId)), status, now, page, pageSize, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Application>> GetUndecidedForRoomAsync(
        Guid roomId, Guid excludeApplicationId, DateTimeOffset now, CancellationToken ct = default) =>
        await _db.Applications
            .Include(a => a.Organizer)
            .Where(a => a.RoomId == roomId
                && a.Id != excludeApplicationId
                && ApplicationExpiryPolicy.UndecidedStatuses.Contains(a.Status)
                && a.ExpiresAtUtc > now)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public Task AddMessageAsync(ApplicationMessage message, CancellationToken ct = default)
    {
        _db.ApplicationMessages.Add(message);
        return SaveAsync(ct);
    }

    /// <inheritdoc />
    public void AddCounterOffer(ApplicationCounterOffer counter) => _db.ApplicationCounterOffers.Add(counter);

    /// <inheritdoc />
    public async Task SaveAsync(CancellationToken ct = default)
    {
        try
        {
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            // The application's xmin token says another request committed a transition after this
            // one loaded the row — surface the conflict instead of overwriting their decision.
            throw new ConcurrentUpdateException(ex);
        }
    }

    private IQueryable<Application> Graph() =>
        _db.Applications
            .Include(a => a.Room!).ThenInclude(r => r.Venue)
            .Include(a => a.Organizer)
            .Include(a => a.Messages)
            .Include(a => a.CounterOffers)
            .Include(a => a.Booking);

    /// <summary>
    /// Status filters match the status the row is <b>about to have</b>, not just the stored one:
    /// the lazy expiry sweep only flips rows a read touches, so an undecided application past its
    /// <c>ExpiresAtUtc</c> is already effectively expired — filtering (and counting) on the stored
    /// value alone returned it under <c>?status=pending</c> with a wrong total.
    /// </summary>
    private static async Task<(IReadOnlyList<Application> Items, int TotalCount)> PageAsync(
        IQueryable<Application> query, ApplicationStatus? status, DateTimeOffset now, int page, int pageSize, CancellationToken ct)
    {
        if (status is { } s)
        {
            query = s switch
            {
                _ when ApplicationExpiryPolicy.IsExpirable(s) =>
                    query.Where(a => a.Status == s && a.ExpiresAtUtc > now),
                ApplicationStatus.Expired => query.Where(a =>
                    a.Status == ApplicationStatus.Expired
                    || (ApplicationExpiryPolicy.ExpirableStatuses.Contains(a.Status)
                        && a.ExpiresAtUtc <= now)),
                _ => query.Where(a => a.Status == s),
            };
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
