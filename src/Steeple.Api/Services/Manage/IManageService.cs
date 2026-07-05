using Steeple.Api.Contracts.Manage;

namespace Steeple.Api.Services.Manage;
/// <summary>
/// Provider self-service use-cases (SYSTEM_DESIGN §4 Manage module, CONTRACTS §6): venue/room
/// CRUD with server-side geocoding, and status transitions honoring the moderation gate and
/// existing bookings. All operations are venue-manager-scoped; non-managers get NotFound
/// (no existence leak, matching the Applications party-scoping stance).
/// </summary>
public interface IManageService
{
    /// <summary>Full editor view of a managed venue, or NotFound when the caller isn't a manager.</summary>
    Task<ManageResult<ManagedVenueDetailDto>> GetVenueAsync(Guid callerId, Guid venueId, CancellationToken ct = default);

    /// <summary>Creates a venue (geocoded + geofenced) and links the caller as its first manager.</summary>
    Task<ManageResult<ManagedVenueDetailDto>> CreateVenueAsync(Guid callerId, SaveVenueRequest request, CancellationToken ct = default);

    /// <summary>Applies the non-null fields; address changes re-geocode (geofenced).</summary>
    Task<ManageResult<ManagedVenueDetailDto>> UpdateVenueAsync(Guid callerId, Guid venueId, SaveVenueRequest request, CancellationToken ct = default);

    /// <summary>Submits ownership / lease-authority evidence for operator verification.</summary>
    Task<ManageResult<ManagedVenueDetailDto>> SubmitVenueVerificationAsync(
        Guid callerId, Guid venueId, SubmitVenueVerificationRequest request, CancellationToken ct = default);

    /// <summary>Manager view of a room, or NotFound when the caller doesn't manage its venue.</summary>
    Task<ManageResult<ManagedRoomDto>> GetRoomAsync(Guid callerId, Guid roomId, CancellationToken ct = default);

    /// <summary>Creates a room in Draft under a managed venue.</summary>
    Task<ManageResult<ManagedRoomDto>> CreateRoomAsync(Guid callerId, Guid venueId, SaveRoomRequest request, CancellationToken ct = default);

    /// <summary>
    /// Applies the non-null fields, including status transitions: leaving Published is blocked
    /// while future confirmed occurrences exist (<c>has_active_bookings</c>); asking for
    /// Published on a never-approved room records a publish request for Admin moderation.
    /// </summary>
    Task<ManageResult<ManagedRoomDto>> UpdateRoomAsync(Guid callerId, Guid roomId, SaveRoomRequest request, CancellationToken ct = default);
}

/// <summary>Result envelope for manage use-cases (same idiom as <c>ApplicationResult</c>).</summary>
public sealed record ManageResult<T>(T? Value, ManageError? Error) where T : class
{
    /// <summary>A successful result.</summary>
    public static ManageResult<T> Ok(T value) => new(value, null);

    /// <summary>A failed result with a stable wire code.</summary>
    public static ManageResult<T> Fail(string code, string detail) => new(null, new ManageError(code, detail));
}

/// <summary>A manage failure: stable ProblemDetails <c>code</c> + human-readable detail.</summary>
public sealed record ManageError(string Code, string Detail);

/// <summary>Stable ProblemDetails <c>code</c> values for manage endpoints (CONTRACTS §6).</summary>
public static class ManageErrorCodes
{
    /// <summary>Unknown resource, or the caller doesn't manage it (no existence leak).</summary>
    public const string NotFound = "not_found";

    /// <summary>Venue payload failed validation.</summary>
    public const string InvalidVenue = "invalid_venue";

    /// <summary>Room payload failed validation.</summary>
    public const string InvalidRoom = "invalid_room";

    /// <summary>The address geocodes outside the beachhead (or not at all).</summary>
    public const string GeofenceRejected = "geofence_rejected";

    /// <summary>Unpublishing is blocked by future confirmed occurrences.</summary>
    public const string HasActiveBookings = "has_active_bookings";

    /// <summary>Publishing is blocked because the room has zero photos.</summary>
    public const string NoPhotos = "no_photos";

    /// <summary>Venue verification payload failed validation.</summary>
    public const string InvalidVerification = "invalid_verification";

    /// <summary>The venue is already verified.</summary>
    public const string AlreadyVerified = "already_verified";

    /// <summary>The venue already has a pending verification request.</summary>
    public const string VerificationPending = "verification_pending";
}
