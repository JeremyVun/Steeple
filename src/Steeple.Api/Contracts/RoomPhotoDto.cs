namespace Steeple.Api.Contracts;
/// <summary>
/// A room photo projected for presentation.
/// </summary>
/// <param name="Id">Stable id (manage surfaces address photos by it; additive for public reads).</param>
/// <param name="Url">Full-size image URL.</param>
/// <param name="ThumbUrl">400w variant URL; null for legacy external photos — fall back to <paramref name="Url"/>.</param>
/// <param name="CardUrl">800w variant URL; null for legacy external photos — fall back to <paramref name="Url"/>.</param>
/// <param name="Caption">Optional caption / alt text.</param>
/// <param name="IsPrimary">Whether this is the room's primary (cover) photo.</param>
/// <param name="SortOrder">Ordering index for display.</param>
public record RoomPhotoDto(
    Guid Id,
    string Url,
    string? ThumbUrl,
    string? CardUrl,
    string? Caption,
    bool IsPrimary,
    int SortOrder);
