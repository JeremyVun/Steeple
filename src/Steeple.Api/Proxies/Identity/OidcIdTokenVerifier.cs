using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Steeple.Api.Proxies.Identity;
/// <summary>
/// Shared OIDC ID-token verification for the SSO providers: signing keys come from the provider's
/// published JWKS (fetched + cached + auto-refreshed by <see cref="ConfigurationManager{T}"/>),
/// then issuer / audience / lifetime / signature are validated and the nonce compared when either
/// side supplied one. Providers differ only in metadata address, accepted issuers/audiences, and
/// how display name / email fall out of the claims.
/// </summary>
public abstract class OidcIdTokenVerifier : IIdTokenVerifier
{
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _metadata;
    private readonly JsonWebTokenHandler _handler = new();
    private readonly ILogger _logger;

    /// <summary>Creates the verifier around the provider's OIDC discovery document.</summary>
    protected OidcIdTokenVerifier(string metadataAddress, HttpClient http, ILogger logger)
    {
        _metadata = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadataAddress,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever(http) { RequireHttps = true });
        _logger = logger;
    }

    /// <inheritdoc />
    public abstract AuthProvider Provider { get; }

    /// <summary>Issuer values accepted for this provider.</summary>
    protected abstract IReadOnlyCollection<string> ValidIssuers { get; }

    /// <summary>Audience (client id) values accepted for this provider.</summary>
    protected abstract IReadOnlyCollection<string> ValidAudiences { get; }

    /// <inheritdoc />
    public async Task<VerifiedIdentity?> VerifyAsync(string idToken, string? nonce, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(idToken))
        {
            return null;
        }

        if (ValidAudiences.Count == 0)
        {
            // Fail closed: an environment that hasn't configured the provider's client ids must
            // not accept its tokens.
            _logger.LogWarning("Rejected {Provider} ID token: no client ids configured.", Provider);
            return null;
        }

        OpenIdConnectConfiguration config;
        try
        {
            config = await _metadata.GetConfigurationAsync(ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not fetch {Provider} OIDC metadata/JWKS.", Provider);
            return null;
        }

        var result = await _handler.ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidIssuers = ValidIssuers,
            ValidAudiences = ValidAudiences,
            IssuerSigningKeys = config.SigningKeys,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
        }).ConfigureAwait(false);

        if (!result.IsValid)
        {
            _logger.LogWarning(result.Exception, "Rejected {Provider} ID token.", Provider);
            return null;
        }

        var claims = result.Claims;

        // Bind the token to the sign-in attempt: when the client supplied a nonce, or the token
        // carries one, the two must match (replay protection for the mobile/Apple-web flows).
        var tokenNonce = GetString(claims, "nonce");
        if ((nonce ?? tokenNonce) is not null && !string.Equals(nonce, tokenNonce, StringComparison.Ordinal))
        {
            _logger.LogWarning("Rejected {Provider} ID token: nonce mismatch.", Provider);
            return null;
        }

        var subject = GetString(claims, "sub");
        if (string.IsNullOrEmpty(subject))
        {
            return null;
        }

        return ToIdentity(subject, claims);
    }

    /// <summary>Extracts email / display name per provider conventions.</summary>
    protected abstract VerifiedIdentity ToIdentity(string subject, IDictionary<string, object> claims);

    /// <summary>Reads a claim as a string, tolerating non-string claim values.</summary>
    protected static string? GetString(IDictionary<string, object> claims, string key) =>
        claims.TryGetValue(key, out var value) ? value?.ToString() : null;

    /// <summary>Reads a boolean claim that providers variously encode as bool or "true"/"false".</summary>
    protected static bool GetBool(IDictionary<string, object> claims, string key) =>
        claims.TryGetValue(key, out var value) && value switch
        {
            bool b => b,
            string s => bool.TryParse(s, out var parsed) && parsed,
            _ => false,
        };
}
