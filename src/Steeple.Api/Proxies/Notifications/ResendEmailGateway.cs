using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// <see cref="IEmailGateway"/> adapter for Resend's HTTP API (<c>POST /emails</c>, bearer key) —
/// a managed transactional sender per SYSTEM_DESIGN §8 (never SMTP from the droplet; free tier
/// fits the cost ceiling). Without a configured key it does nothing: the notification inbox row
/// remains the record of truth, and private recipient/content data never reaches logs. Provider
/// failures throw after a PII-free log so the durable outbox worker can retry. Transport only: the
/// body arrives fully composed from the dispatcher, CTA link included.
/// </summary>
public sealed class ResendEmailGateway : IEmailGateway
{
    private static readonly Uri Endpoint = new("https://api.resend.com/emails");

    private readonly HttpClient _http;
    private readonly EmailOptions _options;
    private readonly ILogger<ResendEmailGateway> _logger;

    /// <summary>Creates the gateway.</summary>
    public ResendEmailGateway(HttpClient http, IOptions<EmailOptions> options, ILogger<ResendEmailGateway> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task SendAsync(string toEmail, EmailContent content, CancellationToken ct = default)
    {
        if (!_options.DeliveryEnabled)
        {
            return;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
        {
            Headers = { Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey) },
            Content = JsonContent.Create(new
            {
                from = _options.From,
                to = new[] { toEmail },
                subject = content.Subject,
                text = content.TextBody,
                // Resend treats a null `html` as "text only" — the alternative part is opt-in
                // per email, and plain text is always sent alongside it.
                html = string.IsNullOrEmpty(content.HtmlBody) ? null : content.HtmlBody,
            }),
        };

        using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Resend rejected an email: {StatusCode} {Reason}.",
                (int)response.StatusCode, response.ReasonPhrase);
            throw new HttpRequestException(
                $"Resend rejected the email with HTTP {(int)response.StatusCode}.",
                inner: null,
                response.StatusCode);
        }
    }
}
