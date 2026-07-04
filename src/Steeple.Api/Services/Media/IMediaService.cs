namespace Steeple.Api.Services.Media;
/// <summary>
/// Room-photo use-cases (SYSTEM_DESIGN §9, CONTRACTS §6): upload → EXIF strip → variants →
/// store → <c>room_photos</c> row; caption/primary/sort updates; delete. Venue-manager-scoped
/// like the rest of Manage (non-managers get NotFound). Admin concierge onboarding drives the
/// same endpoints — one pipeline, no seeded-URL side door.
/// </summary>
public interface IMediaService
{
    /// <summary>Processes and stores an uploaded photo for a managed room.</summary>
    Task<ManageResult<RoomPhotoDto>> UploadPhotoAsync(
        Guid callerId, Guid roomId, Stream content, string? caption, CancellationToken ct = default);

    /// <summary>Applies non-null metadata fields; setting IsPrimary demotes the previous cover.</summary>
    Task<ManageResult<RoomPhotoDto>> UpdatePhotoAsync(
        Guid callerId, Guid photoId, Contracts.Manage.UpdatePhotoRequest request, CancellationToken ct = default);

    /// <summary>Deletes the photo row and its stored variants (best-effort on the store).</summary>
    Task<ManageResult<DeletedPhoto>> DeletePhotoAsync(Guid callerId, Guid photoId, CancellationToken ct = default);
}

/// <summary>Marker result for a successful delete (the envelope needs a class payload).</summary>
public sealed record DeletedPhoto(Guid Id);

/// <summary>Additional media error codes (extends <see cref="ManageErrorCodes"/>).</summary>
public static class MediaErrorCodes
{
    /// <summary>The upload isn't a decodable JPEG/PNG/WebP image.</summary>
    public const string InvalidImage = "invalid_image";

    /// <summary>Photo metadata payload failed validation.</summary>
    public const string InvalidPhoto = "invalid_photo";
}
