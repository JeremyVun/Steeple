
namespace Steeple.Api.Configuration;
/// <summary>
/// Identity module configuration: the API's own token issuance plus the accepted SSO audiences.
/// Bound from the "Auth" section (env override: <c>Auth__Jwt__SigningKey</c> etc.).
/// </summary>
public sealed class AuthOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Auth";

    /// <summary>Access-token (JWT) issuance settings.</summary>
    public JwtOptions Jwt { get; set; } = new();

    /// <summary>Idle expiry for refresh tokens, in days (SYSTEM_DESIGN §6: ~90).</summary>
    public int RefreshTokenDays { get; set; } = 90;

    /// <summary>
    /// How long a just-rotated refresh token still answers with its successor instead of being
    /// treated as theft. Browsers open the same session in several tabs and each one may 401 at the
    /// same instant; without a grace window the second tab's honest retry revokes the family
    /// (SYSTEM_DESIGN §17 — refresh-rotation grace). Seconds; 0 disables the grace entirely.
    /// </summary>
    public int RefreshReuseGraceSeconds { get; set; } = 30;

    /// <summary>
    /// Name of the httpOnly cookie carrying the refresh token for browser clients
    /// (<c>refreshTransport: "cookie"</c>). Mobile keeps the token in the response body.
    /// </summary>
    public string RefreshCookieName { get; set; } = "steeple_refresh";

    /// <summary>Google SSO verification settings.</summary>
    public ProviderOptions Google { get; set; } = new();

    /// <summary>Apple SSO verification settings.</summary>
    public ProviderOptions Apple { get; set; } = new();

    /// <summary>Settings for the short-lived access JWT the API signs itself.</summary>
    public sealed class JwtOptions
    {
        /// <summary>
        /// Symmetric signing key (base64, ≥32 bytes). Required — the API fails to start without
        /// it so a misconfigured Production deployment fails closed rather than issuing
        /// unverifiable tokens.
        /// </summary>
        public string SigningKey { get; set; } = "";

        /// <summary>Issuer claim for self-issued tokens.</summary>
        public string Issuer { get; set; } = "steeple-api";

        /// <summary>Audience claim for self-issued tokens.</summary>
        public string Audience { get; set; } = "steeple";

        /// <summary>Access-token lifetime in minutes (SYSTEM_DESIGN §6: ~15).</summary>
        public int AccessTokenMinutes { get; set; } = 15;
    }

    /// <summary>Per-provider ID-token acceptance: which <c>aud</c> values we trust.</summary>
    public sealed class ProviderOptions
    {
        /// <summary>
        /// Accepted OAuth client ids for this provider (web client id, mobile client ids, Apple
        /// Services ID + app bundle id). An ID token whose <c>aud</c> is not listed is rejected.
        /// </summary>
        public List<string> ClientIds { get; set; } = [];
    }
}
