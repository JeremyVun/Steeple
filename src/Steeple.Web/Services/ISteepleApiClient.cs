namespace Steeple.Web.Services;

/// <summary>
/// Web's gateway to the backend <c>Steeple.Api</c>. The funnel no longer touches the database —
/// it fetches the same contract DTOs over HTTP and renders them. Mirrors the API's discovery surface.
/// </summary>
public interface ISteepleApiClient
{
    /// <summary>Runs a geo-fenced search, forwarding the raw funnel query string to the API.</summary>
    /// <param name="queryString">The request query string (including leading '?'), or null/empty.</param>
    Task<ListingSearchResult> SearchAsync(string? queryString, CancellationToken ct = default);

    /// <summary>Full listing detail by venue + room slug, or <c>null</c> when not found.</summary>
    Task<RoomDetailDto?> GetBySlugAsync(string venueSlug, string roomSlug, CancellationToken ct = default);

    /// <summary>Full listing detail by stable id, or <c>null</c> when not found.</summary>
    Task<RoomDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Distinct suburbs with at least one published room.</summary>
    Task<IReadOnlyList<string>> GetSuburbsAsync(CancellationToken ct = default);

    /// <summary>Sitemap rows for every published listing.</summary>
    Task<IReadOnlyList<SitemapEntry>> GetSitemapEntriesAsync(CancellationToken ct = default);

    /// <summary>Served-area context (name, center, beachhead) for framing the map and copy.</summary>
    Task<GeofenceContextDto> GetGeofenceAsync(CancellationToken ct = default);

    /// <summary>Public, revealed review comments for a venue.</summary>
    Task<VenueReviewPageDto> GetVenueReviewsAsync(Guid venueId, int page = 1, int pageSize = 10, CancellationToken ct = default);

    // --- Identity (the BFF's server-side calls; the browser never sees API tokens) ---

    /// <summary>
    /// Exchanges a provider ID token for a Steeple session. Returns the session, or the stable
    /// error code (e.g. <c>invalid_id_token</c>, <c>use_original_provider</c>) on failure.
    /// </summary>
    Task<(SessionResponse? Session, string? ErrorCode)> CreateSessionAsync(CreateSessionRequest request, CancellationToken ct = default);

    /// <summary>Rotates the refresh token; null when the session is no longer valid.</summary>
    Task<RefreshResponse?> RefreshAsync(string refreshToken, CancellationToken ct = default);

    /// <summary>Revokes the current session (sign out).</summary>
    Task RevokeSessionAsync(string accessToken, CancellationToken ct = default);

    /// <summary>Revokes every session the user holds (sign out everywhere).</summary>
    Task RevokeAllSessionsAsync(string accessToken, CancellationToken ct = default);

    /// <summary>The signed-in user's profile + agreements; null when the token no longer resolves.</summary>
    Task<MeResponse?> GetMeAsync(string accessToken, CancellationToken ct = default);

    /// <summary>Deletes (anonymizes) the signed-in user's account.</summary>
    Task DeleteMeAsync(string accessToken, CancellationToken ct = default);

    /// <summary>Records acceptance of a legal document version (idempotent server-side).</summary>
    Task AcceptAgreementAsync(string accessToken, AcceptAgreementRequest request, CancellationToken ct = default);

    // --- Applications (bearer-authorized BFF calls) ---

    /// <summary>
    /// Submits an intent-first application for a room. Returns the created application, or the
    /// stable error code on failure. <paramref name="idempotencyKey"/> guards against double-submit.
    /// </summary>
    Task<(ApplicationDto? Application, string? ErrorCode)> SubmitApplicationAsync(
        string accessToken, Guid roomId, SubmitApplicationRequest request, Guid idempotencyKey, CancellationToken ct = default);

    /// <summary>The signed-in organizer's own applications, optionally filtered by status.</summary>
    Task<ApplicationListResult> GetMyApplicationsAsync(string accessToken, string? status, int page, CancellationToken ct = default);

    /// <summary>Applications received across every venue the signed-in provider manages.</summary>
    Task<ApplicationListResult> GetManageApplicationsAsync(string accessToken, string? status, int page, CancellationToken ct = default);

    /// <summary>Full application detail (including the message thread), or <c>null</c> when not found.</summary>
    Task<ApplicationDto?> GetApplicationAsync(string accessToken, Guid id, CancellationToken ct = default);

    /// <summary>Posts a message onto the application's ask/answer thread. Returns the updated application.</summary>
    Task<(ApplicationDto? Application, string? ErrorCode)> PostApplicationMessageAsync(
        string accessToken, Guid id, string body, CancellationToken ct = default);

    /// <summary>Records the provider's decision (<c>approve</c>/<c>decline</c>) on an application.</summary>
    Task<(ApplicationDto? Application, string? ErrorCode)> PostApplicationDecisionAsync(
        string accessToken, Guid id, string decision, string? message, CancellationToken ct = default);

    /// <summary>Withdraws a pending application (organizer only).</summary>
    Task<(ApplicationDto? Application, string? ErrorCode)> WithdrawApplicationAsync(
        string accessToken, Guid id, CancellationToken ct = default);

    /// <summary>Venues the signed-in provider manages (labels a provider surface and routes it).</summary>
    Task<IReadOnlyList<ManagedVenueDto>> GetManagedVenuesAsync(string accessToken, CancellationToken ct = default);

    // --- Manage (provider self-service CRUD, bearer-authorized BFF calls) ---

    /// <summary>Full venue detail (including its rooms) for the provider's manage screens, or <c>null</c> when not found.</summary>
    Task<ManagedVenueDetailDto?> GetManagedVenueAsync(string accessToken, Guid id, CancellationToken ct = default);

    /// <summary>Creates a new venue for the signed-in provider. Returns the created venue, or the stable error code on failure.</summary>
    Task<(ManagedVenueDetailDto? Venue, string? ErrorCode)> CreateVenueAsync(
        string accessToken, SaveVenueRequest request, CancellationToken ct = default);

    /// <summary>Updates an existing venue. Returns the updated venue, or the stable error code on failure.</summary>
    Task<(ManagedVenueDetailDto? Venue, string? ErrorCode)> UpdateVenueAsync(
        string accessToken, Guid id, SaveVenueRequest request, CancellationToken ct = default);

    /// <summary>Submits ownership / lease-authority evidence for a managed venue.</summary>
    Task<(ManagedVenueDetailDto? Venue, string? ErrorCode)> SubmitVenueVerificationAsync(
        string accessToken, Guid id, SubmitVenueVerificationRequest request, CancellationToken ct = default);

    /// <summary>Full room detail for the provider's manage screens, or <c>null</c> when not found.</summary>
    Task<ManagedRoomDto?> GetManagedRoomAsync(string accessToken, Guid id, CancellationToken ct = default);

    /// <summary>Creates a new room under a venue. Returns the created room, or the stable error code on failure.</summary>
    Task<(ManagedRoomDto? Room, string? ErrorCode)> CreateRoomAsync(
        string accessToken, Guid venueId, SaveRoomRequest request, CancellationToken ct = default);

    /// <summary>Updates an existing room. Returns the updated room, or the stable error code on failure.</summary>
    Task<(ManagedRoomDto? Room, string? ErrorCode)> UpdateManagedRoomAsync(
        string accessToken, Guid roomId, SaveRoomRequest request, CancellationToken ct = default);

    /// <summary>A room's availability rules (open hours + blackouts), or <c>null</c> when not found.</summary>
    Task<RoomAvailabilityRulesDto?> GetRoomAvailabilityAsync(string accessToken, Guid roomId, CancellationToken ct = default);

    /// <summary>Replace-all save of a room's availability rules. Returns the saved rules, or the stable error code on failure.</summary>
    Task<(RoomAvailabilityRulesDto? Rules, string? ErrorCode)> SaveRoomAvailabilityAsync(
        string accessToken, Guid roomId, SaveAvailabilityRulesRequest request, CancellationToken ct = default);

    /// <summary>Uploads a new photo for a room. Returns the created photo, or the stable error code on failure.</summary>
    Task<(RoomPhotoDto? Photo, string? ErrorCode)> UploadRoomPhotoAsync(
        string accessToken, Guid roomId, Stream content, string fileName, string contentType, string? caption, CancellationToken ct = default);

    /// <summary>Updates a photo's caption/primary/order. Returns the updated photo, or the stable error code on failure.</summary>
    Task<(RoomPhotoDto? Photo, string? ErrorCode)> UpdatePhotoAsync(
        string accessToken, Guid photoId, UpdatePhotoRequest request, CancellationToken ct = default);

    /// <summary>Deletes a photo. Returns <c>null</c> on success (204), or the stable error code on failure.</summary>
    Task<string?> DeletePhotoAsync(string accessToken, Guid photoId, CancellationToken ct = default);

    // --- Bookings (bearer-authorized BFF calls) ---

    /// <summary>The signed-in organizer's own bookings, optionally filtered by status.</summary>
    Task<BookingListResult> GetMyBookingsAsync(string accessToken, string? status, int page, CancellationToken ct = default);

    /// <summary>Bookings across every venue the signed-in provider manages.</summary>
    Task<BookingListResult> GetManageBookingsAsync(string accessToken, string? status, int page, CancellationToken ct = default);

    /// <summary>Full booking detail (including every occurrence), or <c>null</c> when not found.</summary>
    Task<BookingDto?> GetBookingAsync(string accessToken, Guid id, CancellationToken ct = default);

    /// <summary>Cancels the booking (either party). Returns the updated booking, or the stable error code on failure.</summary>
    Task<(BookingDto? Booking, string? ErrorCode)> CancelBookingAsync(
        string accessToken, Guid id, string? reason, CancellationToken ct = default);

    /// <summary>Marks a past occurrence as a no-show (either party marks the other).</summary>
    Task<(BookingDto? Booking, string? ErrorCode)> MarkNoShowAsync(
        string accessToken, Guid occurrenceId, CancellationToken ct = default);

    /// <summary>Submits the caller's immutable rating for a booking.</summary>
    Task<string?> SubmitRatingAsync(string accessToken, Guid bookingId, int stars, string? comment, CancellationToken ct = default);
}
