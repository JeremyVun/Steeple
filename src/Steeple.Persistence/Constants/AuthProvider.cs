
namespace Steeple.Persistence.Constants;
/// <summary>The SSO identity provider that vouches for a user login (SYSTEM_DESIGN §6 — SSO only, no passwords).</summary>
public enum AuthProvider
{
    /// <summary>Sign in with Google.</summary>
    Google = 1,

    /// <summary>Sign in with Apple.</summary>
    Apple = 2,

    /// <summary>
    /// Development-only test sign-in (local dev loop + automated playtests). Its verifier is
    /// registered only when <c>Auth:DevLoginEnabled</c> is true — set solely in
    /// <c>appsettings.Development.json</c>, never base config — so production rejects the token.
    /// </summary>
    Dev = 100,
}
