namespace Steeple.Api.Contracts;
/// <summary>
/// A single sitemap URL: a published listing's canonical slug path plus a last-modified stamp.
/// </summary>
/// <remarks>
/// <see cref="LastModifiedUtc"/> is the later of the room's and its venue's <c>UpdatedAtUtc</c>
/// (the rendered page shows both).
/// </remarks>
public record SitemapEntry(string VenueSlug, string RoomSlug, DateTimeOffset LastModifiedUtc);
