using System.Globalization;
using Steeple.Api.Services.Manage;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Services.Applications;

/// <summary>Composes and dispatches application notifications without owning application state.</summary>
internal sealed class ApplicationNotifications(
    IVenueManagerRepository venueManagers,
    INotificationDispatcher notifications)
{
    internal Task DispatchAsync(
        IReadOnlyList<NotificationRecipient> recipients,
        NotificationType type,
        object payload,
        EmailContent? email,
        CancellationToken ct) =>
        notifications.NotifyAsync(recipients, type, payload, email, ct);

    internal async Task NotifyManagersAsync(
        Application application,
        NotificationType type,
        EmailContent? email,
        CancellationToken ct,
        string? senderName = null,
        bool messageAdded = false)
    {
        var managers = await venueManagers.GetManagersAsync(application.Room!.VenueId, ct).ConfigureAwait(false);
        if (managers.Count == 0)
        {
            return;
        }

        await notifications.NotifyAsync(
            managers.Select(m => new NotificationRecipient(m.Id, m.Email)).ToList(),
            type,
            BuildPayload(application, senderName, messageAdded),
            email,
            ct).ConfigureAwait(false);
    }

    internal Task NotifyOrganizerAsync(
        Application application,
        NotificationType type,
        EmailContent? email,
        CancellationToken ct,
        string? senderName = null,
        bool messageAdded = false) =>
        notifications.NotifyAsync(
            [new NotificationRecipient(application.OrganizerId, application.Organizer?.Email)],
            type,
            BuildPayload(application, senderName, messageAdded),
            email,
            ct);

    /// <summary>Inbox payload rendered by clients independently of email and push copy.</summary>
    internal static object BuildPayload(
        Application application,
        string? senderName = null,
        bool messageAdded = false) => new
    {
        applicationId = application.Id,
        roomId = application.RoomId,
        roomName = application.Room!.Name,
        venueName = application.Room.Venue!.Name,
        venueSlug = application.Room.Venue.Slug,
        roomSlug = application.Room.Slug,
        organizerName = application.Organizer!.DisplayName,
        status = FlagEnumExtensions.ToCamelCaseToken(application.Status.ToString()),
        senderName,
        messageAdded,
        deepLink = $"/inbox/applications/{application.Id}",
    };

    /// <summary>Human-readable venue-local schedule text for email copy.</summary>
    internal static string DescribeSchedule(Application application) =>
        DescribeSchedule(
            application.Frequency, application.DaysOfWeek, application.StartDate, application.EndDate,
            application.StartTime, application.EndTime);

    /// <summary>Human-readable venue-local counter-offer schedule text for email copy.</summary>
    internal static string DescribeSchedule(ApplicationCounterOffer counter) =>
        DescribeSchedule(
            counter.Frequency, counter.DaysOfWeek, counter.StartDate, counter.EndDate,
            counter.StartTime, counter.EndTime);

    internal static string Humanize(string memberName)
    {
        var withSpaces = string.Concat(memberName.Select(
            (c, i) => i > 0 && char.IsUpper(c) ? " " + char.ToLowerInvariant(c) : c.ToString()));
        return char.ToUpperInvariant(withSpaces[0]) + withSpaces[1..];
    }

    internal static EmailContent ApplicationReceivedEmail(Application application) => new(
        Subject: $"New request for {application.Room!.Name}",
        TextBody:
            $"{application.Organizer!.DisplayName} asked to use {application.Room.Name} at {application.Room.Venue!.Name}.\n\n" +
            $"What: {Humanize(application.ActivityType.ToString())}, about {application.GroupSize} people\n" +
            $"When: {DescribeSchedule(application)}\n\n" +
            DescribeTerms(application, application.StartTime, application.EndTime) +
            $"\"{application.IntentText}\"\n\n" +
            "Approve, ask a question, or decline from your Steeple inbox.");

    internal static EmailContent InstantOrganizerEmail(Application application, bool paymentsOn) => new(
        Subject: $"You're booked — {application.Room!.Name} at {application.Room.Venue!.Name}",
        TextBody:
            $"Your booking of {application.Room.Name} at {application.Room.Venue.Name} is confirmed.\n\n" +
            $"When: {DescribeSchedule(application)}\n\n" +
            DescribeTerms(application, application.StartTime, application.EndTime) +
            "This venue books instantly. No approval is needed.\n\n" +
            PaymentArrangement(paymentsOn) + Support(application));

    internal static EmailContent InstantManagerEmail(Application application, bool paymentsOn) => new(
        Subject: $"New booking: {application.Room!.Name}",
        TextBody:
            $"{application.Organizer!.DisplayName} booked {application.Room.Name} at {application.Room.Venue!.Name}.\n\n" +
            $"What: {Humanize(application.ActivityType.ToString())}, about {application.GroupSize} people\n" +
            $"When: {DescribeSchedule(application)}\n\n" +
            DescribeTerms(application, application.StartTime, application.EndTime) +
            $"\"{application.IntentText}\"\n\n" +
            "Your venue books instantly, so this is confirmed. You can cancel upcoming sessions from your Steeple inbox.\n\n" +
            PaymentArrangement(paymentsOn) + Support(application));

    internal static EmailContent MessageEmail(Application application, string senderName, string body) => new(
        Subject: $"New message about {application.Room!.Name}",
        TextBody:
            $"{senderName} wrote about the {(application.Status == ApplicationStatus.Approved ? "booking" : "request")} " +
            $"for {application.Room.Name} at {application.Room.Venue!.Name}:\n\n" +
            $"\"{body}\"\n\n" +
            "Reply from your Steeple inbox.");

    internal static EmailContent DecisionEmail(
        Application application,
        bool approved,
        string? message,
        bool paymentsOn = false) => approved
        ? new EmailContent(
            Subject: $"{application.Room!.Venue!.Name} said yes",
            TextBody:
                $"{application.Room.Venue.Name} approved your request to use {application.Room.Name}.\n\n" +
                $"When: {DescribeSchedule(application)}\n\n" +
                (message is { Length: > 0 } m ? $"They added: \"{m}\"\n\n" : "") +
                DescribeTerms(application, application.StartTime, application.EndTime) +
                "Your booking is confirmed. The details are in your Steeple inbox.\n\n" +
                PaymentArrangement(paymentsOn) + Support(application))
        : new EmailContent(
            Subject: $"About your request for {application.Room!.Name}",
            TextBody:
                $"{application.Room.Venue!.Name} can't host your request for {application.Room.Name} this time.\n\n" +
                (message is { Length: > 0 } declinedMessage
                    ? $"They said: \"{declinedMessage}\"\n\n"
                    : "") +
                "There are more spaces nearby on Steeple — your request details are in your inbox.");

    internal static EmailContent CounterOfferEmail(
        Application application,
        ApplicationCounterOffer counter) => new(
        Subject: $"{application.Room!.Venue!.Name} suggested a different time for {application.Room.Name}",
        TextBody:
            $"{application.Room.Venue.Name} proposed an alternative time for your request to use {application.Room.Name}.\n\n" +
            $"You asked for: {DescribeSchedule(application)}\n" +
            $"They suggested: {DescribeSchedule(counter)}\n\n" +
            DescribeTerms(application, counter.StartTime, counter.EndTime) +
            (counter.Message is { Length: > 0 } note ? $"They added: \"{note}\"\n\n" : "") +
            "Accept or decline the new time from your Steeple inbox.");

    internal static EmailContent CounterResponseEmail(
        Application application,
        ApplicationCounterOffer counter,
        bool accepted,
        bool paymentsOn = false) => new(
        Subject:
            $"{application.Organizer!.DisplayName} {(accepted ? "accepted" : "declined")} your counter-offer " +
            $"for {application.Room!.Name}",
        TextBody: accepted
            ? $"{application.Organizer.DisplayName} accepted your suggested time for {application.Room.Name} " +
                $"at {application.Room.Venue!.Name}.\n\n" +
                $"When: {DescribeSchedule(counter)}\n\n" +
                DescribeTerms(application, counter.StartTime, counter.EndTime) +
                "The booking is confirmed. The details are in your Steeple inbox.\n\n" +
                PaymentArrangement(paymentsOn) + Support(application)
            : $"{application.Organizer.DisplayName} declined your suggested time for {application.Room.Name} " +
                $"at {application.Room.Venue!.Name}.\n\n" +
                $"Their original request still stands: {DescribeSchedule(application)}\n\n" +
                "You can approve it, propose another time, or decline from your Steeple inbox.");

    internal static EmailContent SlotTakenEmail(Application application) => new(
        Subject: $"About your request for {application.Room!.Name}",
        TextBody:
            $"The time you asked for at {application.Room.Name} ({application.Room.Venue!.Name}) " +
            "was booked by another group before your request could be approved.\n\n" +
            "There are more spaces nearby on Steeple — your request details are in your inbox.");

    private static string DescribeTerms(Application application, TimeOnly start, TimeOnly end)
    {
        if (application.QuotedPricePerHour is not { } rate || application.QuotedCurrency is not { } currency ||
            application.QuotedHouseRules is not { } rules)
            return "The original price and house rules were not saved. Ask the guest to review and resubmit before confirming.\n\n";

        var amount = decimal.Round(rate * (decimal)(end - start).TotalHours, 2);
        return $"Saved price: {currency} {amount.ToString("0.00", CultureInfo.InvariantCulture)} per session " +
            $"({currency} {rate.ToString("0.00", CultureInfo.InvariantCulture)} per hour).\n" +
            $"House rules: {(rules.Length == 0 ? "No house rules were listed." : rules)}\n\n";
    }

    private static string PaymentArrangement(bool paymentsOn) => paymentsOn
        ? "Payment is collected through Steeple. The first payment is due on confirmation, with later sessions charged 48 hours before they start. Check the booking for payment status.\n\n" +
            "Guest cancellations need at least 48 hours' notice. Sessions starting sooner still stand and remain payable.\n\n"
        : "Arrange payment directly between guest and host. Steeple does not collect or refund payment for this booking.\n\n" +
            "Guest cancellations need at least 48 hours' notice. Sessions starting sooner still stand.\n\n";

    private static string Support(Application application) =>
        $"For help, email jvun@steepleapp.co and include request {application.Id}.";

    private static string DescribeSchedule(
        ScheduleFrequency frequency,
        Weekdays? days,
        DateOnly startDate,
        DateOnly? endDate,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        var start = startTime.ToString("h:mm tt", CultureInfo.InvariantCulture);
        var end = endTime.ToString("h:mm tt", CultureInfo.InvariantCulture);

        return frequency == ScheduleFrequency.RecurringWeekly
            ? $"{ScheduleText.DescribeDays(days ?? Weekdays.None)} {start}–{end}, "
                + $"{startDate.ToString("MMM d, yyyy", CultureInfo.InvariantCulture)} – "
                + $"{(endDate ?? startDate).ToString("MMM d, yyyy", CultureInfo.InvariantCulture)}"
            : $"{startDate.ToString("ddd, MMM d", CultureInfo.InvariantCulture)}, {start}–{end}";
    }
}
