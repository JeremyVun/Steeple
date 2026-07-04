using Steeple.Api.Contracts.Bookings;

namespace Steeple.Api.Services.Bookings;
/// <summary>
/// Use-cases of the Bookings module (CONTRACTS §5, SYSTEM_DESIGN §5/§7): confirmation on
/// approval (occurrence materialization under the DB exclusion constraint), both parties'
/// booking lists, cancellation with the notice window, and no-show marking. Owns the booking
/// state machine (Confirmed → Completed | Cancelled) and the occurrence machine
/// (Scheduled → Occurred | NoShow | Cancelled).
/// </summary>
public interface IBookingService
{
    /// <summary>
    /// Materializes and saves the booking for an application being approved. The caller (the
    /// Applications module — the only sanctioned caller) passes its <b>tracked</b> application
    /// with room + venue + organizer loaded and the Approved status flip already applied but
    /// unsaved: the flip, the booking, and every occurrence commit in one atomic save, so an
    /// exclusion-constraint abort leaves nothing behind (first-approval-wins).
    /// Returns <see cref="BookingConfirmation.SlotTaken"/> instead of a booking when a live
    /// occurrence already holds an overlapping slot.
    /// </summary>
    Task<BookingConfirmation> ConfirmFromApplicationAsync(Application application, CancellationToken ct = default);

    /// <summary>The organizer's bookings, newest first, optionally filtered by status token.</summary>
    Task<BookingResult<BookingListResult>> GetForOrganizerAsync(
        Guid organizerId, string? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Bookings for every venue the caller manages (the provider's calendar-ish list).</summary>
    Task<BookingResult<BookingListResult>> GetForManagerAsync(
        Guid managerId, string? status, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// Full booking incl. occurrences — party-scoped: only the organizer or a manager of the
    /// room's venue may see it; anyone else gets <c>not_found</c> (existence is not leaked).
    /// </summary>
    Task<BookingResult<BookingDto>> GetAsync(Guid bookingId, Guid callerId, CancellationToken ct = default);

    /// <summary>
    /// Cancels a confirmed booking (either party). Occurrences starting beyond the notice
    /// window are cancelled — freeing their slots via the exclusion constraint's predicate;
    /// occurrences already inside the window still stand (the other party was owed notice).
    /// The other party is notified.
    /// </summary>
    Task<BookingResult<BookingDto>> CancelAsync(
        Guid bookingId, Guid callerId, CancelBookingRequest request, CancellationToken ct = default);

    /// <summary>
    /// Marks a past, non-cancelled occurrence as a no-show (either party marks the other —
    /// feeds ratings in Phase 6). Returns the updated booking.
    /// </summary>
    Task<BookingResult<BookingDto>> MarkNoShowAsync(Guid occurrenceId, Guid callerId, CancellationToken ct = default);
}

/// <summary>
/// Outcome of a confirmation attempt: the created booking, or <see cref="SlotTaken"/> when the
/// exclusion constraint rejected an overlap (the caller auto-declines the application).
/// </summary>
public sealed record BookingConfirmation(BookingDto? Booking, bool SlotTaken);

/// <summary>
/// Outcome of a bookings use-case: a value or a stable error code the controller maps onto the
/// ProblemDetails envelope (CONTRACTS §2), mirroring the Applications module's result idiom.
/// </summary>
public sealed record BookingResult<T>(T? Value, BookingError? Error) where T : class
{
    /// <summary>Successful outcome.</summary>
    public static BookingResult<T> Ok(T value) => new(value, null);

    /// <summary>Failed outcome carrying the wire error code.</summary>
    public static BookingResult<T> Fail(string code, string detail) => new(null, new BookingError(code, detail));
}

/// <summary>A stable wire error code plus a human-readable detail.</summary>
public sealed record BookingError(string Code, string Detail);

/// <summary>The stable bookings error codes documented in CONTRACTS §5.</summary>
public static class BookingErrorCodes
{
    /// <summary>The booking/occurrence doesn't exist — or the caller isn't a party to it.</summary>
    public const string NotFound = "not_found";

    /// <summary>A request field failed validation (unknown status token, oversize reason…).</summary>
    public const string InvalidBooking = "invalid_booking";

    /// <summary>The action isn't valid in the booking's/occurrence's current state.</summary>
    public const string InvalidState = "invalid_state";
}
