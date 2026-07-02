namespace Steeple.Api.Services;
/// <summary>
/// Application service for the read-only discovery slice: geo-fenced listing search and listing detail.
/// </summary>
public interface IListingService
{
    /// <summary>
    /// Searches published rooms within the geofenced area resolved from the query.
    /// </summary>
    /// <param name="query">The model-bound search request.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<ListingSearchResult> SearchAsync(ListingSearchQuery query, CancellationToken ct = default);

    /// <summary>
    /// Gets full detail for a single room by its identifier, or <c>null</c> if not found / not discoverable.
    /// </summary>
    /// <param name="roomId">The room identifier.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<RoomDetailDto?> GetByIdAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>
    /// Gets full detail for a single room by its venue and room slugs, or <c>null</c> if not found.
    /// </summary>
    /// <param name="venueSlug">The owning venue's slug.</param>
    /// <param name="roomSlug">The room's slug.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default);

    /// <summary>
    /// Returns the distinct suburbs (alphabetical) that have at least one published room, for the
    /// discovery suburb picker.
    /// </summary>
    /// <param name="ct">Cancellation token.</param>
    Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default);

    /// <summary>
    /// Returns sitemap entries for every published listing (used to render <c>/sitemap.xml</c>).
    /// </summary>
    /// <param name="ct">Cancellation token.</param>
    Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default);
}
