using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Services.Media;
/// <summary>
/// Default <see cref="IMediaService"/>. Every photo owns immutable variant keys beneath
/// <c>rooms/{roomId}/{photoId}/</c>. The first photo on a room becomes its cover automatically.
/// </summary>
public sealed class MediaService : IMediaService
{
    private const int MaxPlacementAttempts = 4;

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

        var photoId = Guid.NewGuid();
        var keyBase = $"rooms/{roomId}/{photoId}";
        var attemptedKeys = new List<string>(processed.Variants.Count);
        var urls = new Dictionary<int, string>(processed.Variants.Count);
        var photo = new RoomPhoto
        {
            Id = photoId,
            RoomId = roomId,
            StorageKey = keyBase,
            Caption = string.IsNullOrWhiteSpace(caption) ? null : caption.Trim(),
            CreatedAtUtc = _clock.GetUtcNow(),
        };

        try
        {
            // Sequential writes make the compensation set unambiguous. Three fixed variants keep
            // the latency bounded, and each attempted key is safe to delete idempotently.
            foreach (var variant in processed.Variants)
            {
                var key = $"{keyBase}/{variant.Width}.jpg";
                attemptedKeys.Add(key);
                urls[variant.Width] = await _store
                    .PutAsync(key, variant.Bytes, "image/jpeg", ct)
                    .ConfigureAwait(false);
            }

            photo.Url = urls[1600];
            photo.ThumbUrl = urls[400];
            photo.CardUrl = urls[800];
            room.UpdatedAtUtc = photo.CreatedAtUtc; // photos change the public listing (sitemap lastmod)

            for (var attempt = 1; attempt <= MaxPlacementAttempts; attempt++)
            {
                var placement = await _photos.GetNextPlacementAsync(roomId, ct).ConfigureAwait(false);
                photo.SortOrder = placement.SortOrder;
                photo.IsPrimary = placement.IsPrimary;
                _photos.AddPhoto(photo);

                if (await _photos.TrySaveAddedPhotoAsync(photo, ct).ConfigureAwait(false))
                {
                    await TrackSafelyAsync("photo_uploaded", new { roomId, photoId = photo.Id }).ConfigureAwait(false);
                    return ManageResult<RoomPhotoDto>.Ok(photo.ToDto());
                }
            }

            throw new InvalidOperationException(
                $"Could not assign a photo position after {MaxPlacementAttempts} concurrent attempts.");
        }
        catch
        {
            await DeleteObjectsSafelyAsync(attemptedKeys).ConfigureAwait(false);
            throw;
        }
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

        for (var attempt = 1; attempt <= MaxPlacementAttempts; attempt++)
        {
            if (request.Caption is not null)
            {
                photo!.Caption = string.IsNullOrWhiteSpace(request.Caption) ? null : request.Caption.Trim();
            }

            room!.UpdatedAtUtc = _clock.GetUtcNow();
            if (await _photos.TrySavePlacementAsync(PlacementPhases(room, photo!, request), ct).ConfigureAwait(false))
            {
                return ManageResult<RoomPhotoDto>.Ok(photo!.ToDto());
            }

            (photo, room, error) = await LoadScopedPhotoAsync(callerId, photoId, ct).ConfigureAwait(false);
            if (error is not null)
            {
                return new ManageResult<RoomPhotoDto>(null, error);
            }
        }

        throw new InvalidOperationException(
            $"Could not settle the photo order after {MaxPlacementAttempts} concurrent attempts.");
    }

    /// <summary>
    /// Stages an edit as phases that are each safe on their own against the non-deferrable
    /// sort-order and cover indexes: positions vacate to a private negative range before any
    /// sibling takes a new one, and the room loses its cover before the new cover claims it. EF's
    /// statement order within a phase then cannot decide whether the write succeeds.
    /// </summary>
    private static IReadOnlyList<Action> PlacementPhases(Room room, RoomPhoto photo, UpdatePhotoRequest request)
    {
        List<(RoomPhoto Photo, int Position)> moved = [];
        if (request.SortOrder is { } requested)
        {
            var ordered = room.Photos
                .OrderBy(candidate => candidate.SortOrder)
                .ThenBy(candidate => candidate.CreatedAtUtc)
                .ThenBy(candidate => candidate.Id)
                .ToList();
            ordered.Remove(photo);
            ordered.Insert(Math.Clamp(requested, 0, ordered.Count), photo);
            moved = ordered
                .Select((candidate, position) => (Photo: candidate, Position: position))
                .Where(entry => entry.Photo.SortOrder != entry.Position)
                .ToList();
        }

        var demoted = request.IsPrimary == true
            ? room.Photos.Where(candidate => candidate.IsPrimary && candidate.Id != photo.Id).ToList()
            : [];

        return
        [
            () =>
            {
                for (var index = 0; index < moved.Count; index++)
                {
                    moved[index].Photo.SortOrder = -(index + 1);
                }

                foreach (var sibling in demoted)
                {
                    sibling.IsPrimary = false;
                }
            },
            () =>
            {
                foreach (var (candidate, position) in moved)
                {
                    candidate.SortOrder = position;
                }

                if (request.IsPrimary == true)
                {
                    photo.IsPrimary = true;
                }
            },
        ];
    }

    /// <inheritdoc />
    public async Task<ManageResult<DeletedPhoto>> DeletePhotoAsync(Guid callerId, Guid photoId, CancellationToken ct = default)
    {
        var (photo, room, error) = await LoadScopedPhotoAsync(callerId, photoId, ct).ConfigureAwait(false);
        if (error is not null)
        {
            return new ManageResult<DeletedPhoto>(null, error);
        }

        for (var attempt = 1; attempt <= MaxPlacementAttempts; attempt++)
        {
            var removed = photo!;

            // The cover passes to the next photo — but only once the old cover's row is gone, so
            // the partial unique index never sees two of them.
            var successor = removed.IsPrimary
                ? room!.Photos
                    .Where(candidate => candidate.Id != removed.Id)
                    .OrderBy(candidate => candidate.SortOrder)
                    .FirstOrDefault()
                : null;
            room!.UpdatedAtUtc = _clock.GetUtcNow();

            var saved = await _photos.TrySavePlacementAsync(
                [
                    () => _photos.RemovePhoto(removed),
                    () =>
                    {
                        if (successor is not null)
                        {
                            successor.IsPrimary = true;
                        }
                    },
                ],
                ct).ConfigureAwait(false);

            if (saved)
            {
                // Store cleanup is best-effort after the row is gone — an orphaned CDN object is
                // harmless; a DB row pointing at deleted bytes is not.
                if (removed.StorageKey is { } keyBase)
                {
                    try
                    {
                        await _store
                            .DeleteAsync(VariantKeys(removed, keyBase), ct)
                            .ConfigureAwait(false);
                    }
                    catch
                    {
                        // Never fail the delete over storage cleanup.
                    }
                }

                return ManageResult<DeletedPhoto>.Ok(new DeletedPhoto(photoId));
            }

            (photo, room, error) = await LoadScopedPhotoAsync(callerId, photoId, ct).ConfigureAwait(false);
            if (error is not null)
            {
                return new ManageResult<DeletedPhoto>(null, error);
            }
        }

        throw new InvalidOperationException(
            $"Could not settle the photo order after {MaxPlacementAttempts} concurrent attempts.");
    }

    private static IReadOnlyList<string> VariantKeys(RoomPhoto photo, string keyBase)
    {
        var rowOwnedSuffix = $"/{photo.Id}";
        var rowOwned = keyBase.EndsWith(rowOwnedSuffix, StringComparison.OrdinalIgnoreCase);
        return MediaVariants.Widths
            .Select(width => rowOwned ? $"{keyBase}/{width}.jpg" : $"{keyBase}-{width}.jpg")
            .ToList();
    }

    private async Task DeleteObjectsSafelyAsync(IReadOnlyList<string> keys)
    {
        if (keys.Count == 0)
        {
            return;
        }

        try
        {
            // Request cancellation must not strand bytes written before the cancellation arrived.
            await _store.DeleteAsync(keys, CancellationToken.None).ConfigureAwait(false);
        }
        catch
        {
            // Preserve the upload/database exception. Storage cleanup is idempotent and can be
            // retried operationally if the provider itself is unavailable.
        }
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
