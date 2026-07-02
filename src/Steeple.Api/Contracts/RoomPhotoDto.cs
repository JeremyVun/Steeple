namespace Steeple.Api.Contracts;
/// <summary>
/// A room photo projected for presentation.
/// </summary>
/// <param name="Url">Image URL.</param>
/// <param name="Caption">Optional caption / alt text.</param>
/// <param name="IsPrimary">Whether this is the room's primary (cover) photo.</param>
/// <param name="SortOrder">Ordering index for display.</param>
public record RoomPhotoDto(string Url, string? Caption, bool IsPrimary, int SortOrder);
