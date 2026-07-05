
namespace Steeple.Api.Contracts.Applications;
/// <summary>
/// An application as both parties see it (CONTRACTS §5). List endpoints omit the message thread
/// (<see cref="Messages"/> empty, <see cref="MessageCount"/> populated); the detail endpoint
/// carries the full thread.
/// </summary>
public record ApplicationDto(
    Guid Id,
    Guid RoomId,
    string RoomName,
    string VenueName,
    string VenueSlug,
    string RoomSlug,
    OrganizerDto Organizer,
    string ActivityType,
    int GroupSize,
    ScheduleDto Schedule,
    string IntentText,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? DecidedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    Guid? BookingId,
    int MessageCount,
    IReadOnlyList<ApplicationMessageDto> Messages);

/// <summary>The applying organizer as shown to the provider, including reputation once available.</summary>
public record OrganizerDto(Guid Id, string DisplayName, OrganizerRatingSummaryDto? RatingSummary);

/// <summary>Organizer reputation summary shown to venue managers once at least one rating is revealed.</summary>
public record OrganizerRatingSummaryDto(
    double AverageStars,
    int RatingCount,
    int NoShowCount,
    int CompletedBookings);

/// <summary>One message on the application's ask/answer thread.</summary>
public record ApplicationMessageDto(Guid Id, Guid SenderId, string Body, DateTimeOffset SentAtUtc);

/// <summary>A page of applications (CONTRACTS §2 pagination envelope).</summary>
public record ApplicationListResult(
    IReadOnlyList<ApplicationDto> Items,
    int TotalCount,
    int Page,
    int PageSize);
