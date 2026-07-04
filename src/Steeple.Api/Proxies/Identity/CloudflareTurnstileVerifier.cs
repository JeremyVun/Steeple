using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Identity;
/// <summary>
/// Cloudflare Turnstile siteverify adapter. With no secret configured the check is disabled and
/// every request passes — local dev and pre-Cloudflare environments; the deployed environment
/// must set <c>Turnstile__SecretKey</c>. Verification failures (network, non-2xx) fail closed.
/// </summary>
public sealed class CloudflareTurnstileVerifier : ITurnstileVerifier
{
    private const string SiteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private readonly HttpClient _http;
    private readonly TurnstileOptions _options;
    private readonly ILogger<CloudflareTurnstileVerifier> _logger;

    /// <summary>Creates the verifier.</summary>
    public CloudflareTurnstileVerifier(HttpClient http, IOptions<TurnstileOptions> options, ILogger<CloudflareTurnstileVerifier> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(_options.SecretKey))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        try
        {
            var form = new Dictionary<string, string>
            {
                ["secret"] = _options.SecretKey,
                ["response"] = token,
            };
            if (!string.IsNullOrEmpty(remoteIp))
            {
                form["remoteip"] = remoteIp;
            }

            using var response = await _http.PostAsync(SiteverifyUrl, new FormUrlEncodedContent(form), ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            var body = await response.Content.ReadFromJsonAsync<SiteverifyResponse>(ct).ConfigureAwait(false);
            return body?.Success == true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Turnstile siteverify call failed; treating as not verified.");
            return false;
        }
    }

    private sealed record SiteverifyResponse(bool Success);
}
