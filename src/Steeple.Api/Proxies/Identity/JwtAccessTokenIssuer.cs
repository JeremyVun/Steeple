using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Steeple.Api.Proxies.Identity;
/// <summary>
/// Signs the API's own access tokens: short-lived HS256 JWTs carrying <c>sub</c> (user id) and
/// <c>sid</c> (session / refresh-family id), validated by the JwtBearer middleware.
/// </summary>
public sealed class JwtAccessTokenIssuer : IAccessTokenIssuer
{
    private readonly AuthOptions.JwtOptions _jwt;
    private readonly SigningCredentials _credentials;
    private readonly JsonWebTokenHandler _handler = new();
    private readonly TimeProvider _clock;

    /// <summary>Creates the issuer; throws at startup when the signing key is missing or too short.</summary>
    public JwtAccessTokenIssuer(IOptions<AuthOptions> options, TimeProvider clock)
    {
        _jwt = options.Value.Jwt;
        _credentials = new SigningCredentials(CreateSigningKey(_jwt), SecurityAlgorithms.HmacSha256);
        _clock = clock;
    }

    /// <inheritdoc />
    public string IssueAccessToken(User user, Guid sessionId)
    {
        var now = _clock.GetUtcNow().UtcDateTime;

        var claims = new Dictionary<string, object>
        {
            [JwtRegisteredClaimNames.Sub] = user.Id.ToString(),
            [JwtRegisteredClaimNames.Sid] = sessionId.ToString(),
            [JwtRegisteredClaimNames.Name] = user.DisplayName,
        };

        return _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _jwt.Issuer,
            Audience = _jwt.Audience,
            Claims = claims,
            NotBefore = now,
            Expires = now.AddMinutes(_jwt.AccessTokenMinutes),
            SigningCredentials = _credentials,
        });
    }

    /// <summary>Decodes and sanity-checks the configured symmetric key (shared with JwtBearer validation).</summary>
    public static SymmetricSecurityKey CreateSigningKey(AuthOptions.JwtOptions jwt)
    {
        if (string.IsNullOrWhiteSpace(jwt.SigningKey))
        {
            throw new InvalidOperationException(
                "Missing required configuration 'Auth:Jwt:SigningKey' (base64, >= 32 bytes).");
        }

        byte[] key;
        try
        {
            key = Convert.FromBase64String(jwt.SigningKey);
        }
        catch (FormatException)
        {
            throw new InvalidOperationException("'Auth:Jwt:SigningKey' must be base64.");
        }

        return key.Length >= 32
            ? new SymmetricSecurityKey(key)
            : throw new InvalidOperationException("'Auth:Jwt:SigningKey' must decode to at least 32 bytes.");
    }
}
