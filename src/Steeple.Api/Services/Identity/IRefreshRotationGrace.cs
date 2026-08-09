
namespace Steeple.Api.Services.Identity;
/// <summary>
/// Port: the short-lived memory of the rotation that a refresh token was spent on.
///
/// Rotation with reuse detection assumes one client per family. A browser breaks that assumption:
/// two tabs share one session, both hold the same access token, and when it expires both 401 and
/// both present the same refresh token within milliseconds of each other. Exactly one may rotate —
/// the other is an honest client, not a thief, and must be handed the pair the winner got rather
/// than having the family revoked under it (SYSTEM_DESIGN §17).
///
/// The stored tokens are hashed, so the successor's raw value cannot be re-derived from the
/// database: the winner's answer has to be remembered in the process that produced it, for as long
/// as the grace window lasts and no longer.
/// </summary>
public interface IRefreshRotationGrace
{
    /// <summary>
    /// Runs one committed rotation for <paramref name="presentedTokenHash"/>. Concurrent callers
    /// await the same task; the successor is published only after <paramref name="rotation"/>
    /// completes. A fault reaches every waiter and evicts the entry so a later request can retry.
    /// </summary>
    Task<RefreshResponse> RotateAsync(
        string presentedTokenHash,
        Guid userId,
        Guid familyId,
        Func<Task<RefreshResponse>> rotation,
        CancellationToken ct = default);

    /// <summary>The committed answer, or in-flight task, for a token rotated inside the grace window.</summary>
    Task<RefreshResponse>? Recall(string presentedTokenHash);

    /// <summary>
    /// Forgets every claim in a family. Called when the family is revoked — a grace entry must never
    /// hand out a pair for a session that has just been killed.
    /// </summary>
    void ForgetFamily(Guid familyId);

    /// <summary>
    /// Forgets every claim this person holds. Called by "sign out everywhere" and by account
    /// deletion, which revoke families this method's caller cannot enumerate.
    /// </summary>
    void ForgetUser(Guid userId);
}
