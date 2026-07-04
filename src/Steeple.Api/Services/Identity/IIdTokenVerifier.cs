
namespace Steeple.Api.Services.Identity;
/// <summary>
/// Port: verifies a provider-signed ID token (signature via JWKS, issuer, audience, expiry,
/// nonce) and extracts the identity claims. One implementation per <see cref="AuthProvider"/>;
/// the identity service picks by provider.
/// </summary>
public interface IIdTokenVerifier
{
    /// <summary>The provider whose tokens this verifier accepts.</summary>
    AuthProvider Provider { get; }

    /// <summary>
    /// Verifies <paramref name="idToken"/>, returning the extracted identity or null when the
    /// token is invalid for any reason (bad signature, wrong audience, expired, nonce mismatch).
    /// </summary>
    Task<VerifiedIdentity?> VerifyAsync(string idToken, string? nonce, CancellationToken ct = default);
}

/// <summary>Claims extracted from a successfully verified provider ID token.</summary>
/// <param name="Subject">The provider's stable <c>sub</c> for this user.</param>
/// <param name="Email">Verified email when the provider supplied one (Apple may use private relay).</param>
/// <param name="DisplayName">Display name when present in the token (Google only — Apple tokens carry none).</param>
public sealed record VerifiedIdentity(string Subject, string? Email, string? DisplayName);
