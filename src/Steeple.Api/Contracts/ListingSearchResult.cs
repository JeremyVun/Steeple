
namespace Steeple.Api.Contracts;
/// <summary>
/// The outcome of a listing search: the page of results plus the geographic context applied.
/// </summary>
/// <param name="Items">The room cards on this page.</param>
/// <param name="TotalCount">Total matching rooms across all pages.</param>
/// <param name="IsZeroResult">Whether the search produced no results.</param>
/// <param name="AppliedBounds">The bounds actually searched (clamped to the beachhead).</param>
/// <param name="Center">The center point used for distance/sorting.</param>
/// <param name="Page">1-based page number echoed back.</param>
/// <param name="PageSize">Page size echoed back.</param>
public record ListingSearchResult(
    IReadOnlyList<RoomSummaryDto> Items,
    int TotalCount,
    bool IsZeroResult,
    BoundingBox AppliedBounds,
    GeoPoint Center,
    int Page,
    int PageSize);
