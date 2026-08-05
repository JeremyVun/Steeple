
namespace Steeple.Web.Configuration;
/// <summary>
/// Cloudflare Turnstile widget configuration ("Turnstile" section). Web only renders the widget
/// (site key is public); the response token is forwarded to the API, which holds the secret.
/// Empty site key = widget not rendered (local dev / pre-Cloudflare environments).
/// </summary>
public sealed class TurnstileClientOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Turnstile";

    /// <summary>The public widget site key; empty disables the widget.</summary>
    public string SiteKey { get; set; } = "";
}
