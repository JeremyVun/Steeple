
namespace Steeple.Api.Services.Identity;
/// <summary>
/// Port: persistence for the Identity module (users, SSO logins, refresh tokens, agreements).
/// Each method is a complete unit of work — it saves before returning.
/// </summary>
public interface IIdentityRepository
{
    /// <summary>Finds the login for an SSO identity, with its user loaded. Null when never seen.</summary>
    Task<UserLogin?> FindLoginAsync(AuthProvider provider, string subject, CancellationToken ct = default);

    /// <summary>True when a *different, non-deleted* user already holds this email (any provider).</summary>
    Task<bool> EmailBelongsToAnotherUserAsync(string email, CancellationToken ct = default);

    /// <summary>Creates a user together with its first SSO login.</summary>
    Task<User> CreateUserWithLoginAsync(User user, UserLogin login, CancellationToken ct = default);

    /// <summary>Loads a user with agreements. Null when unknown.</summary>
    Task<User?> GetUserAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Persists a new refresh token row.</summary>
    Task AddRefreshTokenAsync(RefreshToken token, CancellationToken ct = default);

    /// <summary>Finds a refresh token by its SHA-256 hash, with its user loaded.</summary>
    Task<RefreshToken?> FindRefreshTokenAsync(string tokenHash, CancellationToken ct = default);

    /// <summary>Atomically revokes <paramref name="current"/> and stores its successor (one rotation step).</summary>
    Task ReplaceRefreshTokenAsync(RefreshToken current, RefreshToken next, CancellationToken ct = default);

    /// <summary>Revokes every unrevoked token in a family (sign-out, or reuse detected).</summary>
    Task RevokeFamilyAsync(Guid familyId, CancellationToken ct = default);

    /// <summary>Revokes every unrevoked token the user holds (sign out everywhere / account deletion).</summary>
    Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Records acceptance of a document version. Idempotent per (user, doc, version).</summary>
    Task RecordAgreementAsync(Guid userId, AgreementDocType docType, string version, CancellationToken ct = default);

    /// <summary>
    /// Anonymizes the user (clears PII, marks deleted), removes its SSO logins, and revokes all
    /// refresh tokens. Agreements are kept — they are legal records.
    /// </summary>
    Task AnonymizeUserAsync(Guid userId, CancellationToken ct = default);
}
