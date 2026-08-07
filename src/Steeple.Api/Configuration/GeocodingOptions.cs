namespace Steeple.Api.Configuration;
/// <summary>
/// Geocoding adapter config (SYSTEM_DESIGN §10). Provider selection: complete Apple credentials
/// pick the Apple Maps Server adapter (geocoding + autocomplete); otherwise a Google key picks the
/// Google adapter (geocoding only); otherwise the dev stub (beachhead center). The gateway is only
/// ever called server-side on provider address entry — never on the public request path.
/// </summary>
public class GeocodingOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Geocoding";

    /// <summary>Apple Developer Team ID (10 characters; Membership page).</summary>
    public string AppleTeamId { get; set; } = "";

    /// <summary>Apple Maps key ID (10 characters; identifies the private key).</summary>
    public string AppleKeyId { get; set; } = "";

    /// <summary>
    /// Apple Maps private key: the <c>.p8</c> file's contents, either full PEM or the bare
    /// base64 body (deployment-supplied secret — never committed).
    /// </summary>
    public string ApplePrivateKey { get; set; } = "";

    /// <summary>Google Geocoding API key (deployment-supplied; metered SKU).</summary>
    public string GoogleApiKey { get; set; } = "";

    /// <summary>State/region token appended to the address string sent for geocoding (beachhead default).</summary>
    public string Region { get; set; } = "VA";

    /// <summary>
    /// ISO 3166 country codes (comma-separated) the provider limits results to; empty = worldwide.
    /// Interim scoping until results are biased by the requesting user's own country
    /// (open decision — docs/backlog/README.md).
    /// </summary>
    public string LimitToCountries { get; set; } = "US";

    /// <summary>True when the Apple Maps Server credentials are complete.</summary>
    public bool HasAppleCredentials =>
        !string.IsNullOrWhiteSpace(AppleTeamId) &&
        !string.IsNullOrWhiteSpace(AppleKeyId) &&
        !string.IsNullOrWhiteSpace(ApplePrivateKey);
}
