
namespace Steeple.Api.Services.Manage;
/// <summary>
/// Port: the venue-manager authz link (SYSTEM_DESIGN §5 — <c>venue_managers</c> is the provider
/// self-service seam). Rows are written by Admin during the concierge phase; the API only reads.
/// </summary>
public interface IVenueManagerRepository
{
    /// <summary>True when the user manages the venue.</summary>
    Task<bool> IsManagerAsync(Guid userId, Guid venueId, CancellationToken ct = default);

    /// <summary>Ids of every venue the user manages (empty for non-providers).</summary>
    Task<IReadOnlyList<Guid>> GetManagedVenueIdsAsync(Guid userId, CancellationToken ct = default);

    /// <summary>The venues the user manages, for the provider surface.</summary>
    Task<IReadOnlyList<Venue>> GetManagedVenuesAsync(Guid userId, CancellationToken ct = default);

    /// <summary>The (non-deleted) users managing a venue — the notification fan-out audience.</summary>
    Task<IReadOnlyList<User>> GetManagersAsync(Guid venueId, CancellationToken ct = default);
}
