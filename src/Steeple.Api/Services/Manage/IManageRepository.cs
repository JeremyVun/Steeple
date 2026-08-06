namespace Steeple.Api.Services.Manage;
/// <summary>
/// Persistence port for the Manage module's writes and editor reads. Venue-manager authz stays
/// in the service (via <see cref="IVenueManagerRepository"/>); this port only touches data the
/// Manage module owns — plus one cross-module read of booking occurrences for the unpublish guard.
/// </summary>
public interface IManageRepository
{
    /// <summary>A venue with rooms + photos loaded for the editor; null when unknown.</summary>
    Task<Venue?> GetVenueWithRoomsAsync(Guid venueId, CancellationToken ct = default);

    /// <summary>A room with its venue and photos loaded; null when unknown.</summary>
    Task<Room?> GetRoomWithVenueAsync(Guid roomId, CancellationToken ct = default);

    /// <summary>
    /// Adds a venue and links <paramref name="managerUserId"/> as its first manager, atomically.
    /// When <paramref name="idempotency"/> is supplied it is written in the same transaction;
    /// returns <c>false</c> (writing nothing) when that key was already spent — a concurrent
    /// replay won the race and the caller should resolve the original resource instead.
    /// </summary>
    Task<bool> AddVenueWithManagerAsync(
        Venue venue, Guid managerUserId, IdempotencyRecord? idempotency = null, CancellationToken ct = default);

    /// <summary>Adds a venue verification request with its document metadata.</summary>
    Task AddVenueVerificationRequestAsync(VenueVerificationRequest request, CancellationToken ct = default);

    /// <summary>
    /// Adds a room to an existing venue, with the same optional idempotency record + race
    /// semantics as <see cref="AddVenueWithManagerAsync"/>.
    /// </summary>
    Task<bool> AddRoomAsync(Room room, IdempotencyRecord? idempotency = null, CancellationToken ct = default);

    /// <summary>
    /// The resource this user already created with this (scope, key), or null when the key is
    /// unspent. Scoped to the caller by construction: one user can never resolve another's key.
    /// </summary>
    Task<Guid?> FindIdempotentResourceIdAsync(Guid userId, string scope, Guid key, CancellationToken ct = default);

    /// <summary>Persists pending mutations on tracked entities.</summary>
    Task SaveChangesAsync(CancellationToken ct = default);

    /// <summary>Whether the slug is already taken by another venue.</summary>
    Task<bool> VenueSlugExistsAsync(string slug, CancellationToken ct = default);

    /// <summary>Whether the slug is already taken by another room of the same venue.</summary>
    Task<bool> RoomSlugExistsAsync(Guid venueId, string slug, CancellationToken ct = default);

    /// <summary>
    /// Whether the room has future confirmed occurrences (cross-module read; the unpublish
    /// guard mirrors Admin's rule so live commitments never lose their public listing).
    /// </summary>
    Task<bool> HasFutureConfirmedOccurrencesAsync(Guid roomId, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>
    /// Whether any room of the venue has a future confirmed occurrence (cross-module read); blocks a
    /// timezone change so existing bookings keep the local wall-clock times they were promised.
    /// </summary>
    Task<bool> HasFutureConfirmedVenueOccurrencesAsync(Guid venueId, DateTimeOffset nowUtc, CancellationToken ct = default);

    /// <summary>
    /// Whether the venue has at least one Published room, checked live against the DB (not the
    /// in-memory snapshot) so a room published concurrently between load and save isn't missed.
    /// </summary>
    Task<bool> HasPublishedRoomsAsync(Guid venueId, CancellationToken ct = default);

    /// <summary>Whether the venue already has an undecided verification request.</summary>
    Task<bool> HasPendingVenueVerificationRequestAsync(Guid venueId, CancellationToken ct = default);

}
