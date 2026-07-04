
namespace Steeple.Api.Configuration;
/// <summary>
/// Transactional email config (SYSTEM_DESIGN §8). With no <see cref="ApiKey"/> the gateway runs
/// in log-only mode (local dev / pre-provider environments) — the inbox row is still written, so
/// nothing is lost. Deployment supplies the key via <c>Email__ApiKey</c>.
/// </summary>
public sealed class EmailOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Email";

    /// <summary>Resend API key; empty = log-only mode (no external sends).</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>Sender, RFC 5322 (e.g. <c>Steeple &lt;hello@steeple.example&gt;</c>).</summary>
    public string From { get; set; } = "Steeple <onboarding@resend.dev>";

    /// <summary>
    /// Public web origin (+ any sub-path) used to build absolute links in email bodies,
    /// e.g. <c>https://example.com/steeple</c>. Empty = emails carry no links.
    /// </summary>
    public string WebBaseUrl { get; set; } = "";
}
