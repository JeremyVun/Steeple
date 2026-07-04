namespace Steeple.Api.Configuration;
/// <summary>
/// Media storage config (SYSTEM_DESIGN §9). With Spaces settings present the S3 adapter is used;
/// otherwise uploads land on local disk and the API serves them at <c>/media</c> (dev loop).
/// </summary>
public class MediaOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Media";

    /// <summary>S3-compatible endpoint, e.g. <c>https://syd1.digitaloceanspaces.com</c>. Empty = local disk.</summary>
    public string ServiceUrl { get; set; } = "";

    /// <summary>Bucket (Space) name.</summary>
    public string Bucket { get; set; } = "";

    /// <summary>Access key id (deployment-supplied).</summary>
    public string AccessKey { get; set; } = "";

    /// <summary>Secret access key (deployment-supplied).</summary>
    public string SecretKey { get; set; } = "";

    /// <summary>
    /// Public base URL photos are served from — the Spaces CDN edge in production
    /// (e.g. <c>https://steeple-media.syd1.cdn.digitaloceanspaces.com</c>), or the API's own
    /// origin in dev (local-disk mode appends <c>/media/&lt;key&gt;</c>).
    /// </summary>
    public string PublicBaseUrl { get; set; } = "";

    /// <summary>Local-disk root for dev uploads, relative to the content root.</summary>
    public string LocalRoot { get; set; } = "media-store";

    /// <summary>Whether the S3 adapter should be used.</summary>
    public bool UseObjectStorage =>
        !string.IsNullOrEmpty(ServiceUrl) && !string.IsNullOrEmpty(Bucket)
        && !string.IsNullOrEmpty(AccessKey) && !string.IsNullOrEmpty(SecretKey);
}
