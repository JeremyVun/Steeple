namespace Steeple.Api.Configuration;
/// <summary>
/// Geocoding adapter config (SYSTEM_DESIGN §10). Mode explicitly selects Apple Maps Server,
/// Google, or the Development stub. The gateway is only called server-side on provider address
/// entry — never on the public request path.
/// </summary>
public class GeocodingOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Geocoding";

    /// <summary>Adapter mode: <c>apple</c>, <c>google</c>, or <c>development</c>.</summary>
    public string Mode { get; set; } = "";

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

    /// <summary>Optional state/region token appended to the address string sent for geocoding.</summary>
    public string Region { get; set; } = "";

    /// <summary>
    /// ISO 3166 country codes (comma-separated) the provider limits results to; empty = worldwide.
    /// Interim scoping until results are biased by the requesting user's own country
    /// (open decision — docs/backlog/README.md).
    /// </summary>
    public string LimitToCountries { get; set; } = "";

    /// <summary>True when the Apple Maps Server credentials are complete.</summary>
    public bool HasAppleCredentials =>
        !string.IsNullOrWhiteSpace(AppleTeamId) &&
        !string.IsNullOrWhiteSpace(AppleKeyId) &&
        !string.IsNullOrWhiteSpace(ApplePrivateKey);

    /// <summary>Whether Apple Maps is the selected adapter.</summary>
    public bool UseApple =>
        string.Equals(Mode, "apple", StringComparison.OrdinalIgnoreCase)
        || (string.IsNullOrWhiteSpace(Mode) && HasAppleCredentials);

    /// <summary>Whether Google is selected after Apple has declined the request.</summary>
    public bool UseGoogle =>
        string.Equals(Mode, "google", StringComparison.OrdinalIgnoreCase)
        || (string.IsNullOrWhiteSpace(Mode) && !HasAppleCredentials && !string.IsNullOrWhiteSpace(GoogleApiKey));
}
