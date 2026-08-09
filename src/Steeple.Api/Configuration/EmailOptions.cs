
namespace Steeple.Api.Configuration;
/// <summary>
/// Transactional email config (SYSTEM_DESIGN §8). Production explicitly selects Resend;
/// Development can select disabled/no-send while the inbox row remains the record of truth.
/// </summary>
public sealed class EmailOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Email";

    /// <summary>Production mode selecting Resend delivery; <c>disabled</c> is Development-only.</summary>
    public string Mode { get; set; } = "";

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

    /// <summary>Whether external delivery is active, with legacy key inference only outside validated Production.</summary>
    public bool DeliveryEnabled =>
        (string.Equals(Mode, "resend", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(ApiKey))
        || (string.IsNullOrWhiteSpace(Mode) && !string.IsNullOrWhiteSpace(ApiKey));
}
