
namespace Steeple.Api.Configuration;
/// <summary>
/// Transactional email config (SYSTEM_DESIGN §8). With no <see cref="ApiKey"/> the gateway runs
/// in no-send mode (local dev / pre-provider environments) — the inbox row is still written, so
/// nothing is lost. Deployment supplies the key via <c>Email__ApiKey</c>.
/// </summary>
public sealed class EmailOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Email";

    /// <summary>Resend API key; empty = no-send mode (no external sends or private-content logs).</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>Sender, RFC 5322 (e.g. <c>Steeple &lt;hello@steeple.example&gt;</c>).</summary>
    public string From { get; set; } = "Steeple <onboarding@resend.dev>";

    /// <summary>
    /// Public web origin (+ any sub-path) used to build absolute links in email bodies,
    /// e.g. <c>https://example.com/steeple</c>. Empty = emails carry no links.
    /// </summary>
    public string WebBaseUrl { get; set; } = "";

    /// <summary>
    /// Captures every send into a browsable dev mailbox at <c>/dev/mailbox</c> (the local loop has
    /// no real inbox to click a CTA in). Development-only by construction: base appsettings omits
    /// it, so deployed environments neither capture nor expose anything.
    /// </summary>
    public bool DevMailboxEnabled { get; set; }
}
