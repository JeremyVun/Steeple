using Steeple.Api.Contracts.Applications;
using Steeple.Api.Contracts.Bookings;
using Steeple.Api.Services.Payments;

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
    /// <paramref name="paymentStatuses"/> (occurrence id → latest payment state, from the
    /// Payments service) and <paramref name="chargeWindow"/> feed the additive payment fields;
    /// both null keeps the pre-payments shape (payment block still present, charge times absent).
    /// </summary>
    public static BookingDto ToDto(
        this Booking booking,
        bool includeOccurrences,
        DateTimeOffset nowUtc,
        BookingRatingsDto? ratings = null,
        IReadOnlyDictionary<Guid, PaymentStatus>? paymentStatuses = null,
        TimeSpan? chargeWindow = null)
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
            NextOccurrence: next?.ToDto(paymentStatuses),
            Occurrences: includeOccurrences ? occurrences.Select(o => o.ToDto(paymentStatuses)).ToList() : [],
            Ratings: ratings,
            Payment: ToPaymentDto(booking, occurrences, paymentStatuses, nowUtc, chargeWindow));
    }

    /// <summary>Maps one occurrence.</summary>
    public static OccurrenceDto ToDto(
        this BookingOccurrence occurrence,
        IReadOnlyDictionary<Guid, PaymentStatus>? paymentStatuses = null) => new(
        Id: occurrence.Id,
        StartUtc: occurrence.StartUtc,
        EndUtc: occurrence.EndUtc,
        LocalDate: occurrence.LocalDate,
        Status: FlagEnumExtensions.ToCamelCaseToken(occurrence.Status.ToString()),
        NoShowMarkedBy: occurrence.NoShowMarkedBy,
        PaymentStatus: paymentStatuses?.TryGetValue(occurrence.Id, out var payment) is true
            ? FlagEnumExtensions.ToCamelCaseToken(payment.ToString())
            : null);

    /// <summary>
    /// The additive payment block: mode from the price snapshot's presence; next charge time =
    /// the earliest scheduled occurrence not yet successfully charged, clamped to now
    /// (the first occurrence charges at confirmation — booking-modes.md charge timing).
    /// </summary>
    private static BookingPaymentDto ToPaymentDto(
        Booking booking,
        IReadOnlyList<BookingOccurrence> occurrences,
        IReadOnlyDictionary<Guid, PaymentStatus>? paymentStatuses,
        DateTimeOffset nowUtc,
        TimeSpan? chargeWindow)
    {
        if (booking.PricePerOccurrence is not { } amount)
        {
            return new BookingPaymentDto("offline", null, null, null);
        }

        DateTimeOffset? nextChargeAtUtc = null;
        if (chargeWindow is { } window && booking.Status == BookingStatus.Confirmed)
        {
            var nextUnpaid = occurrences.FirstOrDefault(o =>
                o.Status == OccurrenceStatus.Scheduled
                && o.StartUtc > nowUtc
                && (paymentStatuses is null
                    || !paymentStatuses.TryGetValue(o.Id, out var status)
                    || status is PaymentStatus.Failed));
            if (nextUnpaid is not null)
            {
                nextChargeAtUtc = ChargePlanner.NextChargeAtUtc(nextUnpaid.StartUtc, nowUtc, window);
            }
        }

        return new BookingPaymentDto("inApp", amount, booking.Currency, nextChargeAtUtc);
    }

    /// <summary>
    /// The booking's stored venue-local schedule as the shared wire shape. Only weekly recurrence
    /// exists, so a Recurring booking always renders as <c>recurringWeekly</c>.
    /// </summary>
    public static ScheduleDto ToScheduleDto(this Booking booking) => new(
        Frequency: booking.Type == BookingType.Recurring ? "recurringWeekly" : "oneOff",
        StartDate: booking.StartDate,
        EndDate: booking.EndDate,
        DaysOfWeek: booking.DaysOfWeek is { } days && days != Weekdays.None ? days.ToNameList() : null,
        StartTime: booking.StartTime.ToString("HH\\:mm"),
        EndTime: booking.EndTime.ToString("HH\\:mm"));
}
