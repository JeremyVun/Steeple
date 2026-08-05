using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Services.Notifications;
/// <summary>
/// Default <see cref="INotificationDispatcher"/>: writes the inbox rows first (inbox = truth),
/// then fires the email and push sends without awaiting them — a slow or failing provider must
/// never hold up or fail the request that triggered the notification (SYSTEM_DESIGN §8).
/// </summary>
public sealed class NotificationDispatcher : INotificationDispatcher
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly INotificationRepository _repository;
    private readonly IEmailGateway _email;
    private readonly IDeviceRegistry _devices;
    private readonly IPushGateway _push;
    private readonly IAnalyticsSink _analytics;
    private readonly TimeProvider _clock;
    private readonly EmailOptions _emailOptions;
    private readonly ILogger<NotificationDispatcher> _logger;

    /// <summary>Creates the dispatcher from its ports.</summary>
    public NotificationDispatcher(
        INotificationRepository repository,
        IEmailGateway email,
        IDeviceRegistry devices,
        IPushGateway push,
        IAnalyticsSink analytics,
        TimeProvider clock,
        IOptions<EmailOptions> emailOptions,
        ILogger<NotificationDispatcher> logger)
    {
        _repository = repository;
        _email = email;
        _devices = devices;
        _push = push;
        _analytics = analytics;
        _clock = clock;
        _emailOptions = emailOptions.Value;
        _logger = logger;
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

        await _repository.AddRangeAsync(rows, ct).ConfigureAwait(false);

        if (email is not null)
        {
            // One composition for the whole fan-out: the CTA points at the payload's own deep
            // link, so email, push and the inbox row can never disagree about where this event
            // lives (docs/contracts/web.md — deep links from email/push into the SPA).
            var composed = WithCallToAction(email, type, deepLink);

            foreach (var recipient in recipients.Where(r => !string.IsNullOrEmpty(r.Email)))
            {
                // Deliberately not awaited: the inbox row is already the record of truth, and the
                // gateway is a singleton over HttpClient, safe to outlive this scoped request.
                // CancellationToken.None so an aborted request doesn't cancel a send already decided on.
                _ = SendEmailSafelyAsync(recipient.Email!, composed, type);
            }
        }

        // Push, one send per recipient's own inbox row (notificationId = that row's id) — the
        // client fetches/renders from the inbox, this only ever points at it (CONTRACTS §9).
        // Token lookup is awaited here: the device registry shares this request's scoped
        // DbContext, which must never be touched from an unawaited task. Only the gateway
        // send (singleton over HttpClient) is safe to outlive the request.
        foreach (var row in rows)
        {
            var tokens = await _devices.GetTokensAsync(row.UserId, ct).ConfigureAwait(false);
            if (tokens.Count > 0)
            {
                _ = SendPushSafelyAsync(tokens, row, type, deepLink);
            }
        }

        await TrackSafelyAsync(type, recipients.Count, email is not null).ConfigureAwait(false);
    }

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

    private async Task SendEmailSafelyAsync(string toEmail, EmailContent email, NotificationType type)
    {
        try
        {
            await _email.SendAsync(toEmail, email, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Email fan-out failed for a {NotificationType} notification.", type);
        }
    }

    private async Task SendPushSafelyAsync(
        IReadOnlyList<string> tokens, Notification row, NotificationType type, string? deepLink)
    {
        try
        {
            var message = new PushMessage(
                NotificationId: row.Id.ToString(),
                Type: FlagEnumExtensions.ToCamelCaseToken(type.ToString()),
                DeepLink: deepLink ?? "");

            await _push.SendAsync(tokens, message, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Push fan-out failed for a {NotificationType} notification.", type);
        }
    }

    /// <summary>Reads the payload's own <c>deepLink</c> property back out of its serialized JSON.</summary>
    private static string? ExtractDeepLink(string payloadJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            return doc.RootElement.TryGetProperty("deepLink", out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task TrackSafelyAsync(NotificationType type, int recipientCount, bool emailed)
    {
        try
        {
            await _analytics.TrackAsync(
                "notification_sent",
                new
                {
                    type = FlagEnumExtensions.ToCamelCaseToken(type.ToString()),
                    // Push is now attempted for every recipient (fire-and-forget, no-op for
                    // devices with no registered tokens) — the channel label reflects that
                    // unconditionally, same as it did for "inbox" before push existed.
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
