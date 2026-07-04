using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Steeple.Web.Configuration;

namespace Steeple.Web.Controllers;
/// <summary>
/// Mobile deep-link association files (CONTRACTS §9): Universal Links (iOS) and App Links
/// (Android) both require a well-known, unauthenticated JSON file at the site root proving this
/// domain is allowed to open the app for the canonical listing URL
/// (<c>https://&lt;host&gt;/space/{venueSlug}/{roomSlug}</c>). Config-driven; absent config (dev
/// default) 404s rather than serving a bogus association.
/// </summary>
public sealed class WellKnownController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Listing paths the app should intercept instead of opening the web page.</summary>
    private static readonly string[] AppLinkPaths = ["/space/*"];

    private readonly DeepLinksOptions _options;

    /// <summary>Creates the controller.</summary>
    public WellKnownController(IOptions<DeepLinksOptions> options) => _options = options.Value;

    /// <summary>Apple's Universal Links association file. No file extension — Content-Type is set explicitly.</summary>
    [HttpGet("/.well-known/apple-app-site-association")]
    public IActionResult AppleAppSiteAssociation()
    {
        if (string.IsNullOrEmpty(_options.AppleAppId))
        {
            return NotFound();
        }

        var body = JsonSerializer.Serialize(
            new
            {
                applinks = new
                {
                    details = new[]
                    {
                        new { appID = _options.AppleAppId, paths = AppLinkPaths },
                    },
                },
            },
            JsonOptions);

        return Content(body, "application/json");
    }

    /// <summary>Android's App Links association file.</summary>
    [HttpGet("/.well-known/assetlinks.json")]
    public IActionResult AssetLinks()
    {
        if (string.IsNullOrEmpty(_options.AndroidPackage) || _options.AndroidSha256Fingerprints.Count == 0)
        {
            return NotFound();
        }

        var body = JsonSerializer.Serialize(
            new[]
            {
                new
                {
                    relation = new[] { "delegate_permission/common.handle_all_urls" },
                    target = new
                    {
                        @namespace = "android_app",
                        package_name = _options.AndroidPackage,
                        sha256_cert_fingerprints = _options.AndroidSha256Fingerprints,
                    },
                },
            },
            JsonOptions);

        return Content(body, "application/json");
    }
}
