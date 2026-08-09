
namespace Steeple.Api.Proxies;
/// <summary>
/// Persistence port for querying rooms. The Infrastructure adapter (EF) implements this.
/// </summary>
public interface IRoomRepository
{
    /// <summary>
    /// Returns the page of rooms matching the criteria. Results are ordered for presentation.
    /// </summary>
    Task<IReadOnlyList<Room>> SearchAsync(RoomSearchCriteria criteria, CancellationToken ct = default);

    /// <summary>
    /// Returns at most <paramref name="maxCandidates"/> rooms matching the criteria, in the same
    /// stable order as <see cref="SearchAsync"/>, for availability refinement before paging.
    /// </summary>
    Task<IReadOnlyList<Room>> SearchCandidatesAsync(
        RoomSearchCriteria criteria, int maxCandidates, CancellationToken ct = default);

    /// <summary>
    /// Returns the total count of rooms matching the criteria (ignoring pagination).
    /// </summary>
    Task<int> CountAsync(RoomSearchCriteria criteria, CancellationToken ct = default);

    /// <summary>
    /// Loads a single room by id, including its <see cref="Room.Venue"/> and <see cref="Room.Photos"/>.
    /// </summary>
    Task<Room?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Loads a single room by venue+room slug, including its <see cref="Room.Venue"/> and <see cref="Room.Photos"/>.
    /// </summary>
    Task<Room?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default);

    /// <summary>
    /// Returns the distinct suburbs inside <paramref name="bounds"/> that currently have at least
    /// one published room, alphabetically. Used to populate the discovery suburb picker.
    /// </summary>
    Task<IReadOnlyList<string>> GetPublishedSuburbsAsync(BoundingBox bounds, CancellationToken ct = default);

    /// <summary>
    /// Returns lightweight sitemap rows (slugs + timestamp) for every published room whose venue
    /// sits inside <paramref name="bounds"/> — no includes. The bounds are the served area the
    /// caller's geofence policy owns; the adapter is told them rather than knowing them, so the
    /// advertised URL set can never disagree with the discoverability gate that answers the read.
    /// </summary>
    Task<IReadOnlyList<SitemapEntry>> GetPublishedForSitemapAsync(BoundingBox bounds, CancellationToken ct = default);
}
