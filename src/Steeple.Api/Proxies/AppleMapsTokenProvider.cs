using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies;
/// <summary>
/// Mints and caches Apple Maps Server access tokens. A short-lived ES256 team JWT (signed with
/// the developer-account private key) is exchanged at <c>GET /v1/token</c> for an access token
/// that every Maps API call carries; the exchange is single-flight and the token is reused until
/// shortly before its expiry. Registered as a singleton so the cache spans requests.
/// </summary>
public sealed class AppleMapsTokenProvider : IDisposable
{
    private static readonly TimeSpan AuthTokenLifetime = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromSeconds(60);

    private readonly IHttpClientFactory _httpFactory;
    private readonly GeocodingOptions _options;
    private readonly ILogger<AppleMapsTokenProvider> _logger;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private string? _accessToken;
    private DateTimeOffset _accessTokenExpiresAt = DateTimeOffset.MinValue;

    /// <summary>Creates the provider over the shared HttpClient factory and Apple credentials.</summary>
    public AppleMapsTokenProvider(IHttpClientFactory httpFactory, IOptions<GeocodingOptions> options, ILogger<AppleMapsTokenProvider> logger)
    {
        _httpFactory = httpFactory;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>
    /// A currently-valid Maps access token, or <c>null</c> when the exchange fails (callers treat
    /// that as a transient geocoding outage, matching the gateway's null/empty stance).
    /// </summary>
    public async Task<string?> GetAccessTokenAsync(CancellationToken ct = default)
    {
        if (DateTimeOffset.UtcNow < _accessTokenExpiresAt)
        {
            return _accessToken;
        }

        await _refreshLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (DateTimeOffset.UtcNow < _accessTokenExpiresAt)
            {
                return _accessToken;
            }

            return await ExchangeAsync(ct).ConfigureAwait(false);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private async Task<string?> ExchangeAsync(CancellationToken ct)
    {
        string authToken;
        try
        {
            using var key = ImportPrivateKey(_options.ApplePrivateKey);
            authToken = CreateAuthorizationToken(key, _options.AppleTeamId, _options.AppleKeyId, DateTimeOffset.UtcNow, AuthTokenLifetime);
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException or ArgumentException)
        {
            _logger.LogError(ex, "Apple Maps private key could not be parsed; check Geocoding:ApplePrivateKey.");
            return null;
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "https://maps-api.apple.com/v1/token");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authToken);

            var http = _httpFactory.CreateClient(nameof(AppleMapsTokenProvider));
            using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Apple Maps token exchange answered {Status}.", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadFromJsonAsync<AccessTokenResponse>(cancellationToken: ct).ConfigureAwait(false);
            if (body is null || string.IsNullOrWhiteSpace(body.AccessToken) || body.ExpiresInSeconds <= 0)
            {
                _logger.LogWarning("Apple Maps token exchange returned an invalid response.");
                return null;
            }

            _accessToken = body.AccessToken;
            _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(body.ExpiresInSeconds) - ExpiryMargin;
            return body.AccessToken;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Apple Maps token exchange failed.");
            return null;
        }
    }

    /// <summary>
    /// Builds the signed team JWT Apple's token endpoint expects: ES256, <c>kid</c> in the header,
    /// <c>iss</c>/<c>iat</c>/<c>exp</c>/<c>scope: server_api</c> claims.
    /// </summary>
    public static string CreateAuthorizationToken(ECDsa key, string teamId, string keyId, DateTimeOffset now, TimeSpan lifetime)
    {
        var header = JsonSerializer.Serialize(new { alg = "ES256", kid = keyId, typ = "JWT" });
        var payload = JsonSerializer.Serialize(new
        {
            iss = teamId,
            iat = now.ToUnixTimeSeconds(),
            exp = now.Add(lifetime).ToUnixTimeSeconds(),
            scope = "server_api",
        });

        var signingInput = $"{Base64Url(Encoding.UTF8.GetBytes(header))}.{Base64Url(Encoding.UTF8.GetBytes(payload))}";
        // SignData emits the r||s (IEEE P1363) form JWS requires — no DER conversion needed.
        var signature = key.SignData(Encoding.UTF8.GetBytes(signingInput), HashAlgorithmName.SHA256);
        return $"{signingInput}.{Base64Url(signature)}";
    }

    /// <summary>Accepts the .p8 as full PEM or as its bare base64 body.</summary>
    public static ECDsa ImportPrivateKey(string material)
    {
        var key = ECDsa.Create();
        if (material.Contains("-----BEGIN", StringComparison.Ordinal))
        {
            key.ImportFromPem(material);
        }
        else
        {
            key.ImportPkcs8PrivateKey(Convert.FromBase64String(material.Trim()), out _);
        }

        return key;
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed class AccessTokenResponse
    {
        [JsonPropertyName("accessToken")]
        public string? AccessToken { get; init; }

        [JsonPropertyName("expiresInSeconds")]
        public int ExpiresInSeconds { get; init; }
    }

    /// <inheritdoc />
    public void Dispose() => _refreshLock.Dispose();
}
