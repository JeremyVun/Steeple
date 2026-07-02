
namespace Steeple.Api.Proxies;
/// <summary>
/// External gateway port for forward geocoding and address autocomplete.
/// </summary>
public interface IGeocodingGateway
{
    /// <summary>
    /// Resolves a free-text address to a coordinate, or <c>null</c> when it cannot be geocoded.
    /// </summary>
    Task<GeoPoint?> GeocodeAsync(string address, CancellationToken ct = default);

    /// <summary>
    /// Returns address suggestions for partial input (autocomplete).
    /// </summary>
    Task<IReadOnlyList<AddressSuggestion>> AutocompleteAsync(string text, CancellationToken ct = default);
}

/// <summary>
/// A single address autocomplete suggestion with its resolved coordinate.
/// </summary>
/// <param name="Label">Human-readable address label.</param>
/// <param name="Latitude">Latitude in decimal degrees.</param>
/// <param name="Longitude">Longitude in decimal degrees.</param>
public record AddressSuggestion(string Label, double Latitude, double Longitude);
