namespace Steeple.Api.Contracts;
/// <summary>
/// A single sitemap URL: a published listing's canonical slug path plus a last-modified stamp.
/// </summary>
/// <remarks>
/// <see cref="LastModifiedUtc"/> currently uses the row's created time; swap to a dedicated
/// <c>UpdatedAtUtc</c> column when one is added (see <c>docs/SEO.md</c>).
/// </remarks>
public record SitemapEntry(string VenueSlug, string RoomSlug, DateTimeOffset LastModifiedUtc);
