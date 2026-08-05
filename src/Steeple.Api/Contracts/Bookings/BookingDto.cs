using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Contracts.Bookings;
/// <summary>
/// A booking as both parties see it (CONTRACTS §5). List endpoints omit the occurrence set
/// (<see cref="Occurrences"/> empty) but always carry <see cref="NextOccurrence"/>; the detail
/// endpoint carries every occurrence. Schedule fields are venue-local wall-clock; the venue's
/// IANA <see cref="VenueTimezone"/> travels with them (CONTRACTS §2 "Local times").
/// </summary>
public record BookingDto(
    Guid Id,
    Guid ApplicationId,
    Guid RoomId,
    string RoomName,
    string VenueName,
    string VenueSlug,
    string RoomSlug,
    string VenueTimezone,
    Guid OrganizerId,
    string OrganizerName,
    string Type,
    DateOnly StartDate,
    DateOnly EndDate,
    ScheduleDto Schedule,
    string Status,
    DateTimeOffset CreatedAtUtc,
    Guid? CancelledBy,
    DateTimeOffset? CancelledAtUtc,
    string? CancelReason,
    OccurrenceDto? NextOccurrence,
    IReadOnlyList<OccurrenceDto> Occurrences,
    BookingRatingsDto? Ratings,
    // Additive 2026-08-05 (payments rails): how money moves for this booking.
    BookingPaymentDto? Payment = null);

/// <summary>
/// The booking's payment posture (additive 2026-08-05 — docs/contracts/payments.md).
/// <c>mode</c> ∈ <c>inApp | offline</c>: bookings confirmed while payments were enabled carry the
/// per-occurrence price snapshot and charge in-app; legacy/offline bookings never charge.
/// <c>nextChargeAtUtc</c> is when the next unpaid occurrence is due to charge (null when nothing
/// remains to charge or the booking is offline).
/// </summary>
public record BookingPaymentDto(
    string Mode,
    decimal? PerOccurrenceAmount,
    string? Currency,
    DateTimeOffset? NextChargeAtUtc);

/// <summary>Viewer-scoped rating state for the booking detail/list surfaces.</summary>
public record BookingRatingsDto(
    SubmittedRatingDto? ByOrganizer,
    SubmittedRatingDto? ByVenue,
    bool CanRate,
    DateTimeOffset? RateByUtc);

/// <summary>A submitted rating visible to the current caller.</summary>
public record SubmittedRatingDto(int Stars, string? Comment, DateTimeOffset CreatedAtUtc);

/// <summary>One materialized occurrence of a booking.</summary>
/// <param name="PaymentStatus">Additive 2026-08-05: the occurrence's charge state
/// (<c>pending | requiresAction | succeeded | failed | refunded | disputed</c>); absent while the
/// occurrence has never been charged, and always absent on offline bookings.</param>
public record OccurrenceDto(
    Guid Id,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc,
    DateOnly LocalDate,
    string Status,
    Guid? NoShowMarkedBy,
    string? PaymentStatus = null);

/// <summary>A page of bookings (CONTRACTS §2 pagination envelope).</summary>
public record BookingListResult(
    IReadOnlyList<BookingDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary><c>POST /api/v1/bookings/{id}/cancel</c> body.</summary>
/// <param name="Reason">Optional reason shown to the other party (≤500 chars).</param>
public record CancelBookingRequest(string? Reason);

/// <summary><c>POST /api/v1/bookings/{id}/ratings</c> body.</summary>
public record SubmitRatingRequest(int Stars, string? Comment = null);
