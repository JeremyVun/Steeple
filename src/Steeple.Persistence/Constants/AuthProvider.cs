
namespace Steeple.Persistence.Constants;
/// <summary>The SSO identity provider that vouches for a user login (SYSTEM_DESIGN §6 — SSO only, no passwords).</summary>
public enum AuthProvider
{
    /// <summary>Sign in with Google.</summary>
    Google = 1,

    /// <summary>Sign in with Apple.</summary>
    Apple = 2,
}
