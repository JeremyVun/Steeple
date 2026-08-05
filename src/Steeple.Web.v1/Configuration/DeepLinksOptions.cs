namespace Steeple.Web.Configuration;
/// <summary>
/// Universal Links / App Links config for the mobile deep-link well-known files ("DeepLinks"
/// section, CONTRACTS §9). Absent config (dev default) means the corresponding well-known
/// endpoint answers 404 instead of serving a bogus association file.
/// </summary>
public sealed class DeepLinksOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "DeepLinks";

    /// <summary>Apple app id, "TEAMID.bundleId" form. Empty disables <c>/.well-known/apple-app-site-association</c>.</summary>
    public string AppleAppId { get; set; } = "";

    /// <summary>Android application package id. Empty disables <c>/.well-known/assetlinks.json</c>.</summary>
    public string AndroidPackage { get; set; } = "";

    /// <summary>SHA-256 certificate fingerprints for the Android app's signing key(s). Empty disables the assetlinks file.</summary>
    public List<string> AndroidSha256Fingerprints { get; set; } = [];
}
