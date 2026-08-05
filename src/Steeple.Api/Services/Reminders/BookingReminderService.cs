using System.Globalization;
using Microsoft.Extensions.Options;
using Steeple.Api.Services.Manage;

namespace Steeple.Api.Services.Reminders;
/// <summary>
/// Nudges both parties before a confirmed booking's occurrences.
/// <list type="bullet">
///   <item>"Coming up" fires a week before the booking's <em>first</em> upcoming occurrence.</item>
///   <item>"Tomorrow" fires the day before <em>every</em> occurrence.</item>
/// </list>
/// The asymmetry is deliberate: a weekly recurring booking would otherwise collect two emails
/// every week forever — the week-out nudge is about the commitment, the day-before one is about
/// the date. Every send is claimed in the <c>booking_reminders</c> ledger first (unique on
/// occurrence + kind), so a double run, a restart mid-sweep or a second replica cannot double-send.
/// </summary>
public sealed class BookingReminderService : IBookingReminderService
{
    private readonly IBookingReminderRepository _repository;
    private readonly IVenueManagerRepository _venueManagers;
    private readonly INotificationDispatcher _notifications;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly ReminderOptions _options;
    private readonly ILogger<BookingReminderService> _logger;

    /// <summary>Creates the sweep from its ports.</summary>
    public BookingReminderService(
        IBookingReminderRepository repository,
        IVenueManagerRepository venueManagers,
        INotificationDispatcher notifications,
        IAnalyticsSink analytics,
        TimeProvider clock,
        IOptions<ReminderOptions> options,
        ILogger<BookingReminderService> logger)
    {
        _repository = repository;
        _venueManagers = venueManagers;
        _notifications = notifications;
        _analytics = analytics;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> RunOnceAsync(CancellationToken ct = default)
    {
        var now = _clock.GetUtcNow();
        var horizon = now + _options.ComingUpLeadTime;
        var bookings = await _repository.GetDueAsync(now, horizon, ct).ConfigureAwait(false);

        var sent = 0;
        foreach (var booking in bookings)
        {
            foreach (var (occurrence, kind) in DueReminders(booking, now))
            {
                if (await SendAsync(booking, occurrence, kind, now, ct).ConfigureAwait(false))
                {
                    sent++;
                }
            }
        }

        return sent;
    }

    /// <summary>
    /// What this booking owes right now. "Tomorrow" wins where the windows overlap — a booking
    /// confirmed inside its own week-out window never gets both nudges for the same date.
    /// </summary>
    private IEnumerable<(BookingOccurrence Occurrence, BookingReminderKind Kind)> DueReminders(
        Booking booking, DateTimeOffset now)
    {
        var upcoming = booking.Occurrences
            .Where(o => o.Status == OccurrenceStatus.Scheduled && o.StartUtc > now)
            .OrderBy(o => o.StartUtc)
            .ToList();

        if (upcoming.Count == 0)
        {
            yield break;
        }

        foreach (var occurrence in upcoming.Where(o => o.StartUtc - now <= _options.TomorrowLeadTime))
        {
            yield return (occurrence, BookingReminderKind.Tomorrow);
        }

        var first = upcoming[0];
        if (first.StartUtc - now > _options.TomorrowLeadTime && first.StartUtc - now <= _options.ComingUpLeadTime)
        {
            yield return (first, BookingReminderKind.ComingUp);
        }
    }

    /// <summary>
    /// Claims the reminder, then tells both sides. The claim comes first so a crash between the
    /// two costs at most one missed nudge, never a duplicate one; a failed dispatch hands the
    /// claim back for the next sweep.
    /// </summary>
    private async Task<bool> SendAsync(
        Booking booking, BookingOccurrence occurrence, BookingReminderKind kind, DateTimeOffset now, CancellationToken ct)
    {
        if (!await _repository.TryClaimAsync(occurrence.Id, kind, now, ct).ConfigureAwait(false))
        {
            return false;
        }

        try
        {
            var payload = BuildPayload(booking, occurrence, kind);
            var when = DescribeOccurrence(booking, occurrence);
            var room = booking.Room!;
            var venue = room.Venue!;
            var organizerName = booking.Organizer!.DisplayName;
            var recipientCount = 0;

            await _notifications.NotifyAsync(
                [new NotificationRecipient(booking.OrganizerId, booking.Organizer.Email)],
                NotificationType.BookingReminder,
                payload,
                OrganizerEmail(kind, room.Name, venue.Name, when),
                ct).ConfigureAwait(false);
            recipientCount++;

            var managers = await _venueManagers.GetManagersAsync(venue.Id, ct).ConfigureAwait(false);
            if (managers.Count > 0)
            {
                await _notifications.NotifyAsync(
                    managers.Select(m => new NotificationRecipient(m.Id, m.Email)).ToList(),
                    NotificationType.BookingReminder,
                    payload,
                    HostEmail(kind, room.Name, organizerName, when),
                    ct).ConfigureAwait(false);
                recipientCount += managers.Count;
            }

            await TrackSafelyAsync(booking, kind, recipientCount, ct).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Nothing (or only half) went out: release the claim so the next sweep tries again.
            _logger.LogWarning(ex, "Booking reminder dispatch failed for occurrence {OccurrenceId}.", occurrence.Id);
            await _repository.ReleaseClaimAsync(occurrence.Id, kind, CancellationToken.None).ConfigureAwait(false);
            return false;
        }
    }

    private static EmailContent OrganizerEmail(
        BookingReminderKind kind, string roomName, string venueName, string when) =>
        kind == BookingReminderKind.Tomorrow
            ? new EmailContent(
                Subject: $"Tomorrow: {roomName} at {venueName}",
                TextBody:
                    $"A reminder that you have {roomName} at {venueName} booked tomorrow.\n\n" +
                    $"When: {when}\n\n" +
                    "If your plans have changed, cancelling from your booking frees the time for " +
                    "someone else.")
            : new EmailContent(
                Subject: $"Coming up: {roomName} at {venueName}",
                TextBody:
                    $"Your booking of {roomName} at {venueName} is a week away.\n\n" +
                    $"When: {when}\n\n" +
                    "Nothing to do — this is just so the date doesn't arrive as a surprise. Your host " +
                    "has been reminded too.");

    private static EmailContent HostEmail(
        BookingReminderKind kind, string roomName, string organizerName, string when) =>
        kind == BookingReminderKind.Tomorrow
            ? new EmailContent(
                Subject: $"Tomorrow: {organizerName} in {roomName}",
                TextBody:
                    $"{organizerName} has {roomName} booked tomorrow.\n\n" +
                    $"When: {when}\n\n" +
                    "Worth a last look at access and setup — they've had the same reminder.")
            : new EmailContent(
                Subject: $"Coming up: {organizerName} in {roomName}",
                TextBody:
                    $"{organizerName} has {roomName} booked a week from now.\n\n" +
                    $"When: {when}\n\n" +
                    "Nothing to do yet — a closer reminder follows the day before.");

    /// <summary>
    /// The inbox row's document. Same shape as the Bookings module's payload (clients render from
    /// this), plus which occurrence and which nudge this row is about.
    /// </summary>
    private static object BuildPayload(Booking booking, BookingOccurrence occurrence, BookingReminderKind kind) => new
    {
        bookingId = booking.Id,
        occurrenceId = occurrence.Id,
        roomId = booking.RoomId,
        roomName = booking.Room!.Name,
        venueName = booking.Room.Venue!.Name,
        venueSlug = booking.Room.Venue.Slug,
        roomSlug = booking.Room.Slug,
        organizerName = booking.Organizer!.DisplayName,
        reminderKind = FlagEnumExtensions.ToCamelCaseToken(kind.ToString()),
        startsAtUtc = occurrence.StartUtc,
        localDate = occurrence.LocalDate,
        deepLink = $"/bookings/{booking.Id}",
    };

    /// <summary>"Tue, Sep 1, 9:00 AM–11:30 AM" — the occurrence's own venue-local date and hours.</summary>
    private static string DescribeOccurrence(Booking booking, BookingOccurrence occurrence) =>
        $"{occurrence.LocalDate.ToString("ddd, MMM d", CultureInfo.InvariantCulture)}, " +
        $"{FormatTime(booking.StartTime)}–{FormatTime(booking.EndTime)}";

    private static string FormatTime(TimeOnly time) => time.ToString("h:mm tt", CultureInfo.InvariantCulture);

    private async Task TrackSafelyAsync(
        Booking booking, BookingReminderKind kind, int recipientCount, CancellationToken ct)
    {
        try
        {
            await _analytics.TrackAsync(
                "booking_reminder_sent",
                new
                {
                    bookingId = booking.Id,
                    kind = FlagEnumExtensions.ToCamelCaseToken(kind.ToString()),
                    recipientCount,
                },
                sessionId: null,
                ct).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: never throw from analytics.
        }
    }
}
