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
    BookingRatingsDto? Ratings);

/// <summary>Viewer-scoped rating state for the booking detail/list surfaces.</summary>
public record BookingRatingsDto(
    SubmittedRatingDto? ByOrganizer,
    SubmittedRatingDto? ByVenue,
    bool CanRate,
    DateTimeOffset? RateByUtc);

/// <summary>A submitted rating visible to the current caller.</summary>
public record SubmittedRatingDto(int Stars, string? Comment, DateTimeOffset CreatedAtUtc);

/// <summary>One materialized occurrence of a booking.</summary>
public record OccurrenceDto(
    Guid Id,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc,
    DateOnly LocalDate,
    string Status,
    Guid? NoShowMarkedBy);

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
