using Steeple.Api.Contracts.Applications;

namespace Steeple.Api.Extensions;
/// <summary>
/// Projects Applications-module entities into their wire DTOs (CONTRACTS §5). Requires the full
/// display graph loaded (room + venue, organizer, messages).
/// </summary>
public static class ApplicationMappings
{
    /// <summary>
    /// Maps an application. List projections pass <paramref name="includeThread"/> false — the
    /// thread stays behind the detail endpoint; lists carry only the count.
    /// </summary>
    public static ApplicationDto ToDto(
        this Application application,
        bool includeThread,
        OrganizerRatingSummaryDto? organizerRatingSummary = null,
        ApplicationConflictsDto? conflicts = null)
    {
        var room = application.Room ?? throw new InvalidOperationException("Application loaded without its room.");
        var venue = room.Venue ?? throw new InvalidOperationException("Application loaded without its venue.");
        var organizer = application.Organizer ?? throw new InvalidOperationException("Application loaded without its organizer.");

        var messages = application.Messages.OrderBy(m => m.SentAtUtc).ToList();

        return new ApplicationDto(
            Id: application.Id,
            RoomId: room.Id,
            RoomName: room.Name,
            VenueName: venue.Name,
            VenueSlug: venue.Slug,
            RoomSlug: room.Slug,
            Organizer: new OrganizerDto(organizer.Id, organizer.DisplayName, organizerRatingSummary),
            ActivityType: FlagEnumExtensions.ToCamelCaseToken(application.ActivityType.ToString()),
            GroupSize: application.GroupSize,
            Schedule: application.ToScheduleDto(),
            IntentText: application.IntentText,
            Status: FlagEnumExtensions.ToCamelCaseToken(application.Status.ToString()),
            CreatedAtUtc: application.CreatedAtUtc,
            DecidedAtUtc: application.DecidedAtUtc,
            ExpiresAtUtc: application.ExpiresAtUtc,
            BookingId: application.Booking?.Id,
            MessageCount: messages.Count,
            Messages: includeThread
                ? messages.Select(m => new ApplicationMessageDto(m.Id, m.SenderId, m.Body, m.SentAtUtc)).ToList()
                : [],
            Conflicts: conflicts,
            // The latest non-superseded counter rides the detail read for both parties (lists omit it,
            // matching the thread/conflicts). Superseded rows stay only as history.
            CounterOffer: includeThread ? application.LatestCounterOfferDto() : null);
    }

    /// <summary>
    /// The latest non-superseded counter-offer on an application as its wire DTO — the open counter
    /// if one exists, else the most recent answered/lapsed one; null when the application was never
    /// countered.
    /// </summary>
    public static CounterOfferDto? LatestCounterOfferDto(this Application application)
    {
        var counter = application.CounterOffers
            .Where(c => c.Status != CounterOfferStatus.Superseded)
            .OrderByDescending(c => c.CreatedAtUtc)
            .FirstOrDefault();

        return counter is null
            ? null
            : new CounterOfferDto(
                Id: counter.Id,
                Schedule: counter.ToScheduleDto(),
                Message: counter.Message,
                Status: FlagEnumExtensions.ToCamelCaseToken(counter.Status.ToString()),
                CreatedAtUtc: counter.CreatedAtUtc,
                RespondedAtUtc: counter.RespondedAtUtc);
    }

    /// <summary>The stored schedule as its venue-local wire shape (times back to <c>HH:mm</c>).</summary>
    public static ScheduleDto ToScheduleDto(this Application application) => new(
        Frequency: FlagEnumExtensions.ToCamelCaseToken(application.Frequency.ToString()),
        StartDate: application.StartDate,
        EndDate: application.EndDate,
        DaysOfWeek: application.DaysOfWeek is { } days && days != Weekdays.None ? days.ToNameList() : null,
        StartTime: application.StartTime.ToString("HH\\:mm"),
        EndTime: application.EndTime.ToString("HH\\:mm"));

    /// <summary>A counter-offer's stored schedule as its venue-local wire shape (times back to <c>HH:mm</c>).</summary>
    public static ScheduleDto ToScheduleDto(this ApplicationCounterOffer counter) => new(
        Frequency: FlagEnumExtensions.ToCamelCaseToken(counter.Frequency.ToString()),
        StartDate: counter.StartDate,
        EndDate: counter.EndDate,
        DaysOfWeek: counter.DaysOfWeek is { } days && days != Weekdays.None ? days.ToNameList() : null,
        StartTime: counter.StartTime.ToString("HH\\:mm"),
        EndTime: counter.EndTime.ToString("HH\\:mm"));
}
