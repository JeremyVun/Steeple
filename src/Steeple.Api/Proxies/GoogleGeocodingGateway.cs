using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies;
/// <summary>
/// Google Geocoding adapter for <see cref="IGeocodingGateway"/> (SYSTEM_DESIGN §10). Called only
/// on provider address entry — a metered SKU must never sit on a hot public path. Failures
/// return null (the manage flow turns that into a friendly "check the address" error).
/// </summary>
public sealed class GoogleGeocodingGateway : IGeocodingGateway
{
    private readonly HttpClient _http;
    private readonly GeocodingOptions _options;
    private readonly ILogger<GoogleGeocodingGateway> _logger;

    /// <summary>Creates the gateway over its typed HttpClient.</summary>
    public GoogleGeocodingGateway(HttpClient http, IOptions<GeocodingOptions> options, ILogger<GoogleGeocodingGateway> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return null;
        }

        var url = "https://maps.googleapis.com/maps/api/geocode/json" +
            $"?address={Uri.EscapeDataString(address)}&components=country:US&key={_options.GoogleApiKey}";

        try
        {
            using var response = await _http.GetAsync(url, ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            var body = await response.Content.ReadFromJsonAsync<GeocodingResponse>(cancellationToken: ct)
                .ConfigureAwait(false);
            if (body is null)
            {
                _logger.LogWarning("Google geocoding returned an empty response.");
                return null;
            }

            if (body.Status != "OK")
            {
                // ZERO_RESULTS is a normal user-typo outcome; anything else is worth a warning.
                if (body.Status != "ZERO_RESULTS")
                {
                    _logger.LogWarning("Google geocoding returned status {Status}.", body.Status);
                }

                return null;
            }

            if (body.Results is not [{ Geometry.Location: { Lat: double latitude, Lng: double longitude } }, ..])
            {
                _logger.LogWarning("Google geocoding returned OK with no resolved location.");
                return null;
            }

            return new GeoPoint(latitude, longitude);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Google geocoding call failed.");
            return null;
        }
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default) =>
        // Search-box autocomplete is a later, separately-metered Places concern (SYSTEM_DESIGN §10).
        Task.FromResult<IReadOnlyList<AddressSuggestion>>([]);

    private sealed class GeocodingResponse
    {
        [JsonPropertyName("status")]
        public string? Status { get; init; }

        [JsonPropertyName("results")]
        public List<GeocodingResult>? Results { get; init; }
    }

    private sealed class GeocodingResult
    {
        [JsonPropertyName("geometry")]
        public Geometry? Geometry { get; init; }
    }

    private sealed class Geometry
    {
        [JsonPropertyName("location")]
        public Location? Location { get; init; }
    }

    private sealed class Location
    {
        [JsonPropertyName("lat")]
        public double? Lat { get; init; }

        [JsonPropertyName("lng")]
        public double? Lng { get; init; }
    }
}
