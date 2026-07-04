using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Services.Media;
/// <summary>
/// Default <see cref="IMediaService"/>. Variant keys are content-addressed
/// (<c>rooms/{roomId}/{hash}-{width}.jpg</c>) so re-uploads are naturally deduplicated and CDN
/// caching can be immutable. The first photo on a room becomes its cover automatically.
/// </summary>
public sealed class MediaService : IMediaService
{
    private readonly IManageRepository _rooms;
    private readonly IMediaRepository _photos;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly IImageProcessor _processor;
    private readonly IMediaStore _store;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;

    /// <summary>Creates the service from its ports.</summary>
    public MediaService(
        IManageRepository rooms,
        IMediaRepository photos,
        IVenueManagerRepository venueManagers,
        IImageProcessor processor,
        IMediaStore store,
        IAnalyticsSink analytics,
        TimeProvider clock)
    {
        _rooms = rooms;
        _photos = photos;
        _venueManagers = venueManagers;
        _processor = processor;
        _store = store;
        _analytics = analytics;
        _clock = clock;
    }

    /// <inheritdoc />
    public async Task<ManageResult<RoomPhotoDto>> UploadPhotoAsync(
        Guid callerId, Guid roomId, Stream content, string? caption, CancellationToken ct = default)
    {
        var room = await _rooms.GetRoomWithVenueAsync(roomId, ct).ConfigureAwait(false);
        if (room is null || !await _venueManagers.IsManagerAsync(callerId, room.VenueId, ct).ConfigureAwait(false))
        {
            return ManageResult<RoomPhotoDto>.Fail(ManageErrorCodes.NotFound, "No such room.");
        }

        if (caption is { Length: > 500 })
        {
            return ManageResult<RoomPhotoDto>.Fail(MediaErrorCodes.InvalidPhoto, "Captions are limited to 500 characters.");
        }

        var processed = await _processor.ProcessAsync(content, ct).ConfigureAwait(false);
        if (processed is null)
        {
            return ManageResult<RoomPhotoDto>.Fail(
                MediaErrorCodes.InvalidImage, "That file isn't an image we can read — use a JPEG, PNG, or WebP photo.");
        }

        var keyBase = $"rooms/{roomId}/{processed.ContentHash}";
        var puts = processed.Variants
            .Select(async variant => (variant.Width, Url: await _store
                .PutAsync($"{keyBase}-{variant.Width}.jpg", variant.Bytes, "image/jpeg", ct)
                .ConfigureAwait(false)))
            .ToList();
        var urls = (await Task.WhenAll(puts).ConfigureAwait(false)).ToDictionary(p => p.Width, p => p.Url);

        var photo = new RoomPhoto
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            Url = urls[1600],
            ThumbUrl = urls[400],
            CardUrl = urls[800],
            StorageKey = keyBase,
            Caption = string.IsNullOrWhiteSpace(caption) ? null : caption.Trim(),
            IsPrimary = room.Photos.Count == 0, // first photo = cover
            SortOrder = room.Photos.Count == 0 ? 0 : room.Photos.Max(p => p.SortOrder) + 1,
            CreatedAtUtc = _clock.GetUtcNow(),
        };

        _photos.AddPhoto(photo);
        room.UpdatedAtUtc = photo.CreatedAtUtc; // photos change the public listing (sitemap lastmod)
        await _photos.SaveChangesAsync(ct).ConfigureAwait(false);

        await TrackSafelyAsync("photo_uploaded", new { roomId, photoId = photo.Id }).ConfigureAwait(false);
        return ManageResult<RoomPhotoDto>.Ok(photo.ToDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<RoomPhotoDto>> UpdatePhotoAsync(
        Guid callerId, Guid photoId, UpdatePhotoRequest request, CancellationToken ct = default)
    {
        var (photo, room, error) = await LoadScopedPhotoAsync(callerId, photoId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<RoomPhotoDto>(null, error);
        }

        if (request.Caption is { Length: > 500 })
        {
            return ManageResult<RoomPhotoDto>.Fail(MediaErrorCodes.InvalidPhoto, "Captions are limited to 500 characters.");
        }

        if (request.Caption is not null)
        {
            photo!.Caption = string.IsNullOrWhiteSpace(request.Caption) ? null : request.Caption.Trim();
        }

        if (request.SortOrder is { } sortOrder)
        {
            photo!.SortOrder = Math.Max(0, sortOrder);
        }

        if (request.IsPrimary == true)
        {
            foreach (var sibling in room!.Photos)
            {
                sibling.IsPrimary = sibling.Id == photo!.Id;
            }
        }

        room!.UpdatedAtUtc = _clock.GetUtcNow();
        await _photos.SaveChangesAsync(ct).ConfigureAwait(false);
        return ManageResult<RoomPhotoDto>.Ok(photo!.ToDto());
    }

    /// <inheritdoc />
    public async Task<ManageResult<DeletedPhoto>> DeletePhotoAsync(Guid callerId, Guid photoId, CancellationToken ct = default)
    {
        var (photo, room, error) = await LoadScopedPhotoAsync(callerId, photoId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<DeletedPhoto>(null, error);
        }

        _photos.RemovePhoto(photo!);

        // Promote the next photo when the cover is deleted.
        if (photo!.IsPrimary)
        {
            var next = room!.Photos
                .Where(p => p.Id != photo.Id)
                .OrderBy(p => p.SortOrder)
                .FirstOrDefault();
            if (next is not null)
            {
                next.IsPrimary = true;
            }
        }

        room!.UpdatedAtUtc = _clock.GetUtcNow();
        await _photos.SaveChangesAsync(ct).ConfigureAwait(false);

        // Store cleanup is best-effort after the row is gone — an orphaned CDN object is
        // harmless; a DB row pointing at deleted bytes is not.
        if (photo.StorageKey is { } keyBase)
        {
            try
            {
                await _store
                    .DeleteAsync(MediaVariants.Widths.Select(w => $"{keyBase}-{w}.jpg").ToList(), ct)
                    .ConfigureAwait(false);
            }
            catch
            {
                // Never fail the delete over storage cleanup.
            }
        }

        return ManageResult<DeletedPhoto>.Ok(new DeletedPhoto(photoId));
    }

    private async Task<(RoomPhoto? Photo, Room? Room, ManageError? Error)> LoadScopedPhotoAsync(
        Guid callerId, Guid photoId, CancellationToken ct)
    {
        var photo = await _photos.GetPhotoAsync(photoId, ct).ConfigureAwait(false);
        if (photo is null)
        {
            return (null, null, new ManageError(ManageErrorCodes.NotFound, "No such photo."));
        }

        var room = await _rooms.GetRoomWithVenueAsync(photo.RoomId, ct).ConfigureAwait(false);
        if (room is null || !await _venueManagers.IsManagerAsync(callerId, room.VenueId, ct).ConfigureAwait(false))
        {
            return (null, null, new ManageError(ManageErrorCodes.NotFound, "No such photo."));
        }

        return (photo, room, null);
    }

    private async Task TrackSafelyAsync(string eventType, object payload)
    {
        try
        {
            await _analytics.TrackAsync(eventType, payload).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: analytics must never fail an upload.
        }
    }
}
