namespace Steeple.Api.Configuration;
/// <summary>
/// Geocoding adapter config (SYSTEM_DESIGN §10). No key = the dev stub (beachhead center);
/// a key selects the Google Geocoding adapter. The gateway is only ever called server-side on
/// provider address entry — never on the public request path.
/// </summary>
public class GeocodingOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Geocoding";

    /// <summary>Google Geocoding API key (deployment-supplied; metered SKU).</summary>
    public string GoogleApiKey { get; set; } = "";

    /// <summary>State/region token appended to the address string sent for geocoding (beachhead default).</summary>
    public string Region { get; set; } = "VA";
}
