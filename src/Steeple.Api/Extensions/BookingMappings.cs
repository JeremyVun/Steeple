using Steeple.Api.Contracts.Applications;
using Steeple.Api.Contracts.Bookings;

namespace Steeple.Api.Extensions;
/// <summary>
/// Projects Bookings-module entities into their wire DTOs (CONTRACTS §5). Requires the full
/// display graph loaded (room + venue, organizer, occurrences).
/// </summary>
public static class BookingMappings
{
    /// <summary>
    /// Maps a booking. List projections pass <paramref name="includeOccurrences"/> false — the
    /// occurrence set stays behind the detail endpoint; lists still carry
    /// <see cref="BookingDto.NextOccurrence"/> for "Next: Tue, Sep 8" affordances.
    /// </summary>
    public static BookingDto ToDto(this Booking booking, bool includeOccurrences, DateTimeOffset nowUtc)
    {
        var room = booking.Room ?? throw new InvalidOperationException("Booking loaded without its room.");
        var venue = room.Venue ?? throw new InvalidOperationException("Booking loaded without its venue.");
        var organizer = booking.Organizer ?? throw new InvalidOperationException("Booking loaded without its organizer.");

        var occurrences = booking.Occurrences.OrderBy(o => o.StartUtc).ToList();
        var next = occurrences.FirstOrDefault(o => o.Status == OccurrenceStatus.Scheduled && o.EndUtc > nowUtc);

        return new BookingDto(
            Id: booking.Id,
            ApplicationId: booking.ApplicationId,
            RoomId: room.Id,
            RoomName: room.Name,
            VenueName: venue.Name,
            VenueSlug: venue.Slug,
            RoomSlug: room.Slug,
            VenueTimezone: venue.Timezone,
            OrganizerId: organizer.Id,
            OrganizerName: organizer.DisplayName,
            Type: FlagEnumExtensions.ToCamelCaseToken(booking.Type.ToString()),
            StartDate: booking.StartDate,
            EndDate: booking.EndDate,
            Schedule: booking.ToScheduleDto(),
            Status: FlagEnumExtensions.ToCamelCaseToken(booking.Status.ToString()),
            CreatedAtUtc: booking.CreatedAtUtc,
            CancelledBy: booking.CancelledBy,
            CancelledAtUtc: booking.CancelledAtUtc,
            CancelReason: booking.CancelReason,
            NextOccurrence: next?.ToDto(),
            Occurrences: includeOccurrences ? occurrences.Select(o => o.ToDto()).ToList() : []);
    }

    /// <summary>Maps one occurrence.</summary>
    public static OccurrenceDto ToDto(this BookingOccurrence occurrence) => new(
        Id: occurrence.Id,
        StartUtc: occurrence.StartUtc,
        EndUtc: occurrence.EndUtc,
        LocalDate: occurrence.LocalDate,
        Status: FlagEnumExtensions.ToCamelCaseToken(occurrence.Status.ToString()),
        NoShowMarkedBy: occurrence.NoShowMarkedBy);

    /// <summary>
    /// The booking's stored venue-local schedule as the shared wire shape. Only weekly recurrence
    /// exists, so a Recurring booking always renders as <c>recurringWeekly</c>.
    /// </summary>
    public static ScheduleDto ToScheduleDto(this Booking booking) => new(
        Frequency: booking.Type == BookingType.Recurring ? "recurringWeekly" : "oneOff",
        StartDate: booking.StartDate,
        EndDate: booking.EndDate,
        DayOfWeek: booking.DayOfWeek is { } day ? FlagEnumExtensions.ToCamelCaseToken(day.ToString()) : null,
        StartTime: booking.StartTime.ToString("HH\\:mm"),
        EndTime: booking.EndTime.ToString("HH\\:mm"));
}
