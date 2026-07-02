using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies;
/// <summary>
/// Development stub for <see cref="IGeocodingGateway"/>. Resolves any non-empty address to the
/// beachhead center and returns a small set of canned suggestions. A real provider
/// (Google Places / Apple MapKit) drops in later behind this same port.
/// </summary>
public class StubGeocodingGateway : IGeocodingGateway
{
    private readonly GeofenceOptions _geofence;
    private readonly ILogger<StubGeocodingGateway> _logger;

    /// <summary>Creates the stub gateway using the configured geofence center.</summary>
    public StubGeocodingGateway(IOptions<GeofenceOptions> geofence, ILogger<StubGeocodingGateway> logger)
    {
        _geofence = geofence.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return Task.FromResult<GeoPoint?>(null);
        }

        _logger.LogInformation(
            "StubGeocodingGateway: dev stub resolving address {Address} to beachhead center ({Lat}, {Lng}).",
            address, _geofence.CenterLatitude, _geofence.CenterLongitude);

        var center = new GeoPoint(_geofence.CenterLatitude, _geofence.CenterLongitude);
        return Task.FromResult<GeoPoint?>(center);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "StubGeocodingGateway: dev stub returning canned suggestions for {Text}.", text);

        var lat = _geofence.CenterLatitude;
        var lng = _geofence.CenterLongitude;

        IReadOnlyList<AddressSuggestion> suggestions = new List<AddressSuggestion>
        {
            new("Vienna, VA 22180", lat, lng),
            new("Oakton, VA 22124", lat + 0.02, lng - 0.04),
            new("Falls Church, VA 22043", lat - 0.03, lng + 0.07),
        };

        return Task.FromResult(suggestions);
    }
}
