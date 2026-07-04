using Microsoft.EntityFrameworkCore;
using Steeple.Api.Services.Manage;

namespace Steeple.Api.Proxies.Manage;
/// <summary>EF Core adapter for <see cref="IVenueManagerRepository"/> (read-only in the API — Admin writes the links).</summary>
public class EfVenueManagerRepository : IVenueManagerRepository
{
    private readonly SteepleDbContext _db;

    /// <summary>Creates the repository over the EF context.</summary>
    public EfVenueManagerRepository(SteepleDbContext db) => _db = db;

    /// <inheritdoc />
    public Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default) =>
        _db.VenueManagers.AnyAsync(m => m.UserId == userId && m.VenueId == venueId, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default) =>
        await _db.VenueManagers
            .Where(m => m.UserId == userId)
            .Select(m => m.VenueId)
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default) =>
        await _db.VenueManagers
            .Where(m => m.UserId == userId)
            .Select(m => m.Venue!)
            .OrderBy(v => v.Name)
            .AsNoTracking()
            .ToListAsync(ct)
            .ConfigureAwait(false);

    /// <inheritdoc />
    public async Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default) =>
        await _db.VenueManagers
            .Where(m => m.VenueId == venueId && m.User!.DeletedAtUtc == null)
            .Select(m => m.User!)
            .AsNoTracking()
            .ToListAsync(ct)
            .ConfigureAwait(false);
}
