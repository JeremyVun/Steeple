using Microsoft.Extensions.Options;

namespace Steeple.Api.Proxies.Identity;
/// <summary>Verifies "Sign in with Apple" ID tokens against Apple's published JWKS.</summary>
public sealed class AppleIdTokenVerifier : OidcIdTokenVerifier
{
    private readonly AuthOptions _options;

    /// <summary>Creates the verifier.</summary>
    public AppleIdTokenVerifier(HttpClient http, IOptions<AuthOptions> options, ILogger<AppleIdTokenVerifier> logger)
        : base("https://appleid.apple.com/.well-known/openid-configuration", http, logger)
    {
        _options = options.Value;
    }

    /// <inheritdoc />
    public override AuthProvider Provider => AuthProvider.Apple;

    /// <inheritdoc />
    protected override IReadOnlyCollection<string> ValidIssuers { get; } = ["https://appleid.apple.com"];

    /// <inheritdoc />
    // The Services ID (web) and the app bundle id (mobile) both appear as `aud`.
    protected override IReadOnlyCollection<string> ValidAudiences => _options.Apple.ClientIds;

    /// <inheritdoc />
    protected override VerifiedIdentity ToIdentity(string subject, IDictionary<string, object> claims)
    {
        // Apple: email may be a private-relay address; the user's name never appears in the token
        // (it arrives once in the authorization response — the session request's DisplayName hint).
        var email = GetBool(claims, "email_verified") ? GetString(claims, "email") : null;
        return new VerifiedIdentity(subject, email, DisplayName: null);
    }
}
