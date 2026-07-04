using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using Steeple.Api.Services.Notifications;

namespace Steeple.Api.Proxies.Notifications;
/// <summary>
/// <see cref="IEmailGateway"/> adapter for Resend's HTTP API (<c>POST /emails</c>, bearer key) —
/// a managed transactional sender per SYSTEM_DESIGN §8 (never SMTP from the droplet; free tier
/// fits the cost ceiling). Without a configured key it logs the send instead (dev-friendly, and
/// the inbox row is the record of truth anyway). Failures log and return — callers may
/// fire-and-forget.
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
    public async Task SendAsync(string toEmail, string subject, string textBody, CancellationToken ct = default)
    {
        var body = AppendWebLink(textBody);

        if (string.IsNullOrEmpty(_options.ApiKey))
        {
            _logger.LogInformation(
                "Email (log-only mode, no Email:ApiKey): to={To} subject={Subject}\n{Body}",
                toEmail, subject, body);
            return;
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
            {
                Headers = { Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey) },
                Content = JsonContent.Create(new
                {
                    from = _options.From,
                    to = new[] { toEmail },
                    subject,
                    text = body,
                }),
            };

            using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Resend rejected an email: {StatusCode} {Reason}.",
                    (int)response.StatusCode, response.ReasonPhrase);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Email send failed (provider unreachable).");
        }
    }

    /// <summary>Emails say "from your Steeple inbox" — give that sentence a real link when configured.</summary>
    private string AppendWebLink(string textBody) =>
        string.IsNullOrEmpty(_options.WebBaseUrl)
            ? textBody
            : $"{textBody}\n\n{_options.WebBaseUrl.TrimEnd('/')}/inbox";
}
