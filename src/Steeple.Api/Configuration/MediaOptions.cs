namespace Steeple.Api.Configuration;
/// <summary>
/// Media storage config (SYSTEM_DESIGN §9). Mode selects S3-compatible object storage or the
/// local-disk Development adapter served by the API at <c>/media</c>.
/// </summary>
public class MediaOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Media";

    /// <summary>Storage mode: <c>objectStorage</c> or <c>development</c>.</summary>
    public string Mode { get; set; } = "";

    /// <summary>S3-compatible endpoint, e.g. <c>https://syd1.digitaloceanspaces.com</c>. Empty = local disk.</summary>
    public string ServiceUrl { get; set; } = "";

    /// <summary>Bucket (Space) name.</summary>
    public string Bucket { get; set; } = "";

    /// <summary>Access key id (deployment-supplied).</summary>
    public string AccessKey { get; set; } = "";

    /// <summary>Secret access key (deployment-supplied).</summary>
    public string SecretKey { get; set; } = "";

    /// <summary>
    /// Public base URL for object-storage photos — the Spaces CDN edge in production
    /// (e.g. <c>https://steeple-media.syd1.cdn.digitaloceanspaces.com</c>). Local-disk mode
    /// deliberately ignores this value and stores document-relative <c>media/&lt;key&gt;</c> paths.
    /// </summary>
    public string PublicBaseUrl { get; set; } = "";

    /// <summary>Local-disk root for dev uploads, relative to the content root.</summary>
    public string LocalRoot { get; set; } = "media-store";

    /// <summary>Whether every required S3/CDN setting is present.</summary>
    public bool HasObjectStorageConfiguration =>
        !string.IsNullOrEmpty(ServiceUrl) && !string.IsNullOrEmpty(Bucket)
        && !string.IsNullOrEmpty(AccessKey) && !string.IsNullOrEmpty(SecretKey)
        && !string.IsNullOrEmpty(PublicBaseUrl);

    /// <summary>Whether the S3 adapter should be used.</summary>
    public bool UseObjectStorage =>
        string.Equals(Mode, "objectStorage", StringComparison.OrdinalIgnoreCase)
        || (string.IsNullOrWhiteSpace(Mode) && HasObjectStorageConfiguration);
}
