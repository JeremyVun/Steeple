
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
    /// Returns <b>every</b> room matching the criteria (same filters + ordering as
    /// <see cref="SearchAsync"/> but no pagination), for the time-first search path where survivors
    /// are refined against real free windows before the page is cut. Beachhead-scale only.
    /// </summary>
    Task<IReadOnlyList<Room>> SearchAllAsync(RoomSearchCriteria criteria, CancellationToken ct = default);

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
    /// Returns the distinct suburbs that currently have at least one published room, alphabetically.
    /// Used to populate the discovery suburb picker.
    /// </summary>
    Task<IReadOnlyList<string>> GetPublishedSuburbsAsync(CancellationToken ct = default);

    /// <summary>
    /// Returns lightweight sitemap rows (slugs + timestamp) for every published room — no includes.
    /// </summary>
    Task<IReadOnlyList<SitemapEntry>> GetPublishedForSitemapAsync(CancellationToken ct = default);
}
