using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Identity;
/// <summary>Verifies "Sign in with Google" ID tokens against Google's published JWKS.</summary>
public sealed class GoogleIdTokenVerifier : OidcIdTokenVerifier
{
    private readonly AuthOptions _options;

    /// <summary>Creates the verifier.</summary>
    public GoogleIdTokenVerifier(HttpClient http, IOptions<AuthOptions> options, ILogger<GoogleIdTokenVerifier> logger)
        : base("https://accounts.google.com/.well-known/openid-configuration", http, logger)
    {
        _options = options.Value;
    }

    /// <inheritdoc />
    public override AuthProvider Provider => AuthProvider.Google;

    /// <inheritdoc />
    // Google historically issues both forms.
    protected override IReadOnlyCollection<string> ValidIssuers { get; } =
        ["https://accounts.google.com", "accounts.google.com"];

    /// <inheritdoc />
    protected override IReadOnlyCollection<string> ValidAudiences => _options.Google.ClientIds;

    /// <inheritdoc />
    protected override VerifiedIdentity ToIdentity(string subject, IDictionary<string, object> claims)
    {
        // Only trust the email when Google says it is verified.
        var email = GetBool(claims, "email_verified") ? GetString(claims, "email") : null;
        return new VerifiedIdentity(subject, email, GetString(claims, "name"));
    }
}
