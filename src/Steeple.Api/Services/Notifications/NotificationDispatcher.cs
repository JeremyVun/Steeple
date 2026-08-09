using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Default <see cref="INotificationDispatcher"/>: atomically writes inbox rows (inbox = truth)
/// and durable email/push work. Providers are called only by <see cref="NotificationOutboxWorker"/>
/// in a worker-owned scope (SYSTEM_DESIGN §8).
/// </summary>
public sealed class NotificationDispatcher : INotificationDispatcher
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly INotificationRepository _repository;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly EmailOptions _emailOptions;

    /// <summary>Creates the dispatcher from its ports.</summary>
    public NotificationDispatcher(
        INotificationRepository repository,
        IAnalyticsSink analytics,
        TimeProvider clock,
        IOptions<EmailOptions> emailOptions)
    {
        _repository = repository;
        _analytics = analytics;
        _clock = clock;
        _emailOptions = emailOptions.Value;
    }

    /// <inheritdoc />
    public async Task NotifyAsync(
        IReadOnlyList<NotificationRecipient> recipients,
        NotificationType type,
        object payload,
        EmailContent? email,
        CancellationToken ct = default)
    {
        if (recipients.Count == 0)
        {
            return;
        }

        var now = _clock.GetUtcNow();
        var payloadJson = JsonSerializer.Serialize(payload, PayloadJsonOptions);
        var deepLink = ExtractDeepLink(payloadJson);

        var rows = recipients.Select(r => new Notification
        {
            Id = Guid.NewGuid(),
            UserId = r.UserId,
            Type = type,
            PayloadJson = payloadJson,
            CreatedAtUtc = now,
        }).ToList();

        var deliveries = new List<NotificationOutbox>(rows.Count * (email is null ? 1 : 2));
        var typeToken = FlagEnumExtensions.ToCamelCaseToken(type.ToString());
        EmailContent? composedEmail = null;

        if (email is not null)
        {
            // One composition for the whole fan-out: the CTA points at the payload's own deep
            // link, so email, push and the inbox row can never disagree about where this event
            // lives (docs/contracts/web.md — deep links from email/push into the SPA).
            composedEmail = WithCallToAction(email, type, deepLink);
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var recipient = recipients[index];

            if (composedEmail is not null && !string.IsNullOrEmpty(recipient.Email))
            {
                deliveries.Add(NewDelivery(
                    NotificationOutboxChannel.Email,
                    type,
                    new EmailOutboxPayload(
                        recipient.Email!,
                        composedEmail.Subject,
                        composedEmail.TextBody,
                        composedEmail.HtmlBody),
                    now));
            }

            // Push work exists for every recipient. The worker resolves that user's current tokens
            // inside its own scope; no registered devices is a successful no-op.
            deliveries.Add(NewDelivery(
                NotificationOutboxChannel.Push,
                type,
                new PushOutboxPayload(row.UserId, row.Id.ToString(), typeToken, deepLink ?? ""),
                now));
        }

        // One SaveChanges call is the transaction boundary: an inbox row can never commit without
        // all delivery work decided for it, and failed provider calls happen later in the worker.
        await _repository.AddRangeAsync(rows, deliveries, ct).ConfigureAwait(false);
        await TrackSafelyAsync(type, recipients.Count, email is not null).ConfigureAwait(false);
    }

    private static NotificationOutbox NewDelivery(
        NotificationOutboxChannel channel,
        NotificationType kind,
        object payload,
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        Channel = channel,
        Kind = kind,
        PayloadJson = JsonSerializer.Serialize(payload, PayloadJsonOptions),
        CreatedAtUtc = now,
        NextAttemptAtUtc = now,
    };

    /// <summary>
    /// Appends the CTA to every part the mail carries. Without a configured
    /// <see cref="EmailOptions.WebBaseUrl"/> the content is returned untouched — emails then
    /// carry no links at all rather than a link to nowhere.
    /// </summary>
    private EmailContent WithCallToAction(EmailContent email, NotificationType type, string? deepLink)
    {
        var url = EmailCta.BuildUrl(_emailOptions.WebBaseUrl, deepLink);
        if (url is null)
        {
            return email;
        }

        return email with
        {
            TextBody = $"{email.TextBody}\n\n{EmailCta.TextLine(type, url)}",
            HtmlBody = string.IsNullOrEmpty(email.HtmlBody)
                ? email.HtmlBody
                : email.HtmlBody + EmailCta.HtmlLine(type, url),
        };
    }

    /// <summary>Deserializes the payload's optional <c>deepLink</c> field.</summary>
    private static string? ExtractDeepLink(string payloadJson)
    {
        try
        {
            return JsonSerializer.Deserialize<DeepLinkPayload>(payloadJson, PayloadJsonOptions)?.DeepLink;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record DeepLinkPayload(string? DeepLink);

    private async Task TrackSafelyAsync(NotificationType type, int recipientCount, bool emailed)
    {
        try
        {
            await _analytics.TrackAsync(
                "notification_sent",
                new
                {
                    type = FlagEnumExtensions.ToCamelCaseToken(type.ToString()),
                    // Push is enqueued for every recipient (delivery is a no-op when no device is
                    // registered). This event means the transaction committed, not that a remote
                    // provider acknowledged delivery; terminal failures are logged separately.
                    channel = emailed ? "inbox+email+push" : "inbox+push",
                    recipientCount,
                }).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort: never throw from analytics.
        }
    }
}
