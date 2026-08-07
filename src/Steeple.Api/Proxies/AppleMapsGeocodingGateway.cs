using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies;
/// <summary>
/// Apple Maps Server adapter for <see cref="IGeocodingGateway"/> (SYSTEM_DESIGN §10): forward
/// geocoding plus address autocomplete, both biased to the beachhead. Called only from the manage
/// flow — a metered, per-team-quota API must never sit on a hot public path. Failures return
/// null/empty (the manage flow turns that into a friendly "check the address" error).
/// </summary>
public sealed class AppleMapsGeocodingGateway : IGeocodingGateway
{
    private const string BaseUrl = "https://maps-api.apple.com";

    private readonly HttpClient _http;
    private readonly AppleMapsTokenProvider _tokens;
    private readonly GeofenceOptions _geofence;
    private readonly string _countryParam;
    private readonly ILogger<AppleMapsGeocodingGateway> _logger;

    /// <summary>Creates the gateway over its typed HttpClient and the shared token cache.</summary>
    public AppleMapsGeocodingGateway(
        HttpClient http,
        AppleMapsTokenProvider tokens,
        IOptions<GeofenceOptions> geofence,
        IOptions<GeocodingOptions> geocoding,
        ILogger<AppleMapsGeocodingGateway> logger)
    {
        _http = http;
        _tokens = tokens;
        _geofence = geofence.Value;
        _countryParam = CountryParam(geocoding.Value.LimitToCountries);
        _logger = logger;
    }

    /// <summary>The <c>limitToCountries</c> query fragment, or empty for worldwide results.</summary>
    private static string CountryParam(string limitToCountries)
    {
        var codes = string.Join(",", limitToCountries
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        return codes.Length == 0 ? "" : $"&limitToCountries={Uri.EscapeDataString(codes)}";
    }

    /// <inheritdoc />
    public async Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return null;
        }

        var url = $"{BaseUrl}/v1/geocode?q={Uri.EscapeDataString(address)}{_countryParam}&lang=en-US";
        var response = await GetAsync<GeocodeResponse>(url, ct).ConfigureAwait(false);
        if (response?.Results is not [var first, ..])
        {
            return null;
        }

        return first.Coordinate is { Latitude: double latitude, Longitude: double longitude }
            ? new GeoPoint(latitude, longitude)
            : null;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        var searchLocation = FormattableString.Invariant($"{_geofence.CenterLatitude},{_geofence.CenterLongitude}");
        var url = $"{BaseUrl}/v1/searchAutocomplete?q={Uri.EscapeDataString(text)}" +
            $"&resultTypeFilter=address{_countryParam}&lang=en-US&searchLocation={searchLocation}";

        var response = await GetAsync<AutocompleteResponse>(url, ct).ConfigureAwait(false);
        if (response is null)
        {
            return [];
        }

        return ParseSuggestions(response);
    }

    /// <summary>
    /// Deserializes a <c>searchAutocomplete</c> fixture through the same typed wire model used in
    /// production. Results without a coordinate are dropped because the port promises a
    /// resolvable place.
    /// </summary>
    public static IReadOnlyList<AddressSuggestion> ParseSuggestions(string json) =>
        ParseSuggestions(JsonSerializer.Deserialize<AutocompleteResponse>(json)
            ?? throw new JsonException("Apple Maps autocomplete response was null."));

    private static IReadOnlyList<AddressSuggestion> ParseSuggestions(AutocompleteResponse response)
    {
        var suggestions = new List<AddressSuggestion>();
        foreach (var result in response.Results ?? [])
        {
            var latitude = result.Location?.Latitude ?? result.Location?.Lat;
            var longitude = result.Location?.Longitude ?? result.Location?.Lng;
            if (latitude is null || longitude is null || result.DisplayLines is null)
            {
                continue;
            }

            var label = string.Join(", ", result.DisplayLines
                .Where(line => !string.IsNullOrWhiteSpace(line)));
            if (label.Length == 0)
            {
                continue;
            }

            string? addressLine = null, suburb = null, postcode = null;
            if (result.StructuredAddress is { } address)
            {
                addressLine = address.FullThoroughfare;
                suburb = address.Locality;
                postcode = address.PostCode;
            }

            suggestions.Add(new AddressSuggestion(
                label,
                latitude.Value,
                longitude.Value,
                addressLine,
                suburb,
                postcode));
        }

        return suggestions;
    }

    private async Task<T?> GetAsync<T>(string url, CancellationToken ct) where T : class
    {
        var accessToken = await _tokens.GetAccessTokenAsync(ct).ConfigureAwait(false);
        if (accessToken is null)
        {
            return null;
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

            using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                // 429 means the 25k/day team quota is spent — worth a distinct signal in logs.
                _logger.LogWarning("Apple Maps answered {Status} for {Path}.", (int)response.StatusCode, new Uri(url).AbsolutePath);
                return null;
            }

            return await response.Content.ReadFromJsonAsync<T>(cancellationToken: ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Apple Maps call failed for {Path}.", new Uri(url).AbsolutePath);
            return null;
        }
    }

    private sealed class GeocodeResponse
    {
        [JsonPropertyName("results")]
        public List<GeocodeResult>? Results { get; init; }
    }

    private sealed class GeocodeResult
    {
        [JsonPropertyName("coordinate")]
        public Coordinate? Coordinate { get; init; }
    }

    private sealed class Coordinate
    {
        [JsonPropertyName("latitude")]
        public double? Latitude { get; init; }

        [JsonPropertyName("longitude")]
        public double? Longitude { get; init; }
    }

    private sealed class AutocompleteResponse
    {
        [JsonPropertyName("results")]
        public List<AutocompleteResult>? Results { get; init; }
    }

    private sealed class AutocompleteResult
    {
        [JsonPropertyName("displayLines")]
        public List<string?>? DisplayLines { get; init; }

        [JsonPropertyName("location")]
        public AutocompleteLocation? Location { get; init; }

        [JsonPropertyName("structuredAddress")]
        public StructuredAddress? StructuredAddress { get; init; }
    }

    private sealed class AutocompleteLocation
    {
        // Apple's Location schema uses the long names, while its searchAutocomplete example and
        // some responses use lat/lng. Keep that provider inconsistency inside this wire model.
        [JsonPropertyName("latitude")]
        public double? Latitude { get; init; }

        [JsonPropertyName("longitude")]
        public double? Longitude { get; init; }

        [JsonPropertyName("lat")]
        public double? Lat { get; init; }

        [JsonPropertyName("lng")]
        public double? Lng { get; init; }
    }

    private sealed class StructuredAddress
    {
        [JsonPropertyName("fullThoroughfare")]
        public string? FullThoroughfare { get; init; }

        [JsonPropertyName("locality")]
        public string? Locality { get; init; }

        [JsonPropertyName("postCode")]
        public string? PostCode { get; init; }
    }
}
