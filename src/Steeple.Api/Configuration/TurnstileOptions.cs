
namespace Steeple.Api.Configuration;
/// <summary>
/// Cloudflare Turnstile server-side verification config. Production must explicitly select
/// enabled or disabled; enabled mode requires the deployment secret.
/// </summary>
public sealed class TurnstileOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Turnstile";

    /// <summary>Explicit abuse-check mode: <c>enabled</c> or <c>disabled</c>.</summary>
    public string Mode { get; set; } = "";

    /// <summary>Siteverify secret key; empty disables verification.</summary>
    public string SecretKey { get; set; } = "";

    /// <summary>Whether verification is active; omitted mode retains Development's secret inference.</summary>
    public bool IsEnabled =>
        string.Equals(Mode, "enabled", StringComparison.OrdinalIgnoreCase)
        || (string.IsNullOrWhiteSpace(Mode) && !string.IsNullOrWhiteSpace(SecretKey));
}
