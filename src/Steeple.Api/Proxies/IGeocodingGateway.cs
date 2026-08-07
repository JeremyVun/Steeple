
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
/// A single address autocomplete suggestion with its resolved coordinate. The structured parts
/// are null when the provider doesn't break the address down — clients fall back to the label.
/// </summary>
/// <param name="Label">Human-readable address label.</param>
/// <param name="Latitude">Latitude in decimal degrees.</param>
/// <param name="Longitude">Longitude in decimal degrees.</param>
/// <param name="AddressLine">Street address part (number + street).</param>
/// <param name="Suburb">Suburb / town / locality part.</param>
/// <param name="Postcode">Postal code part.</param>
public record AddressSuggestion(
    string Label,
    double Latitude,
    double Longitude,
    string? AddressLine = null,
    string? Suburb = null,
    string? Postcode = null);
