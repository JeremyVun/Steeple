namespace Steeple.Api.Contracts.Manage;
/// <summary>
/// One address-autocomplete suggestion for the venue address form (CONTRACTS §6): a
/// human-readable label, the coordinate the provider resolved it to, and — when the provider
/// breaks the address down — the parts that map onto the form's three address fields.
/// </summary>
public sealed record AddressSuggestionDto(
    string Label,
    double Latitude,
    double Longitude,
    string? AddressLine,
    string? Suburb,
    string? Postcode);
