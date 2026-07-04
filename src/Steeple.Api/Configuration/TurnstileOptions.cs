
namespace Steeple.Api.Configuration;
/// <summary>
/// Cloudflare Turnstile server-side verification config. When <see cref="SecretKey"/> is empty
/// the check is disabled (local dev / pre-Cloudflare environments) — deployment supplies the
/// secret via <c>Turnstile__SecretKey</c>.
/// </summary>
public sealed class TurnstileOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Turnstile";

    /// <summary>Siteverify secret key; empty disables verification.</summary>
    public string SecretKey { get; set; } = "";
}
