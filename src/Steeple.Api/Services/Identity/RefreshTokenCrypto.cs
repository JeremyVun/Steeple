using System.Security.Cryptography;

namespace Steeple.Api.Services.Identity;
/// <summary>
/// Opaque refresh-token generation and hashing. The raw token (256-bit, base64url) goes to the
/// client only; the database stores its SHA-256 hex so a DB leak cannot mint sessions.
/// </summary>
public static class RefreshTokenCrypto
{
    /// <summary>Generates a new 256-bit opaque token, base64url-encoded.</summary>
    public static string GenerateToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    /// <summary>Lowercase SHA-256 hex of a token — the stored lookup key.</summary>
    public static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
