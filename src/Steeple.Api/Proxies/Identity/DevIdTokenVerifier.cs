
namespace Steeple.Api.Proxies.Identity;
/// <summary>
/// Development-only <see cref="IIdTokenVerifier"/> for the local dev loop and automated
/// playtests: the "ID token" is just <c>email</c> or <c>email|Display Name</c> — no signature,
/// no issuer. Registered only when <c>Auth:DevLoginEnabled</c> is true, which lives solely in
/// <c>appsettings.Development.json</c>; base config omits it, so no deployed environment can
/// accept these tokens (an unregistered provider fails closed in <c>IdentityService</c>).
/// </summary>
public sealed class DevIdTokenVerifier : IIdTokenVerifier
{
    /// <inheritdoc />
    public AuthProvider Provider => AuthProvider.Dev;

    /// <inheritdoc />
    public Task<VerifiedIdentity?> VerifyAsync(string idToken, string? nonce, CancellationToken ct = default)
    {
        var parts = (idToken ?? "").Split('|', 2);
        var email = parts[0].Trim().ToLowerInvariant();
        if (email.Length is 0 or > 320 || !email.Contains('@'))
        {
            return Task.FromResult<VerifiedIdentity?>(null);
        }

        var displayName = parts.Length > 1 && !string.IsNullOrWhiteSpace(parts[1]) ? parts[1].Trim() : null;
        // Subject keyed on the email keeps repeat dev sign-ins landing on the same account.
        return Task.FromResult<VerifiedIdentity?>(new VerifiedIdentity($"dev:{email}", email, displayName));
    }
}
